#include "ui_descriptor.h"
#include "config.h"
#include <ArduinoJson.h>

String buildUiDescriptor(const String& deviceToken) {
    JsonDocument doc;

    doc["device_name"]      = DEVICE_NAME;
    doc["firmware_version"] = FIRMWARE_VERSION;
    doc["device_token"]     = deviceToken;

    JsonArray controls = doc["controls"].to<JsonArray>();

    // ---- LED control ----
    JsonObject led = controls.add<JsonObject>();
    led["type"]   = "switch";
    led["label"]  = "LED";
    led["action"] = "set_led";
    led["key"]    = "led_state";

    // ---- Blink button ----
    JsonObject blink = controls.add<JsonObject>();
    blink["type"]   = "button";
    blink["label"]  = "Blink 3x";
    blink["action"] = "blink";

    // ---- Temperature sensor display ----
    JsonObject temp = controls.add<JsonObject>();
    temp["type"]  = "sensor";
    temp["label"] = "Temperature";
    temp["key"]   = "temperature";
    temp["unit"]  = "°C";

    // ---- Humidity sensor display ----
    JsonObject hum = controls.add<JsonObject>();
    hum["type"]  = "sensor";
    hum["label"] = "Humidity";
    hum["key"]   = "humidity";
    hum["unit"]  = "%";

    // ---- Restart button ----
    JsonObject restart = controls.add<JsonObject>();
    restart["type"]   = "button";
    restart["label"]  = "Restart";
    restart["action"] = "restart";

    String output;
    serializeJson(doc, output);
    return output;
}
