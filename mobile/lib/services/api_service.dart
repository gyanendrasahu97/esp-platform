import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../models/device.dart';

class ApiService extends ChangeNotifier {
  String _baseUrl = 'http://localhost/api';
  String? _token;

  bool get isLoggedIn => _token != null;
  String get baseUrl => _baseUrl;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('auth_token');
    _baseUrl = prefs.getString('base_url') ?? 'http://localhost/api';
    notifyListeners();
  }

  Future<void> setBaseUrl(String url) async {
    _baseUrl = url.trimRight().endsWith('/api') ? url : '$url/api';
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('base_url', _baseUrl);
    notifyListeners();
  }

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    if (_token != null) 'Authorization': 'Bearer $_token',
  };

  Future<bool> login(String email, String password) async {
    final res = await http.post(
      Uri.parse('$_baseUrl/auth/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );
    if (res.statusCode == 200) {
      final data = jsonDecode(res.body) as Map<String, dynamic>;
      _token = data['access_token'] as String;
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('auth_token', _token!);
      notifyListeners();
      return true;
    }
    return false;
  }

  Future<void> logout() async {
    _token = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('auth_token');
    notifyListeners();
  }

  Future<List<Device>> getDevices() async {
    final res = await http.get(Uri.parse('$_baseUrl/devices'), headers: _headers);
    if (res.statusCode == 200) {
      final list = jsonDecode(res.body) as List<dynamic>;
      return list.map((e) => Device.fromJson(e as Map<String, dynamic>)).toList();
    }
    throw Exception('Failed to load devices: ${res.statusCode}');
  }

  Future<void> sendCommand(String deviceId, String action, dynamic value) async {
    await http.post(
      Uri.parse('$_baseUrl/devices/$deviceId/command'),
      headers: _headers,
      body: jsonEncode({'action': action, 'value': value}),
    );
  }
}
