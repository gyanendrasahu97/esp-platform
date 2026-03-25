/**
 * ESP Platform — ALL usable GPIO pins registered
 *
 * SKIPPED (reserved / unsafe):
 *   GPIO 0        — boot strapping pin (must be HIGH at boot)
 *   GPIO 1        — UART TX (Serial monitor)
 *   GPIO 3        — UART RX (Serial monitor)
 *   GPIO 6–11     — internal SPI flash (NEVER use)
 *
 * ADC NOTE: Only ADC1 pins (32–39) work reliably when WiFi is active.
 *           ADC2 pins (0,2,4,12–15,25–27) conflict with WiFi — do NOT use
 *           addAnalog() on those; use them as digital only.
 */

#include <ESPPlatform.h>

void setup() {

    // ── Digital Outputs ───────────────────────────────────────────────────────
    // addOutput(label, pin)  →  auto key = lowercase label
    // Platform handles ON/OFF commands, no onCommand needed
    Platform.addOutput("LED",       2);   // built-in LED (most boards)
    Platform.addOutput("Relay 1",   4);   // key = "relay_1"
    Platform.addOutput("Relay 2",   5);   // key = "relay_2"
    Platform.addOutput("Relay 3",  13);   // key = "relay_3"
    Platform.addOutput("Relay 4",  14);   // key = "relay_4"
    Platform.addOutput("Out 16",   16);   // key = "out_16"
    Platform.addOutput("Out 17",   17);   // key = "out_17"
    Platform.addOutput("Out 18",   18);   // key = "out_18"
    Platform.addOutput("Out 19",   19);   // key = "out_19"
    Platform.addOutput("Out 21",   21);   // key = "out_21"  (I2C SDA if using I2C)
    Platform.addOutput("Out 22",   22);   // key = "out_22"  (I2C SCL if using I2C)
    Platform.addOutput("Out 23",   23);   // key = "out_23"
    Platform.addOutput("Out 25",   25);   // key = "out_25"  (DAC1 capable)
    Platform.addOutput("Out 26",   26);   // key = "out_26"  (DAC2 capable)
    Platform.addOutput("Out 27",   27);   // key = "out_27"

    // ── PWM Outputs ───────────────────────────────────────────────────────────
    // addPWM(label, pin, min, max)  →  slider widget, maps min-max to 0–255 duty
    Platform.addPWM("PWM 32",      32,   0, 100);  // key = "pwm_32"
    Platform.addPWM("PWM 33",      33,   0, 100);  // key = "pwm_33"

    // ── Digital Inputs ────────────────────────────────────────────────────────
    // addInput(label, pin, mode)  →  sensor widget, publishes on change (100ms debounce)
    // modes: INPUT, INPUT_PULLUP, INPUT_PULLDOWN
    Platform.addInput("In 12",     12,   INPUT_PULLUP);  // key = "in_12"
    Platform.addInput("In 15",     15,   INPUT_PULLUP);  // key = "in_15"

    // ── Analog Inputs (ADC1 only — safe with WiFi) ───────────────────────────
    // addAnalog(label, pin, unit, rangeMin, rangeMax)
    // Reads every 1s, maps 0–4095 → rangeMin–rangeMax, publishes on change
    Platform.addAnalog("Analog 34", 34,  "raw",  0, 4095);  // key = "analog_34"
    Platform.addAnalog("Analog 35", 35,  "raw",  0, 4095);  // key = "analog_35"
    Platform.addAnalog("Analog 36", 36,  "raw",  0, 4095);  // key = "analog_36"  (VP)
    Platform.addAnalog("Analog 39", 39,  "raw",  0, 4095);  // key = "analog_39"  (VN)

    // ── Start platform ────────────────────────────────────────────────────────
    Platform.begin();
}

void loop() {
    Platform.loop();  // handles all GPIO, WiFi, MQTT, OTA, rules, offline buffer
}

// Only needed for custom actions not covered by pin registry above
void onCommand(const String& action, JsonObject params) {
    if (action == "restart") ESP.restart();
}
