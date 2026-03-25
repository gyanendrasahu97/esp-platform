import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_server_client.dart';

class MqttService extends ChangeNotifier {
  MqttServerClient? _client;
  bool isConnected = false;
  final Map<String, dynamic> latestData = {};
  Map<String, dynamic>? uiDescriptor;

  Future<void> connect(String broker, int port, String deviceToken) async {
    _client?.disconnect();

    final clientId = 'flutter_${DateTime.now().millisecondsSinceEpoch}';
    _client = MqttServerClient.withPort(broker, clientId, port);
    _client!.keepAlivePeriod = 60;
    _client!.autoReconnect = true;
    _client!.logging(on: false);

    final connMsg = MqttConnectMessage()
        .withClientIdentifier(clientId)
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

      _client!.subscribe('devices/$deviceToken/telemetry', MqttQos.atLeastOnce);
      _client!.subscribe('devices/$deviceToken/ui', MqttQos.atLeastOnce);

      _client!.updates?.listen((messages) {
        for (final msg in messages) {
          final topic = msg.topic;
          final payload = MqttPublishPayload.bytesToStringAsString(
            (msg.payload as MqttPublishMessage).payload.message,
          );
          try {
            final data = jsonDecode(payload) as Map<String, dynamic>;
            if (topic.endsWith('/ui')) {
              uiDescriptor = data;
            } else {
              latestData.addAll(data);
            }
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
    uiDescriptor = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _client?.disconnect();
    super.dispose();
  }
}
