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
    size_t totalInFile = 0;
    bool stop = false;

    // We can't easily delete lines from the middle of a file.
    // Strategy: Read one by one, publish. If successful, we'll later rewrite the file
    // without the successfully flushed lines.
    
    // To keep it simple and safe: read everything to a temporary file EXCEPT the flushed lines.
    // But even better: Since we have 118KB, let's just use a fixed batch size and stop.
    
    File temp = LittleFS.open("/temp_buffer.jsonl", "w");
    if (!temp) {
        f.close();
        return 0;
    }

    while (f.available()) {
        String line = f.readStringUntil('\n');
        line.trim();
        if (line.length() == 0) continue;
        totalInFile++;

        if (!stop && flushed < OFFLINE_FLUSH_BATCH) {
            if (publishFn(line)) {
                flushed++;
                delay(50); 
                continue; // Don't write to temp, it's flushed
            } else {
                stop = true; // MQTT failed, keep this and all remaining lines
            }
        }
        
        temp.println(line);
    }
    f.close();
    temp.close();

    LittleFS.remove(OFFLINE_BUFFER_FILE);
    if (LittleFS.exists("/temp_buffer.jsonl")) {
        LittleFS.rename("/temp_buffer.jsonl", OFFLINE_BUFFER_FILE);
        // Update current size
        File f2 = LittleFS.open(OFFLINE_BUFFER_FILE, "r");
        _currentSize = f2.size();
        f2.close();
    } else {
        _currentSize = 0;
    }

    if (_currentSize == 0) LittleFS.remove(OFFLINE_BUFFER_FILE);

    Serial.printf("[Buffer] Flushed %u records, %u remaining\n", flushed, (totalInFile > flushed) ? (totalInFile - flushed) : 0);
    return flushed;
}

void OfflineBuffer::clear() {
    if (_fsReady) {
        LittleFS.remove(OFFLINE_BUFFER_FILE);
        _currentSize = 0;
    }
}
