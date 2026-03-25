/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║            ESP Platform Firmware — main.cpp                  ║
 * ║  Edit this file to add your sensors, controls, and logic.    ║
 * ║  All WiFi/MQTT/OTA/BLE/offline-buffer code is in the lib.    ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * GPIO PIN REGISTRY (Blynk-style) — no onCommand needed for basic GPIO:
 *
 *   Platform.addOutput("Relay",  5);          // digital out → switch UI
 *   Platform.addOutput("LED",    2);          // digital out → switch UI
 *   Platform.addInput ("Button", 0, INPUT_PULLUP); // digital in → sensor UI
 *   Platform.addAnalog("Soil",   34, "moisture", "%"); // analog → sensor UI
 *   Platform.addPWM   ("Fan",    6,  0, 100); // PWM out → slider UI
 *
 * Platform automatically reads inputs, handles output commands, and publishes
 * state to the dashboard. Use onCommand() only for custom logic.
 */

#include <ESPPlatform.h>

void setup() {
    // ── Register GPIO pins (Blynk-style) ──────────────────────────────────────
    Platform.addOutput("LED",         2);    // GPIO2 = built-in LED on most boards
    Platform.addButton("Blink 3×",   "blink");  // custom action (handled in onCommand)
    Platform.addSensor("Temperature", "temperature", "°C");
    Platform.addSensor("Humidity",    "humidity",    "%");
    Platform.addButton("Restart",     "restart");

    // ── Start the platform (WiFi / MQTT / BLE provisioning) ───────────────────
    Platform.begin();
}

void loop() {
    Platform.loop();   // GPIO reads, WiFi, MQTT, OTA, offline buffer, rules engine

    // Publish sensor telemetry every 5 seconds
    static unsigned long t = 0;
    if (millis() - t >= 5000) {
        Platform.publish("temperature", 22.5f);  // replace with real sensor read
        Platform.publish("humidity",    65.0f);
        t = millis();
    }
}

// ── Custom command handler ────────────────────────────────────────────────────
// Only needed for actions NOT covered by the pin registry.
// Registered pins (addOutput, addInput, etc.) are handled automatically.
//
void onCommand(const String& action, JsonObject params) {
    if (action == "blink") {
        // Non-blocking blink example (use millis, never delay!)
        // See: Platform.addButton + state machine in loop() for real implementation
    }
    if (action == "restart") ESP.restart();
}
