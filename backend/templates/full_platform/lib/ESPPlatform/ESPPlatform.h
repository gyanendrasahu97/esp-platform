#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <vector>

// ── UI control descriptor ──────────────────────────────────────────────────────
struct UiControl {
    String type;    // "switch" | "button" | "slider" | "sensor" | "gauge"
    String label;
    String action;  // for switch / button / slider
    String key;     // for sensor / gauge
    String unit;
    float  min;
    float  max;
};

// ── ESPPlatform facade ─────────────────────────────────────────────────────────
class ESPPlatform {
public:
    // Call once in setup() — loads NVS credentials → starts BLE or WiFi/MQTT
    void begin();

    // Call every loop() — drives WiFi reconnect, MQTT, OTA, offline buffer flush
    void loop();

    // Publish a single telemetry key-value (buffered if MQTT is down)
    bool publish(const String& key, float  value);
    bool publish(const String& key, int    value);
    bool publish(const String& key, bool   value);
    bool publish(const String& key, const String& value);

    // Register dashboard / mobile UI controls (call before or after begin())
    void addSwitch(const String& label, const String& action);
    void addButton(const String& label, const String& action);
    void addSlider(const String& label, const String& action, float min = 0, float max = 100);
    void addSensor(const String& label, const String& key,    const String& unit = "");
    void addGauge (const String& label, const String& key,    float min = 0, float max = 100);

    // true when WiFi + MQTT are both online
    bool isConnected() const;

    // Accessible from main.cpp if needed
    String _deviceToken;
    String _backendUrl;

private:
    enum class AppState {
        BOOT, BLE_PROVISIONING, WIFI_CONNECTING,
        MQTT_CONNECTING, CONNECTED, OFFLINE_BUFFERING
    };
    AppState _state = AppState::BOOT;

    String _wifiSsid, _wifiPass, _mqttHost;
    unsigned long _lastOtaCheck    = 0;
    unsigned long _lastBufferFlush = 0;

    std::vector<UiControl> _controls;

    bool _loadCredentials();
    void _saveCredentials(const struct ProvisioningData& data);
    void _sendHeartbeat();
    void _publishUi();
    String _buildUiJson() const;
    void _flushBuffer();
    void _onMqttMessage(const String& topic, const String& payload);
    bool _publishDoc(JsonDocument& doc);
};

extern ESPPlatform Platform;

// ── User hook — define this in main.cpp ───────────────────────────────────────
// Called whenever the dashboard / mobile app sends a command to this device.
// 'action' is the action string from the UI control; 'params' is the full JSON object.
void onCommand(const String& action, JsonObject params);
