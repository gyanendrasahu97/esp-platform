#include "ble_provisioning.h"
#include "config.h"
#include <NimBLEDevice.h>

BleProvisioning bleProvisioning;

// ---- GATT Characteristic value holders ----
static String _wifiSsid, _wifiPass, _mqttHost, _deviceToken, _backendUrl;
static ProvisioningDoneCallback _doneCallback;
static NimBLEServer*     _server    = nullptr;
static NimBLEService*    _service   = nullptr;
static NimBLECharacteristic* _statusChar = nullptr;

// ---- Write callback helper ----
class StringCharCallbacks : public NimBLECharacteristicCallbacks {
public:
    String* target;
    explicit StringCharCallbacks(String* t) : target(t) {}
    void onWrite(NimBLECharacteristic* c, NimBLEConnInfo& connInfo) override {
        *target = String(c->getValue().c_str());
        Serial.printf("[BLE] Written to char: %s\n", target->substring(0, 20).c_str());
    }
};

// ---- "Commit" write - triggers provisioning done ----
class CommitCharCallbacks : public NimBLECharacteristicCallbacks {
public:
    void onWrite(NimBLECharacteristic* c, NimBLEConnInfo& connInfo) override {
        String val = String(c->getValue().c_str());
        if (val != "commit") return;

        Serial.println("[BLE] Provisioning commit received");

        if (_wifiSsid.isEmpty() || _deviceToken.isEmpty()) {
            c->setValue("error: ssid and token required");
            return;
        }

        if (_statusChar) {
            _statusChar->setValue("provisioning...");
            _statusChar->notify();
        }

        ProvisioningData data;
        data.wifiSsid    = _wifiSsid;
        data.wifiPass    = _wifiPass;
        data.mqttHost    = _mqttHost;
        data.deviceToken = _deviceToken;
        data.backendUrl  = _backendUrl;

        if (_doneCallback) {
            _doneCallback(data);
        }
    }
};

static StringCharCallbacks cb_ssid  (&_wifiSsid);
static StringCharCallbacks cb_pass  (&_wifiPass);
static StringCharCallbacks cb_host  (&_mqttHost);
static StringCharCallbacks cb_token (&_deviceToken);
static StringCharCallbacks cb_url   (&_backendUrl);
static CommitCharCallbacks  cb_commit;

void BleProvisioning::begin(const String& deviceName, ProvisioningDoneCallback onDone) {
    _doneCallback = onDone;
    _active = true;

    NimBLEDevice::init(deviceName.c_str());
    NimBLEDevice::setDeviceName(deviceName.c_str());
    // Disable bonding/pairing so Android never shows a PIN dialog
    NimBLEDevice::setSecurityAuth(false, false, false);
    NimBLEDevice::setSecurityIOCap(BLE_HS_IO_NO_INPUT_OUTPUT);

    _server  = NimBLEDevice::createServer();
    _service = _server->createService(BLE_SERVICE_UUID);

    auto addChar = [&](const char* uuid, NimBLECharacteristicCallbacks* cb, bool notify = false) {
        uint32_t props = NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR;
        if (notify) props |= NIMBLE_PROPERTY::NOTIFY | NIMBLE_PROPERTY::READ;
        auto ch = _service->createCharacteristic(uuid, props);
        ch->setCallbacks(cb);
        return ch;
    };

    addChar(BLE_CHAR_WIFI_SSID_UUID,    &cb_ssid);
    addChar(BLE_CHAR_WIFI_PASS_UUID,    &cb_pass);
    addChar(BLE_CHAR_MQTT_HOST_UUID,    &cb_host);
    addChar(BLE_CHAR_DEVICE_TOKEN_UUID, &cb_token);
    addChar(BLE_CHAR_BACKEND_URL_UUID,  &cb_url);
    addChar(BLE_CHAR_STATUS_UUID,       &cb_commit);   // Write "commit" to trigger provisioning

    _statusChar = _service->createCharacteristic(
        BLE_CHAR_STATUS_UUID,
        NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY
    );
    _statusChar->setValue("waiting");

    _service->start();

    NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
    adv->addServiceUUID(BLE_SERVICE_UUID);
    adv->setMinInterval(32);  // 20ms — advertise faster for quicker discovery
    adv->setMaxInterval(64);  // 40ms
    adv->start();

    Serial.printf("[BLE] Advertising as: %s\n", deviceName.c_str());
}

void BleProvisioning::stop() {
    NimBLEDevice::getAdvertising()->stop();
    NimBLEDevice::deinit(true);
    _active = false;
    Serial.println("[BLE] BLE stopped, RAM freed");
}
