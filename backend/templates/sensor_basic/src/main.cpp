/**
 * ESP Platform - Basic Sensor Template
 * Connects to WiFi + MQTT, publishes sensor data every 5 seconds.
 * Customize the sensor reading section for your hardware.
 */
#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ---- Configuration (set via BLE provisioning or hardcode for testing) ----
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* MQTT_BROKER   = "YOUR_BACKEND_IP";
const int   MQTT_PORT     = 1883;
const char* DEVICE_TOKEN  = "YOUR_DEVICE_TOKEN";  // From ESP Platform dashboard

// ---- MQTT Topics ----
String telemetryTopic;
String commandsTopic;

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

void connectWiFi() {
  Serial.printf("Connecting to WiFi: %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\nConnected! IP: %s\n", WiFi.localIP().toString().c_str());
}

void onMqttMessage(char* topic, byte* payload, unsigned int length) {
  String msg = String((char*)payload).substring(0, length);
  Serial.printf("Command received: %s\n", msg.c_str());

  JsonDocument doc;
  if (deserializeJson(doc, msg) == DeserializationError::Ok) {
    String action = doc["action"].as<String>();
    // Handle your actions here
    if (action == "set_led") {
      bool value = doc["value"].as<bool>();
      digitalWrite(2, value ? HIGH : LOW);
    }
  }
}

void connectMQTT() {
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(onMqttMessage);

  while (!mqttClient.connected()) {
    Serial.print("Connecting to MQTT...");
    if (mqttClient.connect(DEVICE_TOKEN, DEVICE_TOKEN, "")) {
      Serial.println("connected");
      mqttClient.subscribe(commandsTopic.c_str());
    } else {
      Serial.printf("failed, rc=%d, retrying in 5s\n", mqttClient.state());
      delay(5000);
    }
  }
}

float readSensor() {
  // Replace with your actual sensor reading
  // Example: DHT22, analog sensor, etc.
  return random(200, 300) / 10.0f;  // Simulated 20.0 - 30.0
}

void publishTelemetry() {
  JsonDocument doc;
  doc["temperature"] = readSensor();
  doc["humidity"]    = random(400, 800) / 10.0f;
  doc["uptime_s"]    = millis() / 1000;

  char buffer[256];
  serializeJson(doc, buffer);
  mqttClient.publish(telemetryTopic.c_str(), buffer);
  Serial.printf("Published: %s\n", buffer);
}

void setup() {
  Serial.begin(115200);
  pinMode(2, OUTPUT);

  telemetryTopic = String("devices/") + DEVICE_TOKEN + "/telemetry";
  commandsTopic  = String("devices/") + DEVICE_TOKEN + "/commands";

  connectWiFi();
  connectMQTT();

  Serial.println("ESP Platform: Sensor template ready!");
}

void loop() {
  if (!mqttClient.connected()) {
    connectMQTT();
  }
  mqttClient.loop();

  static unsigned long lastPublish = 0;
  if (millis() - lastPublish > 5000) {
    publishTelemetry();
    lastPublish = millis();
  }
}
