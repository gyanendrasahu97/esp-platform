# ESP Platform - IoT Device Management System

## Project Overview
Full-stack IoT platform: ESP32 devices + FastAPI backend + React dashboard + Flutter mobile app.
Dashboard and mobile publish commands directly to Mosquitto (no backend in the command path).
Backend handles telemetry storage, rules/OTA delivery, and device management APIs.
Dashboard includes a code editor (Monaco) with USB flashing (ESP Web Tools), remote OTA, UI Builder, and Logic Builder.
Mobile app handles BLE provisioning and renders dynamic UI defined by the ESP32 device itself.
Logic (rules engine) runs on the ESP32 — backend only delivers the rules JSON once via MQTT.

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

## MQTT Architecture
All four clients connect to the same Mosquitto broker simultaneously:
```
Dashboard  ── WSS /mqtt ──┐
                           ├──► Mosquitto ◄── TCP 1883 ── ESP32
Mobile App ── TCP 1883 ───┘          ▲
                                     │ TCP (internal Docker)
                                  Backend
```

**Who publishes/subscribes what:**
- **Dashboard**: publishes commands directly to broker (no HTTP), subscribes to telemetry/status/ui
- **Mobile**: publishes commands directly to broker (no HTTP), subscribes to telemetry/ui
- **ESP32**: publishes telemetry/status/ui/logs, subscribes to commands/rules/ota
- **Backend**: subscribes to telemetry/status/ui/logs (DB storage only), publishes rules/ota/ui (system ops)

**Commands bypass the backend entirely** — dashboard and mobile publish direct to Mosquitto.
**Backend MQTT is only for:** storing telemetry, tracking online/offline, and pushing rules/OTA/UI.

## MQTT Topic Structure
```
devices/{token}/telemetry  # ESP32 → broker. Backend stores in DB, dashboard/mobile display live
devices/{token}/commands   # Dashboard/mobile → broker → ESP32. Backend NOT involved
devices/{token}/status     # ESP32 LWT. Backend + dashboard track online/offline
devices/{token}/ota        # Backend → ESP32. OTA notification (URL + checksum)
devices/{token}/ui         # ESP32 → broker (on connect). Backend stores, dashboard renders controls
devices/{token}/rules      # Backend → ESP32. Logic Builder rules JSON (retain=true)
devices/{token}/logs       # ESP32 → broker. Backend logs to console
```

## Key Files
- `backend/app/mqtt_client.py`            - MQTT bridge: telemetry storage + rules/OTA/UI delivery
- `backend/app/api/rules.py`              - Logic Builder API: saves rules + pushes via MQTT retain
- `backend/app/api/commands.py`           - HTTP command endpoint (not used by dashboard/mobile; kept for server-side automation)
- `backend/app/services/compiler_service.py` - PlatformIO CLI wrapper
- `backend/app/api/ota.py`               - OTA upload, check, push endpoints
- `dashboard/src/components/editor/CodeEditor.tsx` - Monaco + ESP Web Tools + OTA flash
- `dashboard/src/hooks/useMqtt.ts`        - MQTT-over-WebSocket hook + publish() for direct commands
- `dashboard/src/components/ControlPanel.tsx` - Publishes commands direct to MQTT (no HTTP)
- `dashboard/src/pages/DeviceBuilderPage.tsx` - UI Builder + Logic Builder tabs
- `firmware/src/main.cpp`                 - ESP32 entry point
- `firmware/lib/ESPPlatform/ESPPlatform.cpp` - Core: WiFi/MQTT/BLE state machine
- `firmware/lib/ESPPlatform/rules_engine.cpp` - On-device rules evaluation (trigger/action engine)
- `firmware/lib/ESPPlatform/ble_provisioning.cpp` - BLE provisioning with credential pre-population
- `firmware/src/offline_buffer.cpp`       - LittleFS offline data buffering
- `mobile/lib/widgets/dynamic_ui.dart`    - Dynamic UI renderer from JSON descriptor
- `mobile/lib/services/mqtt_service.dart` - MQTT client + direct command publish
- `mobile/lib/services/ble_service.dart`  - BLE scan/connect/provision with existing token read

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
