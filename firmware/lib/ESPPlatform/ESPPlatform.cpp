#include "ESPPlatform.h"
#include "prebake_config.h"
#include "config.h"
#include "wifi_manager.h"
#include "mqtt_client.h"
#include "ble_provisioning.h"
#include "ota_manager.h"
#include "offline_buffer.h"

#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <Preferences.h>

ESPPlatform Platform;

// Weak default — user overrides by defining onCommand() in main.cpp
void __attribute__((weak)) onCommand(const String& action, JsonObject params) {}

static Preferences _prefs;

// ── Public API ─────────────────────────────────────────────────────────────────

void ESPPlatform::begin() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n\n===== ESP Platform v" FIRMWARE_VERSION " =====");

    offlineBuffer.begin();

    if (_loadCredentials()) {
        Serial.printf("[Boot] Credentials found. WiFi: %s, Token: %s...\n",
                      _wifiSsid.c_str(), _deviceToken.substring(0, 8).c_str());
        _state = AppState::WIFI_CONNECTING;
        wifiManager.begin(_wifiSsid, _wifiPass);
    } else {
        Serial.println("[Boot] No credentials — starting BLE provisioning");
        _state = AppState::BLE_PROVISIONING;

        bleProvisioning.begin("ESP-Platform", [this](const ProvisioningData& data) {
            _saveCredentials(data);
            bleProvisioning.stop();
            Serial.println("[Boot] Provisioning done — restarting...");
            delay(1000);
            ESP.restart();
        });
    }
}

void ESPPlatform::loop() {
    switch (_state) {

        case AppState::BLE_PROVISIONING:
            // BLE handled via callbacks
            break;

        case AppState::WIFI_CONNECTING:
            wifiManager.loop();
            if (wifiManager.isConnected()) {
                _state = AppState::MQTT_CONNECTING;
                _sendHeartbeat();
                mqttClient.begin(_mqttHost, DEFAULT_MQTT_PORT, _deviceToken);
                mqttClient.onMessage([this](const String& topic, const String& payload) {
                    _onMqttMessage(topic, payload);
                });
            } else if (wifiManager.getState() == WiFiState::FAILED) {
                _state = AppState::OFFLINE_BUFFERING;
            }
            break;

        case AppState::MQTT_CONNECTING:
            wifiManager.loop();
            mqttClient.loop();
            if (mqttClient.isConnected()) {
                _state = AppState::CONNECTED;
                _publishUi();
                _flushBuffer();
                otaManager.begin(_backendUrl, _deviceToken);
            } else if (!wifiManager.isConnected()) {
                _state = AppState::WIFI_CONNECTING;
            }
            break;

        case AppState::CONNECTED:
            wifiManager.loop();
            mqttClient.loop();
            if (!mqttClient.isConnected()) { _state = AppState::MQTT_CONNECTING; break; }
            if (!wifiManager.isConnected()) { _state = AppState::WIFI_CONNECTING; break; }
            if (millis() - _lastBufferFlush >= 10000) {
                _flushBuffer();
                _lastBufferFlush = millis();
            }
            if (millis() - _lastOtaCheck >= OTA_CHECK_INTERVAL_MS) {
                otaManager.checkAndApply();
                _lastOtaCheck = millis();
            }
            break;

        case AppState::OFFLINE_BUFFERING:
            wifiManager.loop();
            if (wifiManager.isConnected()) {
                _state = AppState::MQTT_CONNECTING;
                mqttClient.begin(_mqttHost, DEFAULT_MQTT_PORT, _deviceToken);
                mqttClient.onMessage([this](const String& topic, const String& payload) {
                    _onMqttMessage(topic, payload);
                });
            }
            break;

        default:
            break;
    }
}

bool ESPPlatform::publish(const String& key, float value) {
    JsonDocument doc;  doc[key] = value;  return _publishDoc(doc);
}
bool ESPPlatform::publish(const String& key, int value) {
    JsonDocument doc;  doc[key] = value;  return _publishDoc(doc);
}
bool ESPPlatform::publish(const String& key, bool value) {
    JsonDocument doc;  doc[key] = value;  return _publishDoc(doc);
}
bool ESPPlatform::publish(const String& key, const String& value) {
    JsonDocument doc;  doc[key] = value;  return _publishDoc(doc);
}

void ESPPlatform::addSwitch(const String& label, const String& action) {
    _controls.push_back({"switch", label, action, "", "", 0, 100});
}
void ESPPlatform::addButton(const String& label, const String& action) {
    _controls.push_back({"button", label, action, "", "", 0, 100});
}
void ESPPlatform::addSlider(const String& label, const String& action, float min, float max) {
    _controls.push_back({"slider", label, action, "", "", min, max});
}
void ESPPlatform::addSensor(const String& label, const String& key, const String& unit) {
    _controls.push_back({"sensor", label, "", key, unit, 0, 100});
}
void ESPPlatform::addGauge(const String& label, const String& key, float min, float max) {
    _controls.push_back({"gauge", label, "", key, "", min, max});
}

bool ESPPlatform::isConnected() const {
    return mqttClient.isConnected();
}

// ── Private helpers ────────────────────────────────────────────────────────────

bool ESPPlatform::_publishDoc(JsonDocument& doc) {
    String payload;
    serializeJson(doc, payload);
    String topic = "devices/" + _deviceToken + "/telemetry";
    if (mqttClient.isConnected()) {
        return mqttClient.publish(topic, payload);
    }
    offlineBuffer.store(payload);
    return false;
}

bool ESPPlatform::_loadCredentials() {
    _prefs.begin(NVS_NAMESPACE, true);
    _wifiSsid    = _prefs.getString(NVS_KEY_WIFI_SSID,    "");
    _wifiPass    = _prefs.getString(NVS_KEY_WIFI_PASS,    "");
    _mqttHost    = _prefs.getString(NVS_KEY_MQTT_HOST,    "");
    _deviceToken = _prefs.getString(NVS_KEY_DEVICE_TOKEN, "");
    _backendUrl  = _prefs.getString(NVS_KEY_BACKEND_URL,  "");
    _prefs.end();

    // Fall back to pre-baked credentials embedded at build time (via web editor)
#ifdef PREBAKE_WIFI_SSID
    if (_wifiSsid.isEmpty())    _wifiSsid    = String(PREBAKE_WIFI_SSID);
    if (_wifiPass.isEmpty())    _wifiPass    = String(PREBAKE_WIFI_PASS);
    if (_deviceToken.isEmpty()) _deviceToken = String(PREBAKE_DEVICE_TOKEN);
#endif

    if (_backendUrl.isEmpty()) _backendUrl = PLATFORM_BACKEND_URL;
    if (_mqttHost.isEmpty())   _mqttHost   = PLATFORM_MQTT_HOST;

    return !_wifiSsid.isEmpty() && !_deviceToken.isEmpty();
}

void ESPPlatform::_saveCredentials(const ProvisioningData& data) {
    _prefs.begin(NVS_NAMESPACE, false);
    _prefs.putString(NVS_KEY_WIFI_SSID,    data.wifiSsid);
    _prefs.putString(NVS_KEY_WIFI_PASS,    data.wifiPass);
    _prefs.putString(NVS_KEY_MQTT_HOST,    data.mqttHost);
    _prefs.putString(NVS_KEY_DEVICE_TOKEN, data.deviceToken);
    _prefs.putString(NVS_KEY_BACKEND_URL,  data.backendUrl);
    _prefs.end();
    Serial.println("[NVS] Credentials saved");
}

void ESPPlatform::_sendHeartbeat() {
    if (_backendUrl.isEmpty() || _deviceToken.isEmpty()) return;
    HTTPClient http;
    http.begin(_backendUrl + "/api/devices/heartbeat");
    http.addHeader("Content-Type", "application/json");

    JsonDocument doc;
    doc["device_token"]     = _deviceToken;
    doc["firmware_version"] = FIRMWARE_VERSION;
    doc["ip_address"]       = wifiManager.getIP();
    String body;
    serializeJson(doc, body);

    int code = http.POST(body);
    Serial.printf("[HTTP] Heartbeat -> %d\n", code);
    http.end();
}

void ESPPlatform::_publishUi() {
    mqttClient.publish("devices/" + _deviceToken + "/ui", _buildUiJson(), true);
}

String ESPPlatform::_buildUiJson() const {
    JsonDocument doc;
    doc["device_name"]      = DEVICE_NAME;
    doc["firmware_version"] = FIRMWARE_VERSION;
    doc["device_token"]     = _deviceToken;

    JsonArray arr = doc["controls"].to<JsonArray>();
    for (const auto& c : _controls) {
        JsonObject obj = arr.add<JsonObject>();
        obj["type"]  = c.type;
        obj["label"] = c.label;
        if (!c.action.isEmpty()) obj["action"] = c.action;
        if (!c.key.isEmpty())    obj["key"]    = c.key;
        if (!c.unit.isEmpty())   obj["unit"]   = c.unit;
        if (c.type == "slider" || c.type == "gauge") {
            obj["min"] = c.min;
            obj["max"] = c.max;
        }
    }

    String out;
    serializeJson(doc, out);
    return out;
}

void ESPPlatform::_flushBuffer() {
    if (!offlineBuffer.hasData()) return;
    String topic = "devices/" + _deviceToken + "/telemetry";
    size_t n = offlineBuffer.flush([&](const String& payload) {
        return mqttClient.publish(topic, payload);
    });
    if (n > 0) Serial.printf("[Buffer] Flushed %u records\n", n);
}

void ESPPlatform::_onMqttMessage(const String& topic, const String& payload) {
    if (topic.endsWith("/commands")) {
        JsonDocument doc;
        deserializeJson(doc, payload);
        String action = doc["action"] | "";
        if (!action.isEmpty()) {
            onCommand(action, doc.as<JsonObject>());
        }
    } else if (topic.endsWith("/ota")) {
        JsonDocument doc;
        deserializeJson(doc, payload);
        String url = doc["url"] | "";
        String chk = doc["checksum"] | "";
        if (!url.isEmpty()) {
            Serial.printf("[OTA] Push received: %s\n", url.c_str());
            otaManager.applyFromUrl(url, chk);
        }
    }
}
