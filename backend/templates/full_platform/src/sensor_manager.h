#pragma once
#include <Arduino.h>
#include <ArduinoJson.h>

class SensorManager {
public:
    void begin();
    void readInto(JsonDocument& doc);
};

extern SensorManager sensorManager;
