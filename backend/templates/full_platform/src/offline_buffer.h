#pragma once
#include <Arduino.h>

class OfflineBuffer {
public:
    void begin();
    void store(const String& jsonLine);   // Called when MQTT is down
    bool hasData() const;
    size_t flush(std::function<bool(const String&)> publishFn);  // Returns count flushed
    void clear();

private:
    bool _fsReady = false;
    size_t _currentSize = 0;
};

extern OfflineBuffer offlineBuffer;
