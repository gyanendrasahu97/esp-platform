#include "ota_manager.h"
#include "config.h"
#include "ESPPlatform.h"
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <Update.h>
#include <WiFi.h>

OtaManager otaManager;

void OtaManager::begin(const String& backendUrl, const String& deviceToken) {
    _backendUrl  = backendUrl;
    _deviceToken = deviceToken;
    Platform.log("[OTA] OTA manager initialized");
}

void OtaManager::checkAndApply() {
    if (!WiFi.isConnected()) return;

    String url = _backendUrl + "/api/ota/" + _deviceToken + "/latest"
                 + "?current_version=" + FIRMWARE_VERSION;

    Platform.log("[OTA] Checking: %s", url.c_str());

    HTTPClient http;
    http.begin(url);
    int code = http.GET();

    if (code != 200) {
        Platform.log("[OTA] Check failed, HTTP %d", code);
        http.end();
        return;
    }

    JsonDocument doc;
    deserializeJson(doc, http.getStream());
    http.end();

    bool hasUpdate = doc["has_update"] | false;
    if (!hasUpdate) {
        Platform.log("[OTA] Firmware is up to date");
        return;
    }

    String newVersion  = doc["version"]      | "";
    String downloadUrl = doc["download_url"] | "";
    String checksum    = doc["checksum"]     | "";

    Platform.log("[OTA] Update available: %s -> %s", FIRMWARE_VERSION, newVersion.c_str());
    applyFromUrl(downloadUrl, checksum);
}

void OtaManager::applyFromUrl(const String& url, const String& expectedChecksum) {
    Platform.log("[OTA] Downloading firmware from: %s", url.c_str());

    HTTPClient http;
    http.begin(url);
    http.setTimeout(60000);
    int code = http.GET();

    if (code != 200) {
        Platform.log("[OTA] Download failed, HTTP %d", code);
        http.end();
        return;
    }

    int contentLength = http.getSize();
    if (contentLength <= 0) {
        Platform.log("[OTA] Unknown content length, proceeding anyway...");
    }

    if (!Update.begin(contentLength > 0 ? contentLength : UPDATE_SIZE_UNKNOWN)) {
        Platform.log("[OTA] Update.begin failed: %s", Update.errorString());
        http.end();
        return;
    }

    WiFiClient* stream = http.getStreamPtr();
    size_t written = Update.writeStream(*stream);
    http.end();

    Platform.log("[OTA] Written: %u bytes", written);

    if (Update.end()) {
        if (Update.isFinished()) {
            Platform.log("[OTA] Update successful! Rebooting...");
            delay(1000);
            ESP.restart();
        } else {
            Platform.log("[OTA] Update not finished - something went wrong");
        }
    } else {
        Platform.log("[OTA] Update.end error: %s", Update.errorString());
    }
}
