import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_server_client.dart';

class MqttService extends ChangeNotifier {
  MqttServerClient? _client;
  bool isConnected = false;
  final Map<String, dynamic> latestData = {};

  Future<void> connect(String broker, int port, String deviceToken) async {
    await _client?.disconnect();

    _client = MqttServerClient.withPort(broker, 'flutter_${DateTime.now().millisecondsSinceEpoch}', port);
    _client!.keepAlivePeriod = 60;
    _client!.autoReconnect = true;
    _client!.logging(on: false);

    final connMsg = MqttConnectMessage()
        .withClientIdentifier('flutter_app')
        .startClean();
    _client!.connectionMessage = connMsg;

    try {
      await _client!.connect();
    } catch (e) {
      debugPrint('[MQTT] Connect error: $e');
      return;
    }

    if (_client!.connectionStatus?.state == MqttConnectionState.connected) {
      isConnected = true;
      notifyListeners();

      // Subscribe to telemetry
      _client!.subscribe('devices/$deviceToken/telemetry', MqttQos.atLeastOnce);

      _client!.updates?.listen((messages) {
        for (final msg in messages) {
          final payload = MqttPublishPayload.bytesToStringAsString(
            (msg.payload as MqttPublishMessage).payload.message,
          );
          try {
            final data = jsonDecode(payload) as Map<String, dynamic>;
            latestData.addAll(data);
            notifyListeners();
          } catch (_) {}
        }
      });
    }
  }

  Future<void> disconnect() async {
    _client?.disconnect();
    isConnected = false;
    latestData.clear();
    notifyListeners();
  }

  @override
  void dispose() {
    _client?.disconnect();
    super.dispose();
  }
}
