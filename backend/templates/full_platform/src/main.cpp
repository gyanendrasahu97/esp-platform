/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║              ESP Platform Firmware - main.cpp                ║
 * ║   Edit this file to add sensors, controls and custom logic   ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * ── RUNTIME VARIABLES (loaded from NVS after BLE provisioning) ──
 *   g_deviceToken   Device's unique token (UUID)
 *   g_backendUrl    Backend URL  e.g. "https://esp.cruzanet.cloud"
 *   g_mqttHost      MQTT broker hostname
 *   g_wifiSsid      Connected WiFi SSID
 *
 * ── MQTT ────────────────────────────────────────────────────────
 *   mqttClient.publish(topic, payload)      Publish a message
 *   mqttClient.isConnected()                True if MQTT is online
 *   // Telemetry topic: "devices/" + g_deviceToken + "/telemetry"
 *   // Commands topic:  "devices/" + g_deviceToken + "/commands"
 *
 * ── SENSOR MANAGER ──────────────────────────────────────────────
 *   sensorManager.readInto(doc)    Fill an ArduinoJson doc with readings
 *   // Default fields: temperature, humidity, uptime_s, rssi, fw_version
 *   // Add your own sensor fields inside SensorManager::readInto()
 *
 * ── CONTROL HANDLER ─────────────────────────────────────────────
 *   controlHandler.handle(topic, payload)   Route incoming commands
 *   // Add custom actions inside ControlHandler::handle()
 *   // Built-in: set_led, blink, restart
 *
 * ── OFFLINE BUFFER ──────────────────────────────────────────────
 *   offlineBuffer.store(payload)    Buffer JSON when MQTT offline
 *   offlineBuffer.flush(publishFn)  Flush buffered records
 *   offlineBuffer.hasData()         True if buffer not empty
 *
 * ── UI DESCRIPTOR ───────────────────────────────────────────────
 *   buildUiDescriptor(g_deviceToken)   Build JSON for dashboard/app UI
 *   // Edit ui_descriptor.cpp to add/remove dashboard controls
 *
 * ── OTA MANAGER ─────────────────────────────────────────────────
 *   otaManager.checkAndApply()         Poll backend for firmware update
 *   otaManager.applyFromUrl(url, chk)  Apply OTA from URL directly
 *
 * ── CONFIGURABLE CONSTANTS (edit in config.h) ───────────────────
 *   LED_PIN                   2         Built-in LED (active HIGH)
 *   SENSOR_DHT_PIN            4         DHT22 data pin
 *   TELEMETRY_INTERVAL_MS     5000      Publish every 5 s
 *   OTA_CHECK_INTERVAL_MS     300000    OTA check every 5 min
 *   OFFLINE_BUFFER_MAX_BYTES  524288    Offline buffer limit (512 KB)
 *   FIRMWARE_VERSION          "1.0.0"   Firmware version string
 *   DEVICE_NAME               "ESP Platform Device"
 * ================================================================
 */

#include <Arduino.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>

#include "config.h"
#include "wifi_manager.h"
#include "mqtt_client.h"
#include "sensor_manager.h"
#include "control_handler.h"
#include "ota_manager.h"
#include "offline_buffer.h"
#include "ble_provisioning.h"
#include "ui_descriptor.h"

// ================================================================
//  USER CONFIGURATION  — change these to match your hardware
// ================================================================
// #undef  LED_PIN
// #define LED_PIN        5    // Override built-in LED pin
// #undef  SENSOR_DHT_PIN
// #define SENSOR_DHT_PIN 14   // Override DHT22 pin
// #undef  TELEMETRY_INTERVAL_MS
// #define TELEMETRY_INTERVAL_MS  10000  // Publish every 10 s instead
// ================================================================

// ---- State Machine ----
enum class AppState {
    BOOT,
    BLE_PROVISIONING,
    WIFI_CONNECTING,
    MQTT_CONNECTING,
    CONNECTED,
    OFFLINE_BUFFERING,
};

static AppState appState = AppState::BOOT;

// ---- Stored credentials (set by BLE provisioning, loaded from NVS) ----
static String g_wifiSsid, g_wifiPass;
static String g_mqttHost, g_deviceToken, g_backendUrl;

// ---- Timers ----
static unsigned long lastTelemetry   = 0;
static unsigned long lastOtaCheck    = 0;
static unsigned long lastBufferFlush = 0;

// ---- Preferences (NVS) ----
Preferences prefs;

bool loadCredentials() {
    prefs.begin(NVS_NAMESPACE, true);  // read-only
    g_wifiSsid    = prefs.getString(NVS_KEY_WIFI_SSID,    "");
    g_wifiPass    = prefs.getString(NVS_KEY_WIFI_PASS,    "");
    g_mqttHost    = prefs.getString(NVS_KEY_MQTT_HOST,    "");
    g_deviceToken = prefs.getString(NVS_KEY_DEVICE_TOKEN, "");
    g_backendUrl  = prefs.getString(NVS_KEY_BACKEND_URL,  "");
    prefs.end();

    return !g_wifiSsid.isEmpty() && !g_deviceToken.isEmpty();
}

void saveCredentials(const ProvisioningData& data) {
    prefs.begin(NVS_NAMESPACE, false);  // read-write
    prefs.putString(NVS_KEY_WIFI_SSID,    data.wifiSsid);
    prefs.putString(NVS_KEY_WIFI_PASS,    data.wifiPass);
    prefs.putString(NVS_KEY_MQTT_HOST,    data.mqttHost);
    prefs.putString(NVS_KEY_DEVICE_TOKEN, data.deviceToken);
    prefs.putString(NVS_KEY_BACKEND_URL,  data.backendUrl);
    prefs.end();
    Serial.println("[NVS] Credentials saved");
}

// ---- Backend heartbeat ----
void sendHeartbeat() {
    if (g_backendUrl.isEmpty() || g_deviceToken.isEmpty()) return;

    String url = g_backendUrl + "/api/devices/heartbeat";
    HTTPClient http;
    http.begin(url);
    http.addHeader("Content-Type", "application/json");

    JsonDocument doc;
    doc["device_token"]     = g_deviceToken;
    doc["firmware_version"] = FIRMWARE_VERSION;
    doc["ip_address"]       = wifiManager.getIP();

    String body;
    serializeJson(doc, body);

    int code = http.POST(body);
    Serial.printf("[HTTP] Heartbeat -> %d\n", code);
    http.end();
}

// ---- Telemetry publish (or buffer if offline) ----
void publishTelemetry() {
    JsonDocument doc;
    sensorManager.readInto(doc);
    doc["ts"] = millis() / 1000;  // Uptime seconds (replace with NTP time if available)

    String payload;
    serializeJson(doc, payload);

    String topic = "devices/" + g_deviceToken + "/telemetry";

    if (mqttClient.isConnected()) {
        mqttClient.publish(topic, payload);
    } else {
        offlineBuffer.store(payload);
        Serial.println("[Buffer] Telemetry stored offline");
    }
}

// ---- Flush offline buffer when MQTT is back ----
void flushOfflineBuffer() {
    if (!offlineBuffer.hasData()) return;
    String topic = "devices/" + g_deviceToken + "/telemetry";
    size_t flushed = offlineBuffer.flush([&](const String& payload) {
        return mqttClient.publish(topic, payload);
    });
    Serial.printf("[Buffer] Flushed %u records\n", flushed);
}

// ---- MQTT message handler ----
void onMqttMessage(const String& topic, const String& payload) {
    if (topic.endsWith("/commands")) {
        controlHandler.handle(topic, payload);
    } else if (topic.endsWith("/ota")) {
        // OTA push from backend
        JsonDocument doc;
        deserializeJson(doc, payload);
        String url = doc["url"] | "";
        String chk = doc["checksum"] | "";
        if (!url.isEmpty()) {
            Serial.printf("[OTA] Push received, applying from: %s\n", url.c_str());
            otaManager.applyFromUrl(url, chk);
        }
    }
}

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("\n\n===== ESP Platform v" FIRMWARE_VERSION " =====");

    controlHandler.begin();
    sensorManager.begin();
    offlineBuffer.begin();

    // BOOT: Check for stored credentials
    if (loadCredentials()) {
        Serial.printf("[Boot] Credentials found. WiFi: %s, Token: %s...\n",
                      g_wifiSsid.c_str(), g_deviceToken.substring(0, 8).c_str());
        appState = AppState::WIFI_CONNECTING;
        wifiManager.begin(g_wifiSsid, g_wifiPass);
    } else {
        Serial.println("[Boot] No credentials - starting BLE provisioning");
        appState = AppState::BLE_PROVISIONING;

        bleProvisioning.begin("ESP-Platform", [](const ProvisioningData& data) {
            saveCredentials(data);
            bleProvisioning.stop();
            Serial.println("[Boot] Provisioning done - restarting...");
            delay(1000);
            ESP.restart();
        });
    }
}

void loop() {
    switch (appState) {

        case AppState::BLE_PROVISIONING:
            // BLE handled via callbacks - nothing to do in loop
            break;

        case AppState::WIFI_CONNECTING:
            wifiManager.loop();
            if (wifiManager.isConnected()) {
                appState = AppState::MQTT_CONNECTING;

                // One-time actions on WiFi connect
                sendHeartbeat();

                // Init MQTT
                mqttClient.begin(g_mqttHost, DEFAULT_MQTT_PORT, g_deviceToken);
                mqttClient.onMessage(onMqttMessage);
            } else if (wifiManager.getState() == WiFiState::FAILED) {
                appState = AppState::OFFLINE_BUFFERING;
            }
            break;

        case AppState::MQTT_CONNECTING:
            wifiManager.loop();
            mqttClient.loop();

            if (mqttClient.isConnected()) {
                appState = AppState::CONNECTED;

                // Publish UI descriptor
                String uiJson = buildUiDescriptor(g_deviceToken);
                mqttClient.publish("devices/" + g_deviceToken + "/ui", uiJson, true);

                // Flush any offline data
                flushOfflineBuffer();

                // Init OTA
                otaManager.begin(g_backendUrl, g_deviceToken);
            } else if (!wifiManager.isConnected()) {
                appState = AppState::WIFI_CONNECTING;
            }
            break;

        case AppState::CONNECTED:
            wifiManager.loop();
            mqttClient.loop();

            // Handle disconnection
            if (!mqttClient.isConnected()) {
                appState = AppState::MQTT_CONNECTING;
                break;
            }
            if (!wifiManager.isConnected()) {
                appState = AppState::WIFI_CONNECTING;
                break;
            }

            // Telemetry
            if (millis() - lastTelemetry >= TELEMETRY_INTERVAL_MS) {
                publishTelemetry();
                lastTelemetry = millis();
            }

            // Flush offline buffer
            if (millis() - lastBufferFlush >= 10000) {
                flushOfflineBuffer();
                lastBufferFlush = millis();
            }

            // OTA check
            if (millis() - lastOtaCheck >= OTA_CHECK_INTERVAL_MS) {
                otaManager.checkAndApply();
                lastOtaCheck = millis();
            }
            break;

        case AppState::OFFLINE_BUFFERING:
            wifiManager.loop();

            // Keep trying to reconnect WiFi
            if (wifiManager.isConnected()) {
                appState = AppState::MQTT_CONNECTING;
                mqttClient.begin(g_mqttHost, DEFAULT_MQTT_PORT, g_deviceToken);
                mqttClient.onMessage(onMqttMessage);
                break;
            }

            // Buffer telemetry locally
            if (millis() - lastTelemetry >= TELEMETRY_INTERVAL_MS) {
                publishTelemetry();  // Will buffer since MQTT not connected
                lastTelemetry = millis();
            }
            break;

        default:
            break;
    }
}
