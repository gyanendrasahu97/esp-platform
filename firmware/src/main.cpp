/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║            ESP Platform Firmware — main.cpp                  ║
 * ║  Edit this file to add your sensors, controls, and logic.    ║
 * ║  All WiFi/MQTT/OTA/BLE/offline-buffer code is in the lib.    ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

#include <ESPPlatform.h>

// ── YOUR PIN DEFINITIONS ────────────────────────────────────────────
#define LED_PIN     2   // GPIO 2 = built-in LED on most ESP32 dev boards
// #define RELAY_PIN   5
// #define TEMP_PIN    4

void setup() {
    // 1. Register your dashboard / mobile UI controls
    Platform.addSwitch("LED",         "set_led");
    Platform.addButton("Blink 3×",    "blink");
    Platform.addSensor("Temperature", "temperature", "°C");
    Platform.addSensor("Humidity",    "humidity",    "%");
    Platform.addButton("Restart",     "restart");

    // 2. Start the platform (WiFi / MQTT / BLE provisioning)
    Platform.begin();

    // 3. Your hardware init
    pinMode(LED_PIN, OUTPUT);
}

void loop() {
    // Must be called every loop — drives WiFi, MQTT, OTA, offline buffer
    Platform.loop();

    // Publish telemetry every 5 seconds
    static unsigned long t = 0;
    if (millis() - t >= 5000) {
        Platform.publish("temperature", 22.5f);   // replace with real sensor read
        Platform.publish("humidity",    65.0f);
        t = millis();
    }
}

// ── COMMAND HANDLER ────────────────────────────────────────────────
// Called when the dashboard or mobile app sends a command to this device.
//
//  'action' — the action string defined in addSwitch / addButton / addSlider
//  'params' — full JSON object, e.g. {"action":"set_led","value":true}
//
void onCommand(const String& action, JsonObject params) {
    if (action == "set_led")  digitalWrite(LED_PIN, (bool)params["value"]);
    if (action == "blink") {
        for (int i = 0; i < 3; i++) {
            digitalWrite(LED_PIN, HIGH); delay(200);
            digitalWrite(LED_PIN, LOW);  delay(200);
        }
    }
    if (action == "restart") ESP.restart();
}
