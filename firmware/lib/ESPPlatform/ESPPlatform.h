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

// ── State binding — optional pointer for auto state-sync ──────────────────────
enum class BindType { BOOL, FLOAT, INT };
struct StateBinding {
    String    action;
    BindType  type;
    void*     ptr;
};

// ── GPIO Pin Registry — Blynk-style hardware binding ──────────────────────────
// Register physical pins once; platform reads inputs, handles output commands,
// and publishes state automatically — no onCommand() needed for basic GPIO.
enum class PinMode_t { OUTPUT_DIGITAL, INPUT_DIGITAL, INPUT_ANALOG, OUTPUT_PWM };

struct PinDef {
    uint8_t     pin;
    PinMode_t   mode;
    String      key;           // telemetry/action key (derived from label)
    String      label;
    String      unit;
    float       rangeMin;      // for analog/PWM (maps raw → user range)
    float       rangeMax;
    uint8_t     arduinoMode;   // INPUT, INPUT_PULLUP, INPUT_PULLDOWN
    bool        lastBool;      // last published value for digital
    float       lastFloat;     // last published value for analog/PWM
    unsigned long lastReadMs;  // for debouncing / interval reads
};

// ── Rules Engine forward declaration ──────────────────────────────────────────
class RulesEngine;

// ── ESPPlatform facade ─────────────────────────────────────────────────────────
class ESPPlatform {
public:
    // Call once in setup() — loads NVS credentials → starts BLE or WiFi/MQTT
    void begin();

    // Call every loop() — drives WiFi reconnect, MQTT, OTA, offline buffer flush,
    // GPIO reads, and rules engine ticks
    void loop();

    // Publish a single telemetry key-value (buffered if MQTT is down)
    bool publish(const String& key, float  value);
    bool publish(const String& key, int    value);
    bool publish(const String& key, bool   value);
    bool publish(const String& key, const String& value);

    // ── Manual UI controls (existing API — unchanged) ──────────────────────────
    void addSwitch(const String& label, const String& action);
    void addButton(const String& label, const String& action);
    void addSlider(const String& label, const String& action, float min = 0, float max = 100);
    void addSensor(const String& label, const String& key,    const String& unit = "");
    void addGauge (const String& label, const String& key,    float min = 0, float max = 100);

    // With state binding — platform sets variable + auto-publishes after onCommand()
    void addSwitch(const String& label, const String& action, bool*  statePtr);
    void addSlider(const String& label, const String& action, float min, float max, float* statePtr);

    // ── GPIO Pin Registry (Blynk-style) ───────────────────────────────────────
    // Platform auto-generates UI controls, reads inputs, handles output commands.
    // Key is derived from label: lowercase + spaces→underscores ("Fan Speed"→"fan_speed")
    //
    // Digital output — generates switch, handles commands, publishes state
    void addOutput(const String& label, uint8_t pin);
    //
    // Digital input  — generates sensor, reads every 100 ms, publishes on change
    void addInput (const String& label, uint8_t pin, uint8_t mode = INPUT);
    //
    // Analog input   — generates sensor, reads every 1 s, maps 0-4095 → rangeMin-rangeMax
    void addAnalog(const String& label, uint8_t pin,
                   const String& unit = "", float rangeMin = 0, float rangeMax = 100);
    //
    // PWM output     — generates slider (rangeMin-rangeMax → 0-255 duty), handles commands
    void addPWM   (const String& label, uint8_t pin, float rangeMin = 0, float rangeMax = 100);

    // true when WiFi + MQTT are both online
    bool isConnected() const;

    // Publish a log message to devices/{token}/logs (also prints to Serial)
    void log(const String& message);

    // ── NTP / Clock ────────────────────────────────────────────────────────────
    // Time is synced automatically after WiFi connects.
    // Set NTP_GMT_OFFSET_SEC in config.h for your timezone.
    bool   isTimeSynced()    const;  // true after first NTP sync
    time_t getUnixTime()     const;  // seconds since epoch (0 if not synced)
    String getIsoTimestamp() const;  // "2024-03-30T14:25:00Z" (UTC)

    // Accessible from main.cpp if needed
    String _deviceToken;
    String _backendUrl;

private:
    enum class AppState {
        BOOT, BLE_PROVISIONING, WIFI_CONNECTING,
        MQTT_CONNECTING, CONNECTED, OFFLINE_BUFFERING
    };
    AppState _state = AppState::BOOT;
    bool _provisioningDone = false;  // set in BLE callback, acted on in loop()

    String _wifiSsid, _wifiPass, _mqttHost;
    unsigned long _lastOtaCheck    = 0;
    unsigned long _lastBufferFlush = 0;

    std::vector<UiControl>    _controls;
    std::vector<StateBinding> _bindings;
    std::vector<PinDef>       _pins;

    RulesEngine* _rules = nullptr;

    // Pin helpers
    static String _labelToKey(const String& label);
    void _tickPins();
    void _handlePinCommand(const String& key, JsonVariant value);

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
// Called for commands that are NOT handled automatically by the pin registry.
// For registered pins, the platform already set the GPIO before calling this.
// Weak default = do nothing (no need to define if all GPIOs use pin registry).
void onCommand(const String& action, JsonObject params);
