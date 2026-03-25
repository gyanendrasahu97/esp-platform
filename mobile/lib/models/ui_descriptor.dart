class UiDescriptor {
  final String deviceName;
  final String? firmwareVersion;
  final List<UiControl> controls;

  UiDescriptor({
    required this.deviceName,
    this.firmwareVersion,
    required this.controls,
  });

  factory UiDescriptor.fromJson(Map<String, dynamic> json) {
    final controlsList = (json['controls'] as List<dynamic>?) ?? [];
    return UiDescriptor(
      deviceName: json['device_name'] as String? ?? 'Device',
      firmwareVersion: json['firmware_version'] as String?,
      controls: controlsList
          .map((e) => UiControl.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

class UiControl {
  final String type;
  final String label;
  final String? action;
  final String? key;
  final String? unit;
  final double? min;
  final double? max;
  final double? step;

  UiControl({
    required this.type,
    required this.label,
    this.action,
    this.key,
    this.unit,
    this.min,
    this.max,
    this.step,
  });

  factory UiControl.fromJson(Map<String, dynamic> json) {
    return UiControl(
      type: json['type'] as String,
      label: json['label'] as String,
      action: json['action'] as String?,
      key: json['key'] as String?,
      unit: json['unit'] as String?,
      min: (json['min'] as num?)?.toDouble(),
      max: (json['max'] as num?)?.toDouble(),
      step: json['step'] as double?,
    );
  }
}
