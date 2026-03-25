import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter_reactive_ble/flutter_reactive_ble.dart';

// Must match firmware's config.h UUIDs
const _serviceUuid         = '4fafc201-1fb5-459e-8fcc-c5c9c331914b';
const _charWifiSsid        = 'beb5483e-36e1-4688-b7f5-ea07361b26a8';
const _charWifiPass        = 'beb5483e-36e1-4688-b7f5-ea07361b26a9';
const _charMqttHost        = 'beb5483e-36e1-4688-b7f5-ea07361b26aa';
const _charDeviceToken     = 'beb5483e-36e1-4688-b7f5-ea07361b26ab';
const _charBackendUrl      = 'beb5483e-36e1-4688-b7f5-ea07361b26ac';
const _charCommit          = 'beb5483e-36e1-4688-b7f5-ea07361b26ad';
const _charStatus          = 'beb5483e-36e1-4688-b7f5-ea07361b26ae';

class BleDevice {
  final String id;
  final String name;
  final int rssi;
  BleDevice({required this.id, required this.name, required this.rssi});
}

class BleService extends ChangeNotifier {
  final _ble = FlutterReactiveBle();
  StreamSubscription<DiscoveredDevice>? _scanSub;
  StreamSubscription<ConnectionStateUpdate>? _connSub;

  final List<BleDevice> discovered = [];
  bool isScanning = false;
  bool isConnected = false;
  String? connectedDeviceId;
  String status = '';

  void startScan() {
    discovered.clear();
    isScanning = true;
    notifyListeners();

    _scanSub = _ble
        .scanForDevices(
          // Don't filter by service UUID — Android hardware filter is unreliable
          // with 128-bit custom UUIDs from NimBLE. Filter by name/UUID in listener.
          withServices: [],
          scanMode: ScanMode.lowLatency,
        )
        .listen((device) {
          // Accept devices that expose our service UUID OR have "ESP"/"platform" in name
          final isOurs = device.serviceUuids
              .any((u) => u.toString().toLowerCase() == _serviceUuid.toLowerCase());
          final nameMatch = device.name.toLowerCase().contains('esp') ||
              device.name.toLowerCase().contains('platform');
          if (!isOurs && !nameMatch) return;

          if (!discovered.any((d) => d.id == device.id)) {
            discovered.add(BleDevice(
              id: device.id,
              name: device.name.isEmpty ? 'ESP Device' : device.name,
              rssi: device.rssi,
            ));
            notifyListeners();
          }
        });
  }

  void stopScan() {
    _scanSub?.cancel();
    isScanning = false;
    notifyListeners();
  }

  Future<void> connect(String deviceId) async {
    stopScan();
    status = 'Connecting...';
    notifyListeners();

    final completer = Completer<void>();
    _connSub = _ble
        .connectToDevice(
          id: deviceId,
          connectionTimeout: const Duration(seconds: 10),
        )
        .listen((update) {
          if (update.connectionState == DeviceConnectionState.connected) {
            isConnected = true;
            connectedDeviceId = deviceId;
            status = 'Connected';
            notifyListeners();
            if (!completer.isCompleted) completer.complete();
          } else if (update.connectionState == DeviceConnectionState.disconnected) {
            isConnected = false;
            status = 'Disconnected';
            notifyListeners();
          }
        });
    await completer.future;
  }

  Future<void> provision({
    required String wifiSsid,
    required String wifiPass,
    required String mqttHost,
    required String deviceToken,
    required String backendUrl,
  }) async {
    if (!isConnected || connectedDeviceId == null) {
      throw Exception('Not connected to any device');
    }

    final deviceId = connectedDeviceId!;
    final svc = Uuid.parse(_serviceUuid);

    Future<void> write(String charUuid, String value) async {
      final char = QualifiedCharacteristic(
        serviceId: svc,
        characteristicId: Uuid.parse(charUuid),
        deviceId: deviceId,
      );
      await _ble.writeCharacteristicWithResponse(char, value: utf8.encode(value));
    }

    status = 'Sending WiFi credentials...';
    notifyListeners();
    await write(_charWifiSsid, wifiSsid);
    await write(_charWifiPass, wifiPass);

    status = 'Sending MQTT settings...';
    notifyListeners();
    await write(_charMqttHost, mqttHost);

    status = 'Sending device token...';
    notifyListeners();
    await write(_charDeviceToken, deviceToken);
    await write(_charBackendUrl, backendUrl);

    status = 'Committing...';
    notifyListeners();
    await write(_charCommit, 'commit');

    status = 'Provisioning sent! Device will restart.';
    notifyListeners();
  }

  void disconnect() {
    _connSub?.cancel();
    isConnected = false;
    connectedDeviceId = null;
    status = '';
    notifyListeners();
  }

  @override
  void dispose() {
    _scanSub?.cancel();
    _connSub?.cancel();
    super.dispose();
  }
}
