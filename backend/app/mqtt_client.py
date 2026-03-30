"""
MQTT Bridge - most critical integration file.
Subscribes to device topics, stores telemetry, fans out to Redis for WebSocket clients.
"""
import json
import logging
from datetime import datetime, timezone

from fastapi_mqtt import FastMQTT, MQTTConfig
from sqlalchemy import select

from app.config import settings

logger = logging.getLogger(__name__)

mqtt_config = MQTTConfig(
    host=settings.mqtt_broker,
    port=settings.mqtt_port,
    username=settings.mqtt_username or None,
    password=settings.mqtt_password or None,
    keepalive=60,
    reconnect_retries=10,
    reconnect_delay=5,
)

mqtt = FastMQTT(config=mqtt_config)


class MqttManager:
    def __init__(self):
        self._redis = None
        self._connected = False

    async def get_redis(self):
        if self._redis is None:
            import redis.asyncio as aioredis
            self._redis = aioredis.from_url(settings.redis_url, decode_responses=True)
        return self._redis

    async def publish(self, topic: str, payload: dict | str, qos: int = 1, retain: bool = False):
        if not self._connected:
            raise RuntimeError("MQTT broker not connected")
        if isinstance(payload, dict):
            payload = json.dumps(payload)
        try:
            mqtt.publish(topic, payload, qos=qos, retain=retain)
            logger.debug(f"Published to {topic}: {payload[:100]}")
        except Exception as e:
            raise RuntimeError(f"MQTT publish failed: {e}")

    async def fanout_to_redis(self, device_id: str, data: dict):
        redis = await self.get_redis()
        channel = f"device:{device_id}:telemetry"
        await redis.publish(channel, json.dumps(data))


mqtt_manager = MqttManager()


@mqtt.on_connect()
def on_connect(client, flags, rc, properties):
    logger.info(f"MQTT connected: rc={rc}")
    mqtt_manager._connected = True
    mqtt.client.subscribe("devices/+/telemetry", qos=1)
    mqtt.client.subscribe("devices/+/status", qos=1)
    mqtt.client.subscribe("devices/+/ui", qos=1)
    mqtt.client.subscribe("devices/+/logs", qos=1)


@mqtt.on_disconnect()
def on_disconnect(client, packet, exc=None):
    logger.warning(f"MQTT disconnected: {exc}")
    mqtt_manager._connected = False


@mqtt.on_message()
async def on_message(client, topic: str, payload: bytes, qos: int, properties):
    try:
        parts = topic.split("/")
        if len(parts) < 3:
            return

        device_token = parts[1]
        msg_type = parts[2]

        if msg_type == "status":
            # LWT payload is a plain string ("online"/"offline"), not JSON
            await _handle_status(device_token, payload.decode().strip())
            return

        data = json.loads(payload.decode())
        if msg_type == "telemetry":
            await _handle_telemetry(device_token, data)
        elif msg_type == "ui":
            await _handle_ui(device_token, data)
        elif msg_type == "logs":
            await _handle_logs(device_token, data)

    except Exception as e:
        logger.error(f"Error processing MQTT message on {topic}: {e}")


async def _handle_telemetry(device_token: str, data: dict):
    from app.database import AsyncSessionLocal
    from app.models.device import Device
    from app.models.telemetry import TelemetryRecord

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Device).where(Device.device_token == device_token))
        device = result.scalar_one_or_none()
        if not device:
            logger.warning(f"Telemetry from unknown device token: {device_token[:8]}...")
            return

        # Store in PostgreSQL
        record = TelemetryRecord(device_id=device.id, payload=data)
        db.add(record)

        # Update device last_seen
        device.is_online = True
        device.last_seen = datetime.now(timezone.utc)
        await db.commit()

        # Fan out to Redis for WebSocket subscribers
        await mqtt_manager.fanout_to_redis(str(device.id), {
            "device_id": str(device.id),
            "payload": data,
            "ts": datetime.now(timezone.utc).isoformat(),
        })


async def _handle_status(device_token: str, data: str | dict):
    from app.database import AsyncSessionLocal
    from app.models.device import Device

    status = data if isinstance(data, str) else data.get("status", "")
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Device).where(Device.device_token == device_token))
        device = result.scalar_one_or_none()
        if device:
            device.is_online = (status == "online")
            device.last_seen = datetime.now(timezone.utc)
            await db.commit()
            logger.info(f"Device {device.id} status: {status}")


async def _handle_ui(device_token: str, data: dict):
    from app.database import AsyncSessionLocal
    from app.models.device import Device

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Device).where(Device.device_token == device_token))
        device = result.scalar_one_or_none()
        if device:
            device.ui_descriptor = data
            await db.commit()
            logger.info(f"Updated UI descriptor for device {device.id}")


async def _handle_logs(device_token: str, data: dict):
    logger.info(f"[Device {device_token[:8]}] {data.get('message', str(data))}")
