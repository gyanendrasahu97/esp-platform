#pragma once
#include <Arduino.h>
#include <functional>

using MqttMessageCallback = std::function<void(const String& topic, const String& payload)>;

enum class MqttState {
    DISCONNECTED,
    CONNECTING,
    CONNECTED,
    FAILED,
};

class MqttClient {
public:
    void begin(const String& broker, int port, const String& deviceToken);
    void loop();
    bool publish(const String& topic, const String& payload, bool retained = false);
    void onMessage(MqttMessageCallback cb) { _callback = cb; }
    bool isConnected() const;
    MqttState getState() const { return _state; }

private:
    String _broker;
    int _port = 1883;
    String _deviceToken;
    MqttState _state = MqttState::DISCONNECTED;
    unsigned long _nextRetryMs = 0;
    unsigned long _retryDelayMs = 2000;
    MqttMessageCallback _callback;

    void _connect();
    void _scheduleRetry();
    void _resubscribe();
    static void _onRawMessage(char* topic, uint8_t* payload, unsigned int length);
};

extern MqttClient mqttClient;
