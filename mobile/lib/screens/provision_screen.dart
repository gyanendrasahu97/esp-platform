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
  final _ssid  = TextEditingController();
  final _pass  = TextEditingController();
  final _token = TextEditingController();
  bool _sending = false;
  bool _done    = false;

  Future<void> _reconnectAndProvision() async {
    final ble = context.read<BleService>();
    if (ble.connectedDeviceId == null) return;

    setState(() { _sending = true; });
    try {
      // Re-connect to the same device (ESP32 auto-restarted advertising)
      await ble.connect(ble.connectedDeviceId!);
      await _sendProvision();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Reconnect failed: $e'), backgroundColor: Colors.red));
      }
    } finally {
      if (mounted) setState(() { _sending = false; });
    }
  }

  Future<void> _provision() async {
    if (_ssid.text.isEmpty || _token.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('WiFi SSID and Device Token are required')));
      return;
    }
    setState(() { _sending = true; });
    try {
      await _sendProvision();
    } finally {
      if (mounted) setState(() { _sending = false; });
    }
  }

  Future<void> _sendProvision() async {
    final ble = context.read<BleService>();
    final api = context.read<ApiService>();
    try {
      await ble.provision(
        wifiSsid:    _ssid.text.trim(),
        wifiPass:    _pass.text,
        mqttHost:    api.baseUrl.replaceAll('/api', '').replaceAll('http://', '').replaceAll('https://', ''),
        deviceToken: _token.text.trim(),
        backendUrl:  api.baseUrl.replaceAll('/api', ''),
      );
      if (mounted) setState(() { _done = true; });
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final ble = context.watch<BleService>();
    final isDisconnected = !ble.isConnected;

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
            // ── Connection status banner ─────────────────────────────────
            AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              decoration: BoxDecoration(
                color: isDisconnected
                    ? Colors.red.withValues(alpha: 0.15)
                    : Colors.blue.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                  color: isDisconnected ? Colors.red.shade400 : Colors.blue.shade400,
                  width: 1,
                ),
              ),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(children: [
                Icon(
                  isDisconnected ? Icons.bluetooth_disabled : Icons.bluetooth_connected,
                  color: isDisconnected ? Colors.red : Colors.blue,
                  size: 20,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    isDisconnected
                        ? 'BLE disconnected — your form data is saved'
                        : (ble.status.isEmpty ? 'Connected via BLE' : ble.status),
                    style: TextStyle(
                      fontSize: 13,
                      color: isDisconnected ? Colors.red.shade300 : null,
                    ),
                  ),
                ),
                if (isDisconnected)
                  TextButton(
                    onPressed: _sending ? null : _reconnectAndProvision,
                    child: const Text('Reconnect & Send'),
                  ),
              ]),
            ),

            const SizedBox(height: 24),
            const Text('WiFi Network', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            TextField(controller: _ssid,
              decoration: const InputDecoration(
                labelText: 'WiFi SSID', hintText: 'Your network name')),
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
              decoration: const InputDecoration(
                labelText: 'Device Token', hintText: 'xxxxxxxx-xxxx-...')),
            const SizedBox(height: 32),

            ElevatedButton(
              onPressed: (_sending || isDisconnected) ? null : _provision,
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
                  : Text(
                      isDisconnected ? 'Disconnected — use Reconnect above' : 'Provision Device',
                      style: const TextStyle(fontSize: 16),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
