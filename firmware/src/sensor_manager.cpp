#include "sensor_manager.h"
#include "config.h"

SensorManager sensorManager;

void SensorManager::begin() {
    // Initialize sensors here.
    // DHT22 example (uncomment and add DHT library if needed):
    // dht.begin();
    Serial.println("[Sensor] Sensor manager initialized (simulated mode)");
}

void SensorManager::readInto(JsonDocument& doc) {
    // --- Simulated readings (replace with real sensor reads) ---
    // For DHT22:
    //   float h = dht.readHumidity();
    //   float t = dht.readTemperature();
    //   doc["temperature"] = isnan(t) ? 0 : t;
    //   doc["humidity"]    = isnan(h) ? 0 : h;

    // Simulated for testing
    float temp = 20.0f + (float)(esp_random() % 100) / 10.0f;
    float hum  = 40.0f + (float)(esp_random() % 400) / 10.0f;

    doc["temperature"] = roundf(temp * 10) / 10.0f;
    doc["humidity"]    = roundf(hum  * 10) / 10.0f;
    doc["uptime_s"]    = millis() / 1000;
    doc["rssi"]        = WiFi.RSSI();
    doc["fw_version"]  = FIRMWARE_VERSION;
}
