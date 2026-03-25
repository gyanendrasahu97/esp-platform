#include "control_handler.h"
#include "config.h"
#include <ArduinoJson.h>

ControlHandler controlHandler;

void ControlHandler::begin() {
    pinMode(LED_PIN, OUTPUT);
    Serial.println("[Control] Control handler initialized");
}

void ControlHandler::handle(const String& topic, const String& payload) {
    Serial.printf("[Control] Received on %s: %s\n", topic.c_str(), payload.c_str());

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, payload);
    if (err) {
        Serial.printf("[Control] JSON parse error: %s\n", err.c_str());
        return;
    }

    String action = doc["action"] | "";
    JsonVariant value = doc["value"];

    // ---- Built-in actions ----
    if (action == "set_led") {
        bool on = value.as<bool>();
        digitalWrite(LED_PIN, on ? HIGH : LOW);
        Serial.printf("[Control] LED -> %s\n", on ? "ON" : "OFF");

    } else if (action == "blink") {
        int times = value.as<int>();
        if (times <= 0) times = 3;
        for (int i = 0; i < times; i++) {
            digitalWrite(LED_PIN, HIGH); delay(200);
            digitalWrite(LED_PIN, LOW);  delay(200);
        }

    } else if (action == "restart") {
        Serial.println("[Control] Restarting by command...");
        delay(500);
        ESP.restart();

    } else {
        // ---- Custom actions: add your own here ----
        Serial.printf("[Control] Unknown action: %s\n", action.c_str());
    }
}
