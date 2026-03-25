/**
 * ESP Platform - Blink Template
 * Simple LED blink to verify your setup works.
 */
#include <Arduino.h>

#define LED_PIN 2  // Built-in LED on most ESP32 boards

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  Serial.println("ESP Platform: Blink template started!");
}

void loop() {
  digitalWrite(LED_PIN, HIGH);
  Serial.println("LED ON");
  delay(1000);

  digitalWrite(LED_PIN, LOW);
  Serial.println("LED OFF");
  delay(1000);
}
