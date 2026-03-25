"""
WebSocket endpoint that bridges MQTT telemetry to browser clients via Redis pub/sub.
"""
import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import AsyncSessionLocal
from app.models.device import Device
from app.models.user import User
from app.mqtt_client import mqtt_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ws")


async def _get_user_from_token(token: str) -> User | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        user_id = payload.get("sub")
        if not user_id:
            return None
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(User).where(User.id == user_id))
            return result.scalar_one_or_none()
    except JWTError:
        return None


@router.websocket("/devices/{device_id}/live")
async def device_live(websocket: WebSocket, device_id: uuid.UUID, token: str):
    """
    WebSocket endpoint for live telemetry.
    Client connects with: ws://host/ws/devices/{id}/live?token=<jwt>
    Streams JSON frames: {"device_id": "...", "payload": {...}, "ts": "..."}
    """
    user = await _get_user_from_token(token)
    if not user:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    # Verify device ownership
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Device).where(Device.id == device_id, Device.owner_id == user.id)
        )
        device = result.scalar_one_or_none()

    if not device:
        await websocket.close(code=4004, reason="Device not found")
        return

    await websocket.accept()
    logger.info(f"WS client connected for device {device_id}")

    redis = await mqtt_manager.get_redis()
    pubsub = redis.pubsub()
    channel = f"device:{device_id}:telemetry"
    await pubsub.subscribe(channel)

    try:
        while True:
            message = await asyncio.wait_for(pubsub.get_message(ignore_subscribe_messages=True), timeout=30.0)
            if message and message["type"] == "message":
                await websocket.send_text(message["data"])
            else:
                # Heartbeat ping to keep connection alive
                await websocket.send_text('{"type":"ping"}')
    except (WebSocketDisconnect, asyncio.TimeoutError):
        pass
    except Exception as e:
        logger.error(f"WS error for device {device_id}: {e}")
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.close()
        logger.info(f"WS client disconnected for device {device_id}")
