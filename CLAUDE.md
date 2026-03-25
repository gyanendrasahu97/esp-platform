# ESP Platform - IoT Device Management System

## Project Overview
Full-stack IoT platform: ESP32 devices + FastAPI backend + React dashboard + Flutter mobile app.
Devices connect via MQTT for real-time data, HTTP for OTA updates. Dashboard includes a code editor
(Monaco) with USB flashing (ESP Web Tools) and remote OTA. Mobile app handles BLE provisioning
and renders dynamic UI defined by the ESP32 device itself.

## Architecture
- **Backend:** FastAPI (Python 3.12), async SQLAlchemy + asyncpg, PostgreSQL 16, Redis 7, MQTT via fastapi-mqtt
- **Dashboard:** React 19, Vite, Tailwind 4, TypeScript, Zustand, Monaco Editor, ESP Web Tools
- **Firmware:** ESP32, Arduino framework via PlatformIO, NimBLE for BLE provisioning, LittleFS for offline buffering
- **Mobile:** Flutter, flutter_reactive_ble for BLE, mqtt_client for real-time data
- **Infrastructure:** Docker Compose (PostgreSQL 16, Redis 7, Mosquitto 2, Nginx)

## Directory Structure
```
e:/ESP PLATFORM/
├── backend/      - FastAPI application
├── dashboard/    - React web dashboard
├── firmware/     - ESP32 PlatformIO project
├── mobile/       - Flutter mobile app
├── docker/       - Docker configs (mosquitto/, nginx/)
├── docker-compose.yml
├── .env.example
└── .gitignore
```

## Development Commands
```bash
# Full stack
docker-compose up --build

# Backend only (hot reload)
cd backend && uvicorn app.main:app --reload --port 8000

# Dashboard dev server
cd dashboard && npm run dev

# ESP32 firmware
cd firmware && pio run              # build
cd firmware && pio run -t upload    # flash via USB
cd firmware && pio device monitor   # serial monitor

# Flutter mobile
cd mobile && flutter run

# Database migrations
cd backend && alembic upgrade head
cd backend && alembic revision --autogenerate -m "description"
```

## API Conventions
- All routes prefixed with `/api/`
- Auth: `POST /api/auth/login` returns JWT, pass as `Authorization: Bearer <token>`
- Device auth: `device_token` used as MQTT username (UUID, never changes)
- All responses use Pydantic schemas (never raw ORM objects)
- Errors: `{"detail": "message"}` with appropriate HTTP status

## MQTT Topic Structure
```
devices/{device_id}/telemetry   # Device publishes sensor data (JSON)
devices/{device_id}/commands    # Backend publishes commands, device subscribes
devices/{device_id}/status      # Device online/offline (LWT: "offline")
devices/{device_id}/ota         # Backend publishes OTA notification
devices/{device_id}/ui          # Device publishes its UI descriptor JSON
devices/{device_id}/logs        # Device publishes log messages
```

## Key Files
- `backend/app/mqtt_client.py`            - MQTT bridge (most critical integration)
- `backend/app/services/compiler_service.py` - PlatformIO CLI wrapper
- `backend/app/api/ota.py`               - OTA upload, check, push endpoints
- `dashboard/src/components/editor/CodeEditor.tsx` - Monaco + ESP Web Tools + OTA flash
- `dashboard/src/hooks/useMqtt.ts`        - MQTT-over-WebSocket hook
- `firmware/src/main.cpp`                 - ESP32 entry point + state machine
- `firmware/src/offline_buffer.cpp`       - LittleFS offline data buffering
- `mobile/lib/widgets/dynamic_ui.dart`    - Dynamic UI renderer from JSON descriptor

## Environment Variables
Copy `.env.example` to `.env` and fill in values. Never commit `.env`.

## Dynamic UI JSON Format
```json
{
  "device_name": "Pump Controller",
  "firmware_version": "1.0.0",
  "controls": [
    {"type": "switch", "label": "Motor", "action": "set_motor"},
    {"type": "slider", "label": "Speed", "action": "set_speed", "min": 0, "max": 100},
    {"type": "sensor", "label": "Soil Moisture", "key": "soil_moisture", "unit": "%"},
    {"type": "button",  "label": "Reset", "action": "reset"}
  ]
}
```
Control types: `switch`, `slider`, `button`, `sensor`, `gauge`

## Connection State Machine (ESP32)
```
BOOT -> CHECK_NVS -> [no creds] -> BLE_PROVISIONING -> SAVE_NVS -> RESTART
                  -> [has creds] -> WIFI_CONNECTING -> [fail] -> OFFLINE_BUFFERING
                                                    -> [ok]   -> MQTT_CONNECTING -> CONNECTED
```
