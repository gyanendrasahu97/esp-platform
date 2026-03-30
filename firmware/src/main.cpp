/**
 * ESP Platform — Minimal template
 *
 * Register only the pins you actually use.  Example:
 *   Platform.addOutput("Motor",  4);           // switch widget
 *   Platform.addInput ("Button", 15, INPUT_PULLUP); // sensor widget
 *   Platform.addAnalog("Temp",   36, "°C", 0, 50); // analog sensor
 *   Platform.addPWM   ("Fan",    25, 0, 100);       // slider widget
 *
 * GPIO notes:
 *   - GPIO 6–11: internal SPI flash — NEVER use
 *   - GPIO 0:    boot strap — avoid
 *   - GPIO 1/3:  UART TX/RX — avoid
 *   - GPIO 12:   boot strap (VDD_SDIO) — avoid or use carefully
 *   - ADC2 (0,2,4,12–15,25–27): conflict with WiFi — digital only
 *   - ADC1 (32–39): safe for analogRead while WiFi is active
 */

#include <ESPPlatform.h>

void setup() {
    // Early serial so crash traces are visible even before Platform.begin()
    Serial.begin(115200);
    delay(300);

    // ── Register only the pins you need ───────────────────────────────────────
    Platform.addOutput("LED", 2);       // built-in LED (most boards)

    // ── Start platform (WiFi / BLE / MQTT / OTA) ─────────────────────────────
    Platform.begin();
}

void loop() {
    Platform.loop();
}

// Only needed for custom actions not covered by the pin registry
void onCommand(const String& action, JsonObject params) {
    if (action == "restart") ESP.restart();
}
