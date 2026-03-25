#include "mqtt_client.h"
#include "config.h"
#include <PubSubClient.h>
#include <WiFi.h>

MqttClient mqttClient;

static WiFiClient _wifiClient;
static PubSubClient _pubsub(_wifiClient);
static MqttClient* _instance = nullptr;

void MqttClient::begin(const String& broker, int port, const String& deviceToken) {
    // Guard against redundant begin() calls with the same config
    if (_initialized && _broker == broker && _port == port && _deviceToken == deviceToken) {
        return;
    }

    // If already connected with different config, disconnect first
    if (_initialized) {
        disconnect();
    }

    _broker = broker;
    _port = port;
    _deviceToken = deviceToken;
    _instance = this;
    _initialized = true;

    _pubsub.setServer(broker.c_str(), port);
    _pubsub.setBufferSize(MQTT_MAX_PACKET_SIZE);
    _pubsub.setKeepAlive(MQTT_KEEPALIVE_S);
    _pubsub.setCallback(_onRawMessage);
}

void MqttClient::_connect() {
    Serial.printf("[MQTT] Connecting to %s:%d as %s...\n",
                  _broker.c_str(), _port, _deviceToken.substring(0, 8).c_str());
    _state = MqttState::CONNECTING;

    // LWT: publish "offline" to status topic when connection drops unexpectedly
    String statusTopic = "devices/" + _deviceToken + "/status";
    bool ok = _pubsub.connect(
        _deviceToken.c_str(),  // client ID
        _deviceToken.c_str(),  // username (device auth)
        "",                    // password (empty for MVP)
        statusTopic.c_str(),   // LWT topic
        1,                     // LWT QoS
        true,                  // LWT retain
        "offline",             // LWT message
        false                  // cleanSession=false → broker queues QoS1 commands while offline
    );

    if (ok) {
        _state = MqttState::CONNECTED;
        _retryDelayMs = MQTT_RECONNECT_BASE_MS;
        Serial.println("[MQTT] Connected!");

        // Announce online
        _pubsub.publish(statusTopic.c_str(), "online", true);
        _resubscribe();
    } else {
        Serial.printf("[MQTT] Failed, rc=%d\n", _pubsub.state());
        _state = MqttState::FAILED;
        _scheduleRetry();
    }
}

void MqttClient::_resubscribe() {
    String commandsTopic = "devices/" + _deviceToken + "/commands";
    String otaTopic      = "devices/" + _deviceToken + "/ota";
    _pubsub.subscribe(commandsTopic.c_str(), 1);
    _pubsub.subscribe(otaTopic.c_str(), 1);
    Serial.println("[MQTT] Subscribed to commands + ota topics");
}

void MqttClient::loop() {
    if (_state == MqttState::CONNECTED || _state == MqttState::CONNECTING) {
        if (!_pubsub.connected()) {
            if (_state == MqttState::CONNECTED) {
                Serial.println("[MQTT] Connection lost");
            }
            _state = MqttState::DISCONNECTED;
            _scheduleRetry();
        } else {
            _pubsub.loop();
        }
    } else if (_state == MqttState::DISCONNECTED || _state == MqttState::FAILED) {
        if (millis() >= _nextRetryMs) {
            _connect();
        }
    }
}

bool MqttClient::publish(const String& topic, const String& payload, bool retained) {
    if (!_pubsub.connected()) return false;
    bool ok = _pubsub.publish(topic.c_str(), payload.c_str(), retained);
    if (!ok) {
        Serial.printf("[MQTT] Publish failed on topic: %s\n", topic.c_str());
    }
    return ok;
}

bool MqttClient::isConnected() const {
    return _state == MqttState::CONNECTED && _pubsub.connected();
}

void MqttClient::_scheduleRetry() {
    _nextRetryMs = millis() + _retryDelayMs;
    _retryDelayMs = min(_retryDelayMs * 2, (unsigned long)MQTT_RECONNECT_MAX_MS);
    Serial.printf("[MQTT] Retry in %lu ms\n", _retryDelayMs);
}

void MqttClient::disconnect() {
    if (_pubsub.connected()) {
        _pubsub.disconnect();
    }
    _state = MqttState::DISCONNECTED;
    _retryDelayMs = MQTT_RECONNECT_BASE_MS;
    _nextRetryMs = 0;
    Serial.println("[MQTT] Disconnected (clean)");
}

void MqttClient::_onRawMessage(char* topic, uint8_t* payload, unsigned int length) {
    if (!_instance || !_instance->_callback) return;
    String t(topic);
    String p;
    p.reserve(length);
    for (unsigned int i = 0; i < length; i++) p += (char)payload[i];
    _instance->_callback(t, p);
}
