import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/ble_service.dart';
import 'provision_screen.dart';

class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});
  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<BleService>().startScan();
    });
  }

  @override
  void dispose() {
    context.read<BleService>().stopScan();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ble = context.watch<BleService>();
    return Scaffold(
      appBar: AppBar(
        title: const Text('Find ESP32 Device'),
        actions: [
          if (ble.isScanning)
            const Padding(
              padding: EdgeInsets.all(12),
              child: SizedBox(width: 20, height: 20,
                child: CircularProgressIndicator(strokeWidth: 2)),
            )
          else
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: ble.startScan,
            ),
        ],
      ),
      body: ble.discovered.isEmpty
          ? Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.bluetooth_searching, size: 64, color: Colors.blue),
                const SizedBox(height: 16),
                Text(ble.isScanning ? 'Scanning for ESP devices...' : 'No devices found',
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: Colors.grey)),
              ]),
            )
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: ble.discovered.length,
              itemBuilder: (_, i) {
                final d = ble.discovered[i];
                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: const Icon(Icons.developer_board, color: Colors.blue),
                    title: Text(d.name),
                    subtitle: Text('RSSI: ${d.rssi} dBm'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () async {
                      await ble.connect(d.id);
                      if (context.mounted) {
                        Navigator.push(context,
                          MaterialPageRoute(builder: (_) => const ProvisionScreen()));
                      }
                    },
                  ),
                );
              },
            ),
    );
  }
}
