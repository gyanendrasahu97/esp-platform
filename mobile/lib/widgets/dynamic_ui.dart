import 'package:flutter/material.dart';
import '../models/ui_descriptor.dart';

class DynamicUi extends StatefulWidget {
  final UiDescriptor descriptor;
  final Map<String, dynamic> telemetry;
  final Future<void> Function(String action, dynamic value) onCommand;

  const DynamicUi({
    super.key,
    required this.descriptor,
    required this.telemetry,
    required this.onCommand,
  });

  @override
  State<DynamicUi> createState() => _DynamicUiState();
}

class _DynamicUiState extends State<DynamicUi> {
  final Map<String, dynamic> _localValues = {};

  @override
  Widget build(BuildContext context) {
    final controls = widget.descriptor.controls;
    if (controls.isEmpty) {
      return const Center(child: Text('No controls defined', style: TextStyle(color: Colors.grey)));
    }

    return ListView.separated(
      padding: const EdgeInsets.all(16),
      itemCount: controls.length,
      separatorBuilder: (_, __) => const SizedBox(height: 8),
      itemBuilder: (_, i) => _buildControl(controls[i]),
    );
  }

  Widget _buildControl(UiControl ctrl) {
    switch (ctrl.type) {
      case 'switch':
        return _SwitchControl(ctrl: ctrl,
          value: _localValues[ctrl.action] as bool? ?? false,
          onChanged: (v) {
            setState(() => _localValues[ctrl.action!] = v);
            widget.onCommand(ctrl.action!, v);
          });

      case 'button':
        return _ButtonControl(ctrl: ctrl,
          onTap: () => widget.onCommand(ctrl.action!, true));

      case 'slider':
        final val = (_localValues[ctrl.action] as double?) ?? (ctrl.min ?? 0);
        return _SliderControl(ctrl: ctrl, value: val,
          onChanged: (v) => setState(() => _localValues[ctrl.action!] = v),
          onChangeEnd: (v) => widget.onCommand(ctrl.action!, v));

      case 'sensor':
      case 'gauge':
        final raw = widget.telemetry[ctrl.key];
        return _SensorDisplay(ctrl: ctrl, value: raw);

      default:
        return ListTile(title: Text('Unknown: ${ctrl.type}', style: const TextStyle(color: Colors.grey)));
    }
  }
}

// ---- Individual control widgets ----

class _SwitchControl extends StatelessWidget {
  final UiControl ctrl;
  final bool value;
  final ValueChanged<bool> onChanged;
  const _SwitchControl({required this.ctrl, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: SwitchListTile(
        title: Text(ctrl.label),
        value: value,
        onChanged: onChanged,
        activeColor: const Color(0xFF3B82F6),
      ),
    );
  }
}

class _ButtonControl extends StatefulWidget {
  final UiControl ctrl;
  final VoidCallback onTap;
  const _ButtonControl({required this.ctrl, required this.onTap});
  @override
  State<_ButtonControl> createState() => _ButtonControlState();
}

class _ButtonControlState extends State<_ButtonControl> {
  bool _loading = false;
  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(children: [
          Expanded(child: Text(widget.ctrl.label, style: const TextStyle(fontSize: 16))),
          ElevatedButton(
            onPressed: _loading ? null : () async {
              setState(() => _loading = true);
              widget.onTap();
              await Future.delayed(const Duration(milliseconds: 500));
              if (mounted) setState(() => _loading = false);
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF2563EB),
              foregroundColor: Colors.white,
            ),
            child: _loading
                ? const SizedBox(width: 16, height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                : const Icon(Icons.play_arrow),
          ),
        ]),
      ),
    );
  }
}

class _SliderControl extends StatelessWidget {
  final UiControl ctrl;
  final double value;
  final ValueChanged<double> onChanged;
  final ValueChanged<double> onChangeEnd;
  const _SliderControl({required this.ctrl, required this.value,
    required this.onChanged, required this.onChangeEnd});

  @override
  Widget build(BuildContext context) {
    final min  = ctrl.min  ?? 0;
    final max  = ctrl.max  ?? 100;
    final unit = ctrl.unit ?? '';
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Text(ctrl.label, style: const TextStyle(fontSize: 16)),
            const Spacer(),
            Text('${value.toStringAsFixed(0)}$unit',
              style: const TextStyle(fontWeight: FontWeight.bold, color: Color(0xFF3B82F6))),
          ]),
          Slider(
            value: value.clamp(min, max),
            min: min, max: max,
            divisions: ((max - min) / (ctrl.step ?? 1)).round().clamp(1, 100),
            activeColor: const Color(0xFF3B82F6),
            onChanged: onChanged,
            onChangeEnd: onChangeEnd,
          ),
        ]),
      ),
    );
  }
}

class _SensorDisplay extends StatelessWidget {
  final UiControl ctrl;
  final dynamic value;
  const _SensorDisplay({required this.ctrl, this.value});

  @override
  Widget build(BuildContext context) {
    final unit = ctrl.unit ?? '';
    final displayValue = value != null ? '${value}$unit' : '--';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(children: [
          const Icon(Icons.sensors, color: Color(0xFF3B82F6), size: 28),
          const SizedBox(width: 12),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(ctrl.label, style: const TextStyle(color: Colors.grey, fontSize: 12)),
            Text(displayValue,
              style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
          ]),
        ]),
      ),
    );
  }
}
