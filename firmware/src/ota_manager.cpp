#include "ota_manager.h"
#include "config.h"
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <Update.h>
#include <WiFi.h>

OtaManager otaManager;

void OtaManager::begin(const String& backendUrl, const String& deviceToken) {
    _backendUrl  = backendUrl;
    _deviceToken = deviceToken;
    Serial.println("[OTA] OTA manager initialized");
}

void OtaManager::checkAndApply() {
    if (!WiFi.isConnected()) return;

    String url = _backendUrl + "/api/ota/" + _deviceToken + "/latest"
                 + "?current_version=" + FIRMWARE_VERSION;

    Serial.printf("[OTA] Checking: %s\n", url.c_str());

    HTTPClient http;
    http.begin(url);
    int code = http.GET();

    if (code != 200) {
        Serial.printf("[OTA] Check failed, HTTP %d\n", code);
        http.end();
        return;
    }

    JsonDocument doc;
    deserializeJson(doc, http.getStream());
    http.end();

    bool hasUpdate = doc["has_update"] | false;
    if (!hasUpdate) {
        Serial.println("[OTA] Firmware is up to date");
        return;
    }

    String newVersion  = doc["version"]      | "";
    String downloadUrl = doc["download_url"] | "";
    String checksum    = doc["checksum"]     | "";

    Serial.printf("[OTA] Update available: %s -> %s\n", FIRMWARE_VERSION, newVersion.c_str());
    applyFromUrl(downloadUrl, checksum);
}

void OtaManager::applyFromUrl(const String& url, const String& expectedChecksum) {
    Serial.printf("[OTA] Downloading firmware from: %s\n", url.c_str());

    HTTPClient http;
    http.begin(url);
    http.setTimeout(60000);
    int code = http.GET();

    if (code != 200) {
        Serial.printf("[OTA] Download failed, HTTP %d\n", code);
        http.end();
        return;
    }

    int contentLength = http.getSize();
    if (contentLength <= 0) {
        Serial.println("[OTA] Unknown content length, proceeding anyway...");
    }

    if (!Update.begin(contentLength > 0 ? contentLength : UPDATE_SIZE_UNKNOWN)) {
        Serial.printf("[OTA] Update.begin failed: %s\n", Update.errorString());
        http.end();
        return;
    }

    WiFiClient* stream = http.getStreamPtr();
    size_t written = Update.writeStream(*stream);
    http.end();

    Serial.printf("[OTA] Written: %u bytes\n", written);

    if (Update.end()) {
        if (Update.isFinished()) {
            Serial.println("[OTA] Update successful! Rebooting...");
            delay(1000);
            ESP.restart();
        } else {
            Serial.println("[OTA] Update not finished - something went wrong");
        }
    } else {
        Serial.printf("[OTA] Update.end error: %s\n", Update.errorString());
    }
}
