#pragma once
// Pre-baked credentials injected by the ESP Platform web editor at build time.
// When defined, these values are used as fallback if NVS is empty (no BLE provisioning done).
// The web editor overwrites this file with actual values before each cloud build.

// Token and WiFi are independent — define only what you need:
// #define PREBAKE_DEVICE_TOKEN "your-device-token-uuid"  // set this alone to skip token entry in BLE
// #define PREBAKE_WIFI_SSID    "YourSSID"                // set both WiFi defines to skip BLE entirely
// #define PREBAKE_WIFI_PASS    "YourPassword"
