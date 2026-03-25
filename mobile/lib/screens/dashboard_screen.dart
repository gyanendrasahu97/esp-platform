import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/device.dart';
import '../services/api_service.dart';
import 'scan_screen.dart';
import 'device_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  List<Device> _devices = [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final devices = await context.read<ApiService>().getDevices();
      setState(() { _devices = devices; });
    } catch (e) {
      setState(() { _error = e.toString(); });
    } finally {
      setState(() { _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('My Devices'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: _load),
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () => context.read<ApiService>().logout(),
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.error_outline, size: 48, color: Colors.red),
                  const SizedBox(height: 8),
                  Text(_error!, textAlign: TextAlign.center, style: const TextStyle(color: Colors.grey)),
                  const SizedBox(height: 16),
                  ElevatedButton(onPressed: _load, child: const Text('Retry')),
                ]))
              : _devices.isEmpty
                  ? Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.developer_board_off, size: 64, color: Colors.grey),
                      const SizedBox(height: 12),
                      const Text('No devices yet', style: TextStyle(color: Colors.grey)),
                      const SizedBox(height: 16),
                      ElevatedButton.icon(
                        onPressed: () => Navigator.push(context,
                          MaterialPageRoute(builder: (_) => const ScanScreen())),
                        icon: const Icon(Icons.add),
                        label: const Text('Add Device'),
                      ),
                    ]))
                  : RefreshIndicator(
                      onRefresh: _load,
                      child: ListView.separated(
                        padding: const EdgeInsets.all(16),
                        itemCount: _devices.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (_, i) {
                          final d = _devices[i];
                          return Card(
                            child: ListTile(
                              leading: Stack(children: [
                                const Icon(Icons.developer_board, size: 36, color: Color(0xFF3B82F6)),
                                Positioned(right: 0, bottom: 0,
                                  child: Container(width: 10, height: 10,
                                    decoration: BoxDecoration(
                                      color: d.isOnline ? Colors.green : Colors.grey,
                                      shape: BoxShape.circle,
                                      border: Border.all(color: const Color(0xFF1E293B), width: 1.5),
                                    ))),
                              ]),
                              title: Text(d.name),
                              subtitle: Text(
                                '${d.isOnline ? "Online" : "Offline"}${d.firmwareVersion != null ? " · FW ${d.firmwareVersion}" : ""}',
                                style: TextStyle(color: d.isOnline ? Colors.green : Colors.grey, fontSize: 12),
                              ),
                              trailing: const Icon(Icons.chevron_right),
                              onTap: () => Navigator.push(context,
                                MaterialPageRoute(builder: (_) => DeviceScreen(device: d))),
                            ),
                          );
                        },
                      ),
                    ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => Navigator.push(context,
          MaterialPageRoute(builder: (_) => const ScanScreen())),
        tooltip: 'Add via BLE',
        child: const Icon(Icons.add),
      ),
    );
  }
}
