import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/ble_service.dart';
import '../services/api_service.dart';

class ProvisionScreen extends StatefulWidget {
  const ProvisionScreen({super.key});
  @override
  State<ProvisionScreen> createState() => _ProvisionScreenState();
}

class _ProvisionScreenState extends State<ProvisionScreen> {
  final _ssid    = TextEditingController();
  final _pass    = TextEditingController();
  final _token   = TextEditingController();
  bool _sending  = false;
  bool _done     = false;

  @override
  void initState() {
    super.initState();
    final api = context.read<ApiService>();
    // Pre-fill backend URL from saved settings
    _ssid.text = '';
  }

  Future<void> _provision() async {
    if (_ssid.text.isEmpty || _token.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('WiFi SSID and Device Token are required')));
      return;
    }
    setState(() { _sending = true; });

    try {
      final ble = context.read<BleService>();
      final api = context.read<ApiService>();
      await ble.provision(
        wifiSsid:    _ssid.text.trim(),
        wifiPass:    _pass.text,
        mqttHost:    api.baseUrl.replaceAll('/api', '').replaceAll('http://', '').replaceAll('https://', ''),
        deviceToken: _token.text.trim(),
        backendUrl:  api.baseUrl.replaceAll('/api', ''),
      );
      setState(() { _done = true; });
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red));
    } finally {
      setState(() { _sending = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final ble = context.watch<BleService>();

    if (_done) {
      return Scaffold(
        appBar: AppBar(title: const Text('Setup Complete')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.check_circle, size: 72, color: Colors.green),
              const SizedBox(height: 16),
              const Text('Device provisioned!',
                style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              const Text('The device will restart and connect to your network.',
                textAlign: TextAlign.center, style: TextStyle(color: Colors.grey)),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () => Navigator.popUntil(context, (r) => r.isFirst),
                child: const Text('Back to Devices'),
              ),
            ]),
          ),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Setup Device')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(children: [
                  const Icon(Icons.bluetooth_connected, color: Colors.blue, size: 20),
                  const SizedBox(width: 8),
                  Text(ble.status.isEmpty ? 'Connected via BLE' : ble.status,
                    style: const TextStyle(fontSize: 13)),
                ]),
              ),
            ),
            const SizedBox(height: 24),
            const Text('WiFi Network', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            TextField(controller: _ssid,
              decoration: const InputDecoration(labelText: 'WiFi SSID', hintText: 'Your network name')),
            const SizedBox(height: 12),
            TextField(controller: _pass,
              decoration: const InputDecoration(labelText: 'WiFi Password'),
              obscureText: true),
            const SizedBox(height: 24),
            const Text('Device Token', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            const Text('Copy from the ESP Platform dashboard → Device → Token',
              style: TextStyle(fontSize: 12, color: Colors.grey)),
            const SizedBox(height: 8),
            TextField(controller: _token,
              decoration: const InputDecoration(labelText: 'Device Token', hintText: 'xxxxxxxx-xxxx-...')),
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: _sending ? null : _provision,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2563EB),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              child: _sending
                  ? const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                      SizedBox(width: 20, height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)),
                      SizedBox(width: 12),
                      Text('Sending...'),
                    ])
                  : const Text('Provision Device', style: TextStyle(fontSize: 16)),
            ),
          ],
        ),
      ),
    );
  }
}
