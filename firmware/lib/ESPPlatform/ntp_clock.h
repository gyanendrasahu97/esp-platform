#pragma once
#include <Arduino.h>
#include <time.h>

class NtpClock {
public:
    // Call after WiFi connects. gmtOffsetSec: UTC offset in seconds
    // e.g. UTC+5:30 (India) = 19800,  UTC-5 (EST) = -18000,  UTC = 0
    void begin(long gmtOffsetSec = 0, int daylightOffsetSec = 0,
               const char* server = "pool.ntp.org");

    bool        isSynced()     const;  // true once NTP has replied
    time_t      getUnixTime()  const;  // seconds since epoch (0 if not synced)
    String      getIsoString() const;  // "2024-03-30T14:25:00Z" (UTC)
    struct tm   getLocalTime() const;  // struct tm in configured timezone

private:
    bool _synced = false;
};

extern NtpClock ntpClock;
