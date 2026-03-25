import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.device import Device
from app.models.user import User
from app.schemas.device import DeviceCommand

router = APIRouter(prefix="/devices", tags=["commands"])


@router.post("/{device_id}/command")
async def send_command(
    device_id: uuid.UUID,
    body: DeviceCommand,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Device).where(Device.id == device_id, Device.owner_id == current_user.id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Import here to avoid circular dependency
    from app.mqtt_client import mqtt_manager
    topic = f"devices/{device.device_token}/commands"
    payload = {"action": body.action, "value": body.value}
    await mqtt_manager.publish(topic, payload)

    return {"status": "sent", "topic": topic}
