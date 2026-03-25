#include "offline_buffer.h"
#include "config.h"
#include <LittleFS.h>
#include <vector>

OfflineBuffer offlineBuffer;

void OfflineBuffer::begin() {
    if (!LittleFS.begin(true)) {
        Serial.println("[Buffer] LittleFS mount failed - offline buffering disabled");
        _fsReady = false;
        return;
    }
    _fsReady = true;

    // Calculate current buffer size
    if (LittleFS.exists(OFFLINE_BUFFER_FILE)) {
        File f = LittleFS.open(OFFLINE_BUFFER_FILE, "r");
        _currentSize = f.size();
        f.close();
        Serial.printf("[Buffer] LittleFS ready, buffered: %u bytes\n", _currentSize);
    } else {
        _currentSize = 0;
        Serial.println("[Buffer] LittleFS ready, buffer empty");
    }
}

void OfflineBuffer::store(const String& jsonLine) {
    if (!_fsReady) return;
    if (_currentSize >= OFFLINE_BUFFER_MAX_BYTES) {
        Serial.println("[Buffer] Buffer full, oldest data discarded");
        // Simple strategy: delete and start fresh when full
        LittleFS.remove(OFFLINE_BUFFER_FILE);
        _currentSize = 0;
    }

    File f = LittleFS.open(OFFLINE_BUFFER_FILE, "a");
    if (!f) {
        Serial.println("[Buffer] Failed to open buffer file for writing");
        return;
    }
    f.println(jsonLine);
    _currentSize += jsonLine.length() + 1;
    f.close();
}

bool OfflineBuffer::hasData() const {
    return _fsReady && _currentSize > 0 && LittleFS.exists(OFFLINE_BUFFER_FILE);
}

size_t OfflineBuffer::flush(std::function<bool(const String&)> publishFn) {
    if (!hasData()) return 0;

    File f = LittleFS.open(OFFLINE_BUFFER_FILE, "r");
    if (!f) return 0;

    size_t flushed = 0;
    size_t failed  = 0;

    // Read all lines, collect unflushed ones
    std::vector<String> pending;
    while (f.available()) {
        String line = f.readStringUntil('\n');
        line.trim();
        if (line.length() == 0) continue;
        pending.push_back(line);
    }
    f.close();

    Serial.printf("[Buffer] Flushing %u buffered records...\n", pending.size());

    // Publish in batches
    for (const String& line : pending) {
        if (flushed >= OFFLINE_FLUSH_BATCH) {
            // Leave remaining for next flush cycle
            break;
        }
        if (publishFn(line)) {
            flushed++;
        } else {
            failed++;
            break;  // MQTT publish failed, stop and retry later
        }
        delay(50);  // Small delay between publishes
    }

    // Rewrite file with unflushed records
    size_t processed = flushed + failed;
    if (processed > 0 && failed == 0 && flushed >= pending.size()) {
        // All flushed - delete file
        LittleFS.remove(OFFLINE_BUFFER_FILE);
        _currentSize = 0;
    } else if (flushed > 0) {
        // Write back remaining
        LittleFS.remove(OFFLINE_BUFFER_FILE);
        File fw = LittleFS.open(OFFLINE_BUFFER_FILE, "w");
        _currentSize = 0;
        for (size_t i = flushed; i < pending.size(); i++) {
            fw.println(pending[i]);
            _currentSize += pending[i].length() + 1;
        }
        fw.close();
    }

    Serial.printf("[Buffer] Flushed %u records, %u remaining\n", flushed, pending.size() - flushed);
    return flushed;
}

void OfflineBuffer::clear() {
    if (_fsReady) {
        LittleFS.remove(OFFLINE_BUFFER_FILE);
        _currentSize = 0;
    }
}
