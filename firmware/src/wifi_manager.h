#pragma once
#include <Arduino.h>

enum class WiFiState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    FAILED,
};

class WiFiManager {
public:
    void begin(const String& ssid, const String& password);
    void loop();
    bool isConnected() const;
    WiFiState getState() const { return _state; }
    String getIP() const;

private:
    String _ssid;
    String _password;
    WiFiState _state = WiFiState::DISCONNECTED;
    unsigned long _nextRetryMs = 0;
    unsigned long _retryDelayMs = 1000;
    int _retryCount = 0;

    void _connect();
    void _onConnected();
    void _scheduleRetry();
};

extern WiFiManager wifiManager;
