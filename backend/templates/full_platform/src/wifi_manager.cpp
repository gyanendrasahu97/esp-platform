#include "wifi_manager.h"
#include "config.h"
#include <WiFi.h>

WiFiManager wifiManager;

void WiFiManager::begin(const String& ssid, const String& password) {
    _ssid = ssid;
    _password = password;
    _retryDelayMs = WIFI_RECONNECT_BASE_MS;
    _retryCount = 0;
    _connect();
}

void WiFiManager::_connect() {
    Serial.printf("[WiFi] Connecting to: %s\n", _ssid.c_str());
    _state = WiFiState::CONNECTING;
    WiFi.mode(WIFI_STA);
    WiFi.begin(_ssid.c_str(), _password.c_str());
}

void WiFiManager::loop() {
    wl_status_t status = WiFi.status();

    if (_state == WiFiState::CONNECTING) {
        if (status == WL_CONNECTED) {
            _onConnected();
        } else if (status == WL_CONNECT_FAILED || status == WL_NO_SSID_AVAIL) {
            Serial.println("[WiFi] Connection failed");
            _state = WiFiState::FAILED;
            _scheduleRetry();
        }
        // Still waiting - do nothing
    } else if (_state == WiFiState::CONNECTED) {
        if (status != WL_CONNECTED) {
            Serial.println("[WiFi] Connection lost, scheduling reconnect...");
            _state = WiFiState::DISCONNECTED;
            _scheduleRetry();
        }
    } else if (_state == WiFiState::DISCONNECTED || _state == WiFiState::FAILED) {
        if (millis() >= _nextRetryMs) {
            _connect();
        }
    }
}

void WiFiManager::_onConnected() {
    _state = WiFiState::CONNECTED;
    _retryDelayMs = WIFI_RECONNECT_BASE_MS;  // Reset backoff on success
    _retryCount = 0;
    Serial.printf("[WiFi] Connected! IP: %s\n", WiFi.localIP().toString().c_str());
}

void WiFiManager::_scheduleRetry() {
    _retryCount++;
    _nextRetryMs = millis() + _retryDelayMs;
    Serial.printf("[WiFi] Retry #%d in %lu ms\n", _retryCount, _retryDelayMs);

    // Exponential backoff, capped at max
    _retryDelayMs = min(_retryDelayMs * 2, (unsigned long)WIFI_RECONNECT_MAX_MS);
}

bool WiFiManager::isConnected() const {
    return _state == WiFiState::CONNECTED && WiFi.status() == WL_CONNECTED;
}

String WiFiManager::getIP() const {
    return WiFi.localIP().toString();
}
