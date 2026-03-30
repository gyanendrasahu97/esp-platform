#include "rules_engine.h"
#include "ntp_clock.h"
#include <Arduino.h>

void RulesEngine::loadRules(const String& json) {
    _rules.clear();
    JsonDocument doc;
    if (deserializeJson(doc, json) != DeserializationError::Ok) {
        Serial.println("[Rules] JSON parse error");
        return;
    }
    JsonArray arr = doc["rules"].as<JsonArray>();
    for (JsonObject obj : arr) _parseRule(obj);
    Serial.printf("[Rules] Loaded %u rules\n", (unsigned)_rules.size());
}

void RulesEngine::_parseRule(JsonObject obj) {
    Rule rule;
    rule.id = obj["id"] | String(random(10000));

    JsonObject trig = obj["trigger"];
    rule.trigger.type = trig["type"] | "";
    rule.trigger.key  = trig["key"]  | "";
    rule.trigger.op   = trig["op"]   | "gt";
    rule.trigger.threshold  = trig["threshold"]  | 0.0f;
    rule.trigger.threshold2 = trig["threshold2"] | 0.0f;
    rule.trigger.intervalMs = trig["interval_ms"] | 0UL;
    rule.trigger.timeHour   = trig["hour"]   | -1;
    rule.trigger.timeMinute = trig["minute"] | -1;
    if (trig.containsKey("value")) {
        rule.trigger.matchValue = true;
        rule.trigger.boolValue  = trig["value"].as<bool>();
    }

    JsonArray acts = obj["actions"].as<JsonArray>();
    for (JsonObject a : acts) rule.actions.push_back(_parseAction(a));

    _rules.push_back(rule);
}

RuleAction RulesEngine::_parseAction(JsonObject obj) {
    RuleAction a;
    a.type = obj["type"] | "";
    a.key  = obj["key"]  | "";
    a.msg  = obj["msg"]  | "";
    a.ms   = obj["ms"]   | 0UL;

    if (obj.containsKey("value")) {
        JsonVariant v = obj["value"];
        if (v.is<const char*>()) {
            a.valueStr = v.as<String>();
        } else if (v.is<bool>()) {
            a.valueIsBool = true;
            a.valueBool   = v.as<bool>();
        } else {
            a.valueFloat = v.as<float>();
        }
    }
    return a;
}

void RulesEngine::tick() {
    unsigned long now = millis();

    // Execute any pending delayed actions
    for (auto& rule : _rules) {
        auto& pending = rule.pending;
        for (int i = (int)pending.size() - 1; i >= 0; i--) {
            if (now >= pending[i].first) {
                _executeAction(pending[i].second, 0);
                pending.erase(pending.begin() + i);
            }
        }
    }

    // Fire timer triggers
    for (auto& rule : _rules) {
        if (rule.trigger.type == "timer" && rule.trigger.intervalMs > 0) {
            if (now - rule.lastFireMs >= rule.trigger.intervalMs) {
                rule.lastFireMs = now;
                _executeActions(rule, 0);
            }
        }
    }

    // Fire time-of-day triggers (requires NTP sync)
    if (ntpClock.isSynced()) {
        struct tm t = ntpClock.getLocalTime();
        int currentMinute = t.tm_hour * 60 + t.tm_min;
        for (auto& rule : _rules) {
            if (rule.trigger.type != "time") continue;
            bool hourMatch   = (rule.trigger.timeHour   == -1 || rule.trigger.timeHour   == t.tm_hour);
            bool minuteMatch = (rule.trigger.timeMinute == -1 || rule.trigger.timeMinute == t.tm_min);
            if (hourMatch && minuteMatch && rule.lastFiredMinute != currentMinute) {
                rule.lastFiredMinute = currentMinute;
                _executeActions(rule, 0);
            }
        }
    }
}

void RulesEngine::onBoot() {
    for (auto& rule : _rules) {
        if (rule.trigger.type == "boot") _executeActions(rule, 0);
    }
}

void RulesEngine::onCommand(const String& key, bool value) {
    for (auto& rule : _rules) {
        if (rule.trigger.type != "command") continue;
        if (rule.trigger.key != key) continue;
        if (rule.trigger.matchValue && rule.trigger.boolValue != value) continue;
        _executeActions(rule, value ? 1.0f : 0.0f);
    }
}

void RulesEngine::onCommand(const String& key, float value) {
    for (auto& rule : _rules) {
        if (rule.trigger.type != "command") continue;
        if (rule.trigger.key != key) continue;
        _executeActions(rule, value);
    }
}

void RulesEngine::onTelemetry(const String& key, float value) {
    for (auto& rule : _rules) {
        if (rule.trigger.type != "telemetry") continue;
        if (rule.trigger.key != key) continue;

        bool fire = false;
        const String& op = rule.trigger.op;
        float t = rule.trigger.threshold;
        if      (op == "gt")      fire = (value >  t);
        else if (op == "lt")      fire = (value <  t);
        else if (op == "eq")      fire = (value == t);
        else if (op == "gte")     fire = (value >= t);
        else if (op == "lte")     fire = (value <= t);
        else if (op == "between") fire = (value >= t && value <= rule.trigger.threshold2);

        if (fire) _executeActions(rule, value);
    }
}

void RulesEngine::_executeActions(Rule& rule, float triggerValue) {
    unsigned long delay_acc = 0;
    for (const auto& action : rule.actions) {
        if (action.type == "delay_ms") {
            delay_acc += action.ms;
        } else if (delay_acc > 0) {
            // Schedule this action after accumulated delay
            rule.pending.push_back({millis() + delay_acc, action});
        } else {
            _executeAction(action, triggerValue);
        }
    }
}

void RulesEngine::_executeAction(const RuleAction& action, float triggerValue) {
    if (action.type == "gpio_write") {
        if (!_gpioWrite) return;
        bool val = action.valueIsBool ? action.valueBool : (action.valueFloat != 0);
        if (action.valueStr == "$value") val = (triggerValue != 0);
        _gpioWrite(action.key, val);

    } else if (action.type == "publish") {
        float val = action.valueFloat;
        if (action.valueStr == "$millis") val = (float)millis();
        if (action.valueStr == "$value")  val = triggerValue;
        if (_publish) _publish(action.key, val);

    } else if (action.type == "log") {
        Serial.printf("[Rule] %s\n", action.msg.c_str());

    } else if (action.type == "restart") {
        Serial.println("[Rule] Restart triggered");
        delay(500);
        ESP.restart();
    }
}
