import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/device.dart';
import '../services/api_service.dart';
import '../services/mqtt_service.dart';
import '../widgets/dynamic_ui.dart';

class DeviceScreen extends StatefulWidget {
  final Device device;
  const DeviceScreen({super.key, required this.device});
  @override
  State<DeviceScreen> createState() => _DeviceScreenState();
}

class _DeviceScreenState extends State<DeviceScreen> {
  @override
  void initState() {
    super.initState();
    final api  = context.read<ApiService>();
    final mqtt = context.read<MqttService>();
    final broker = api.baseUrl
        .replaceAll('/api', '')
        .replaceAll('http://', '')
        .replaceAll('https://', '');
    mqtt.connect(broker, 1883, widget.device.deviceToken);
  }

  @override
  void dispose() {
    context.read<MqttService>().disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final mqtt = context.watch<MqttService>();
    final api  = context.read<ApiService>();
    final device = widget.device;

    return Scaffold(
      appBar: AppBar(
        title: Text(device.name),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 14),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: (device.isOnline ? Colors.green : Colors.grey).withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.circle, size: 8,
                  color: device.isOnline ? Colors.green : Colors.grey),
                const SizedBox(width: 4),
                Text(device.isOnline ? 'Online' : 'Offline',
                  style: const TextStyle(fontSize: 12)),
              ]),
            ),
          ),
        ],
      ),
      body: device.uiDescriptor == null
          ? const Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.hourglass_empty, size: 48, color: Colors.grey),
              SizedBox(height: 12),
              Text('Waiting for device UI descriptor...', style: TextStyle(color: Colors.grey)),
            ]))
          : DynamicUi(
              descriptor: device.uiDescriptor!,
              telemetry: Map<String, dynamic>.from(mqtt.latestData),
              onCommand: (action, value) => api.sendCommand(device.id, action, value),
            ),
    );
  }
}
