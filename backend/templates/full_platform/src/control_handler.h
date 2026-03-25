#pragma once
#include <Arduino.h>

class ControlHandler {
public:
    void begin();
    void handle(const String& topic, const String& payload);
};

extern ControlHandler controlHandler;
