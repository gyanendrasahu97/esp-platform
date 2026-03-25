import 'ui_descriptor.dart';

class Device {
  final String id;
  final String name;
  final String deviceToken;
  final String? firmwareVersion;
  final bool isOnline;
  final String? lastSeen;
  final String? ipAddress;
  final UiDescriptor? uiDescriptor;

  Device({
    required this.id,
    required this.name,
    required this.deviceToken,
    this.firmwareVersion,
    required this.isOnline,
    this.lastSeen,
    this.ipAddress,
    this.uiDescriptor,
  });

  factory Device.fromJson(Map<String, dynamic> json) {
    return Device(
      id: json['id'] as String,
      name: json['name'] as String,
      deviceToken: json['device_token'] as String,
      firmwareVersion: json['firmware_version'] as String?,
      isOnline: json['is_online'] as bool? ?? false,
      lastSeen: json['last_seen'] as String?,
      ipAddress: json['ip_address'] as String?,
      uiDescriptor: json['ui_descriptor'] != null
          ? UiDescriptor.fromJson(json['ui_descriptor'] as Map<String, dynamic>)
          : null,
    );
  }
}
