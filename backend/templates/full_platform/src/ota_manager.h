#pragma once
#include <Arduino.h>

class OtaManager {
public:
    void begin(const String& backendUrl, const String& deviceToken);
    void checkAndApply();   // Call periodically (every 5 min)
    void applyFromUrl(const String& url, const String& expectedChecksum = "");

private:
    String _backendUrl;
    String _deviceToken;
};

extern OtaManager otaManager;
