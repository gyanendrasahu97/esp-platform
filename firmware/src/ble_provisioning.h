#pragma once
#include <Arduino.h>
#include <functional>

struct ProvisioningData {
    String wifiSsid;
    String wifiPass;
    String mqttHost;
    String deviceToken;
    String backendUrl;
};

using ProvisioningDoneCallback = std::function<void(const ProvisioningData&)>;

class BleProvisioning {
public:
    void begin(const String& deviceName, ProvisioningDoneCallback onDone);
    void stop();
    bool isActive() const { return _active; }

private:
    bool _active = false;
    ProvisioningDoneCallback _onDone;
};

extern BleProvisioning bleProvisioning;
