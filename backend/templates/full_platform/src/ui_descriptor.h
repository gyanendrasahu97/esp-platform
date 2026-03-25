#pragma once
#include <Arduino.h>

// Returns the device's UI descriptor as a JSON string.
// Publish this to devices/{token}/ui on connect.
String buildUiDescriptor(const String& deviceToken);
