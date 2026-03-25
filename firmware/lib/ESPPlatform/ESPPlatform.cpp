#include "ESPPlatform.h"
#include "rules_engine.h"
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

    // Init registered output pins
    for (auto& p : _pins) {
        if (p.mode == PinMode_t::OUTPUT_DIGITAL) {
            pinMode(p.pin, OUTPUT);
            digitalWrite(p.pin, LOW);
        } else if (p.mode == PinMode_t::OUTPUT_PWM) {
            pinMode(p.pin, OUTPUT);
            analogWrite(p.pin, 0);
        } else {
            pinMode(p.pin, p.arduinoMode);
        }
    }

    // Set up rules engine callbacks
    if (!_rules) _rules = new RulesEngine();
    _rules->setGpioWriteCallback([this](const String& key, bool val) {
        _handlePinCommand(key, JsonVariant());  // handled via pin write helper
        for (auto& p : _pins) {
            if (p.key == key && (p.mode == PinMode_t::OUTPUT_DIGITAL || p.mode == PinMode_t::OUTPUT_PWM)) {
                if (p.mode == PinMode_t::OUTPUT_DIGITAL) {
                    digitalWrite(p.pin, val);
                    p.lastBool = val;
                    publish(p.key, val);
                }
                break;
            }
        }
    });
    _rules->setPublishCallback([this](const String& key, float val) {
        publish(key, val);
    });
    _rules->setPublishBoolCallback([this](const String& key, bool val) {
        publish(key, val);
    });

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
    // Always tick pins (works offline too — reads inputs even without MQTT)
    _tickPins();

    // Tick rules engine (timer triggers + pending delayed actions)
    if (_rules) _rules->tick();

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
                if (_rules) _rules->onBoot();
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
                // begin() is already called during initial WIFI_CONNECTING;
                // the guard inside begin() prevents re-initialization with
                // the same config, so just transition state and let loop()
                // drive the reconnect via mqtt_client's retry logic.
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

// ── Manual UI control registration ────────────────────────────────────────────

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

// Overloads with state binding
void ESPPlatform::addSwitch(const String& label, const String& action, bool* statePtr) {
    addSwitch(label, action);
    if (statePtr) _bindings.push_back({action, BindType::BOOL, statePtr});
}
void ESPPlatform::addSlider(const String& label, const String& action, float min, float max, float* statePtr) {
    addSlider(label, action, min, max);
    if (statePtr) _bindings.push_back({action, BindType::FLOAT, statePtr});
}

// ── GPIO Pin Registry ──────────────────────────────────────────────────────────

String ESPPlatform::_labelToKey(const String& label) {
    String key = label;
    key.toLowerCase();
    for (size_t i = 0; i < key.length(); i++) {
        if (key[i] == ' ') key[i] = '_';
    }
    return key;
}

void ESPPlatform::addOutput(const String& label, uint8_t pin) {
    String key = _labelToKey(label);
    _pins.push_back({pin, PinMode_t::OUTPUT_DIGITAL, key, label, "", 0, 1, OUTPUT, false, 0, 0});
    addSwitch(label, key);  // auto-generate switch control
}

void ESPPlatform::addInput(const String& label, uint8_t pin, uint8_t mode) {
    String key = _labelToKey(label);
    _pins.push_back({pin, PinMode_t::INPUT_DIGITAL, key, label, "", 0, 1, mode, false, 0, 0});
    addSensor(label, key);  // auto-generate sensor display
}

void ESPPlatform::addAnalog(const String& label, uint8_t pin, const String& unit, float rangeMin, float rangeMax) {
    String key = _labelToKey(label);
    _pins.push_back({pin, PinMode_t::INPUT_ANALOG, key, label, unit, rangeMin, rangeMax, INPUT, false, 0, 0});
    addSensor(label, key, unit);
}

void ESPPlatform::addPWM(const String& label, uint8_t pin, float rangeMin, float rangeMax) {
    String key = _labelToKey(label);
    _pins.push_back({pin, PinMode_t::OUTPUT_PWM, key, label, "%", rangeMin, rangeMax, OUTPUT, false, 0, 0});
    addSlider(label, key, rangeMin, rangeMax);
}

void ESPPlatform::_tickPins() {
    unsigned long now = millis();
    for (auto& p : _pins) {
        if (p.mode == PinMode_t::INPUT_DIGITAL) {
            if (now - p.lastReadMs >= 100) {
                p.lastReadMs = now;
                bool val = digitalRead(p.pin);
                if (val != p.lastBool) {
                    p.lastBool = val;
                    publish(p.key, val);
                    if (_rules) _rules->onTelemetry(p.key, val ? 1.0f : 0.0f);
                }
            }
        } else if (p.mode == PinMode_t::INPUT_ANALOG) {
            if (now - p.lastReadMs >= 1000) {
                p.lastReadMs = now;
                int raw = analogRead(p.pin);
                // Map 0-4095 → rangeMin-rangeMax
                float val = p.rangeMin + (raw / 4095.0f) * (p.rangeMax - p.rangeMin);
                val = roundf(val * 10) / 10.0f;  // 1 decimal place
                if (fabsf(val - p.lastFloat) >= 0.1f) {
                    p.lastFloat = val;
                    publish(p.key, val);
                    if (_rules) _rules->onTelemetry(p.key, val);
                }
            }
        }
    }
}

void ESPPlatform::_handlePinCommand(const String& key, JsonVariant value) {
    for (auto& p : _pins) {
        if (p.key != key) continue;
        if (p.mode == PinMode_t::OUTPUT_DIGITAL) {
            bool val = value.as<bool>();
            digitalWrite(p.pin, val);
            p.lastBool = val;
            publish(p.key, val);
        } else if (p.mode == PinMode_t::OUTPUT_PWM) {
            float pct = value.as<float>();
            pct = constrain(pct, p.rangeMin, p.rangeMax);
            int duty = (int)((pct - p.rangeMin) / (p.rangeMax - p.rangeMin) * 255);
            analogWrite(p.pin, duty);
            p.lastFloat = pct;
            publish(p.key, pct);
        }
        return;
    }
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
        if (action.isEmpty()) return;

        JsonVariant val = doc["value"];

        // 1. Check GPIO pin registry — handle automatically if it's a registered pin
        bool handledByPin = false;
        for (auto& p : _pins) {
            if (p.key == action &&
                (p.mode == PinMode_t::OUTPUT_DIGITAL || p.mode == PinMode_t::OUTPUT_PWM)) {
                _handlePinCommand(action, val);
                handledByPin = true;
                // Notify rules engine about this command
                if (_rules) _rules->onCommand(action, val.as<bool>());
                break;
            }
        }

        // 2. Check state bindings (addSwitch/addSlider with pointer)
        for (auto& b : _bindings) {
            if (b.action == action) {
                if (b.type == BindType::BOOL)  *((bool*)b.ptr)  = val.as<bool>();
                if (b.type == BindType::FLOAT) *((float*)b.ptr) = val.as<float>();
                if (b.type == BindType::INT)   *((int*)b.ptr)   = val.as<int>();
                break;
            }
        }

        // 3. Call user hook (always, so user can add logic on top of GPIO)
        onCommand(action, doc.as<JsonObject>());

        // 4. Auto-publish bound state
        for (auto& b : _bindings) {
            if (b.action == action) {
                if (b.type == BindType::BOOL)  publish(action, *((bool*)b.ptr));
                if (b.type == BindType::FLOAT) publish(action, *((float*)b.ptr));
                if (b.type == BindType::INT)   publish(action, *((int*)b.ptr));
                break;
            }
        }

        // 5. If not a pin command, still notify rules engine
        if (!handledByPin && _rules) _rules->onCommand(action, val.as<bool>());

    } else if (topic.endsWith("/ota")) {
        JsonDocument doc;
        deserializeJson(doc, payload);
        String url = doc["url"] | "";
        String chk = doc["checksum"] | "";
        if (!url.isEmpty()) {
            Serial.printf("[OTA] Push received: %s\n", url.c_str());
            otaManager.applyFromUrl(url, chk);
        }

    } else if (topic.endsWith("/rules")) {
        Serial.println("[Rules] Received new rules JSON");
        if (_rules) _rules->loadRules(payload);
    }
}
