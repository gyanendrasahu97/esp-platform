import 'dart:io';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'services/api_service.dart';
import 'services/ble_service.dart';
import 'services/mqtt_service.dart';
import 'screens/dashboard_screen.dart';
import 'screens/login_screen.dart';

// Accept self-signed / incomplete-chain certs (Let's Encrypt on some devices)
class _TrustAllCerts extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) =>
      super.createHttpClient(context)
        ..badCertificateCallback = (cert, host, port) => true;
}

void main() {
  HttpOverrides.global = _TrustAllCerts();
  runApp(const EspPlatformApp());
}

class EspPlatformApp extends StatelessWidget {
  const EspPlatformApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ApiService()),
        ChangeNotifierProvider(create: (_) => BleService()),
        ChangeNotifierProvider(create: (_) => MqttService()),
      ],
      child: MaterialApp(
        title: 'ESP Platform',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF2563EB),
            brightness: Brightness.dark,
          ),
          useMaterial3: true,
          scaffoldBackgroundColor: const Color(0xFF0F172A),
          cardTheme: const CardTheme(
            color: Color(0xFF1E293B),
            elevation: 0,
          ),
        ),
        home: const AuthGate(),
      ),
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    final api = context.watch<ApiService>();
    return api.isLoggedIn ? const DashboardScreen() : const LoginScreen();
  }
}
