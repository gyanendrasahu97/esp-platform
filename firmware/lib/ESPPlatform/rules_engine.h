#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>
#include <vector>
#include <functional>

// ── Rules Engine ───────────────────────────────────────────────────────────────
// Receives a JSON rules definition via MQTT (devices/{token}/rules, retain=true)
// and evaluates them at runtime — no reflash needed to change device logic.
//
// Rule format:
// {
//   "rules": [
//     {
//       "id": "auto_off",
//       "trigger": {"type": "command",   "key": "relay", "value": true},
//       "trigger": {"type": "telemetry", "key": "temperature", "op": "gt", "threshold": 30},
//       "trigger": {"type": "timer",     "interval_ms": 5000},
//       "trigger": {"type": "boot"},
//       "actions": [
//         {"type": "gpio_write", "key": "relay", "value": true},
//         {"type": "delay_ms",   "ms": 1800000},
//         {"type": "gpio_write", "key": "relay", "value": false},
//         {"type": "publish",    "key": "uptime_ms", "value": "$millis"},
//         {"type": "log",        "msg": "Temperature too high!"},
//         {"type": "restart"}
//       ]
//     }
//   ]
// }

struct RuleAction {
    String type;       // gpio_write | publish | delay_ms | log | restart
    String key;        // for gpio_write, publish
    String valueStr;   // "$millis", "$value", or literal as string
    bool   valueBool = false;
    float  valueFloat = 0;
    bool   valueIsBool = false;
    unsigned long ms = 0;  // for delay_ms
    String msg;            // for log
};

struct RuleTrigger {
    String type;       // command | telemetry | timer | boot | time
    String key;        // for command / telemetry
    String op;         // for telemetry: gt | lt | eq | between
    float  threshold = 0;
    float  threshold2 = 0;  // for between
    bool   boolValue = false; // for command value match
    bool   matchValue = false; // if false, any value triggers
    unsigned long intervalMs = 0;  // for timer
    int    timeHour   = -1;  // for time trigger: 0-23 (-1 = any)
    int    timeMinute = -1;  // for time trigger: 0-59 (-1 = any)
};

struct Rule {
    String id;
    RuleTrigger trigger;
    std::vector<RuleAction> actions;
    // Timer state
    unsigned long lastFireMs = 0;
    int lastFiredMinute = -1;  // for time trigger — prevent double-fire within same minute
    // Pending delayed actions: {executeAtMs, actionIndex}
    std::vector<std::pair<unsigned long, RuleAction>> pending;
};

// Callbacks the rules engine calls back into ESPPlatform
using GpioWriteCallback  = std::function<void(const String& key, bool value)>;
using PublishCallback    = std::function<void(const String& key, float value)>;
using PublishBoolCallback= std::function<void(const String& key, bool value)>;

class RulesEngine {
public:
    void setGpioWriteCallback (GpioWriteCallback  cb)  { _gpioWrite  = cb; }
    void setPublishCallback   (PublishCallback    cb)  { _publish    = cb; }
    void setPublishBoolCallback(PublishBoolCallback cb) { _publishBool= cb; }

    // Load (or reload) rules from JSON string
    void loadRules(const String& json);

    // Call every loop()
    void tick();

    // Call when a command arrives — fires "command" trigger rules
    void onCommand(const String& key, bool value);
    void onCommand(const String& key, float value);

    // Call when telemetry arrives — fires "telemetry" trigger rules
    void onTelemetry(const String& key, float value);

    // Call once at startup after MQTT connects — fires "boot" trigger rules
    void onBoot();

    bool hasRules() const { return !_rules.empty(); }

private:
    std::vector<Rule> _rules;
    GpioWriteCallback  _gpioWrite;
    PublishCallback    _publish;
    PublishBoolCallback _publishBool;

    void _executeActions(Rule& rule, float triggerValue = 0);
    void _executeAction (const RuleAction& action, float triggerValue);
    void _parseRule     (JsonObject obj);
    RuleAction _parseAction(JsonObject obj);
};
