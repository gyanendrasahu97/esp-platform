#pragma once

// ============================================================
// ESP Platform - Device Configuration
// Edit these or override via BLE provisioning + NVS storage
// ============================================================

// --- NVS Keys (stored in flash after BLE provisioning) ---
#define NVS_NAMESPACE       "esp_platform"
#define NVS_KEY_WIFI_SSID   "wifi_ssid"
#define NVS_KEY_WIFI_PASS   "wifi_pass"
#define NVS_KEY_MQTT_HOST   "mqtt_host"
#define NVS_KEY_MQTT_PORT   "mqtt_port"
#define NVS_KEY_DEVICE_TOKEN "dev_token"
#define NVS_KEY_BACKEND_URL "backend_url"

// --- BLE Service & Characteristic UUIDs ---
#define BLE_SERVICE_UUID           "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define BLE_CHAR_WIFI_SSID_UUID    "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define BLE_CHAR_WIFI_PASS_UUID    "beb5483e-36e1-4688-b7f5-ea07361b26a9"
#define BLE_CHAR_MQTT_HOST_UUID    "beb5483e-36e1-4688-b7f5-ea07361b26aa"
#define BLE_CHAR_DEVICE_TOKEN_UUID "beb5483e-36e1-4688-b7f5-ea07361b26ab"
#define BLE_CHAR_BACKEND_URL_UUID  "beb5483e-36e1-4688-b7f5-ea07361b26ac"
#define BLE_CHAR_COMMIT_UUID       "beb5483e-36e1-4688-b7f5-ea07361b26ad"
#define BLE_CHAR_STATUS_UUID       "beb5483e-36e1-4688-b7f5-ea07361b26ae"

// --- Platform Server (fixed for this deployment) ---
// WiFi credentials still come from BLE provisioning.
// Backend URL and MQTT host are the same for all devices on this platform.
// They are used as fallback when NVS is empty (e.g. first flash, or older firmware).
#define PLATFORM_BACKEND_URL  "https://api.esp.cruzanet.cloud"
#define PLATFORM_MQTT_HOST    "esp.cruzanet.cloud"

// --- Default Connection Settings ---
#define DEFAULT_MQTT_PORT     1883
#define MQTT_KEEPALIVE_S      60
#define MQTT_MAX_PACKET_SIZE  8192

// --- Reconnect Settings ---
#define WIFI_RECONNECT_BASE_MS   1000
#define WIFI_RECONNECT_MAX_MS    60000
#define MQTT_RECONNECT_BASE_MS   2000
#define MQTT_RECONNECT_MAX_MS    60000

// --- Telemetry ---
#define TELEMETRY_INTERVAL_MS    5000   // Publish every 5 seconds
#define OTA_CHECK_INTERVAL_MS    300000 // Check OTA every 5 minutes

// --- Offline Buffer ---
#define OFFLINE_BUFFER_FILE      "/offline_buffer.jsonl"
#define OFFLINE_BUFFER_MAX_BYTES (512 * 1024)  // 512KB
#define OFFLINE_FLUSH_BATCH      20            // Flush N records per tick

// --- Hardware ---
#define LED_PIN         2   // Built-in LED (active HIGH on most ESP32 boards)
#define SENSOR_DHT_PIN  4   // DHT22 data pin (change as needed)

// --- NTP / Clock ---
// GMT offset in seconds. Examples:
//   UTC        =      0
//   UTC+5:30   =  19800  (India)
//   UTC+8      =  28800  (China/Singapore/PH)
//   UTC-5      = -18000  (US Eastern)
//   UTC+1      =   3600  (Central Europe)
#define NTP_GMT_OFFSET_SEC      0
#define NTP_DAYLIGHT_OFFSET_SEC 0
#define NTP_SERVER              "pool.ntp.org"

// --- Firmware ---
#ifndef FIRMWARE_VERSION_ID
  #define FIRMWARE_VERSION_ID "1.0.0-manual"
#endif
#define FIRMWARE_VERSION  FIRMWARE_VERSION_ID
#define DEVICE_NAME       "ESP Platform Device"
