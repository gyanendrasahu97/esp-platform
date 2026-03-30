#include "ntp_clock.h"
#include <Arduino.h>

NtpClock ntpClock;

void NtpClock::begin(long gmtOffsetSec, int daylightOffsetSec, const char* server) {
    configTime(gmtOffsetSec, daylightOffsetSec, server, "time.google.com", "time.cloudflare.com");
    Serial.printf("[NTP] Syncing with %s (UTC%+ld s)...\n", server, gmtOffsetSec);

    // Wait up to 5 s for first sync — non-blocking: check once per loop() via isSynced()
    struct tm t;
    if (getLocalTime(&t, 5000)) {
        _synced = true;
        Serial.printf("[NTP] Synced: %04d-%02d-%02d %02d:%02d:%02d\n",
            t.tm_year + 1900, t.tm_mon + 1, t.tm_mday,
            t.tm_hour, t.tm_min, t.tm_sec);
    } else {
        Serial.println("[NTP] Initial sync timed out — will retry in background");
    }
}

bool NtpClock::isSynced() const {
    if (_synced) return true;
    // Re-check lazily in case background sync completed
    struct tm t;
    if (getLocalTime(&t, 0)) {
        const_cast<NtpClock*>(this)->_synced = true;
        return true;
    }
    return false;
}

time_t NtpClock::getUnixTime() const {
    if (!isSynced()) return 0;
    return time(nullptr);
}

String NtpClock::getIsoString() const {
    if (!isSynced()) return "";
    time_t now = time(nullptr);
    struct tm t;
    gmtime_r(&now, &t);  // always UTC for ISO string
    char buf[25];
    snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02dZ",
        t.tm_year + 1900, t.tm_mon + 1, t.tm_mday,
        t.tm_hour, t.tm_min, t.tm_sec);
    return String(buf);
}

struct tm NtpClock::getLocalTime() const {
    struct tm t = {};
    if (isSynced()) getLocalTime(&t, 0);
    return t;
}
