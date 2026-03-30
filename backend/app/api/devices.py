import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.device import Device
from app.models.user import User
from app.schemas.device import DeviceCreate, DeviceHeartbeat, DeviceOut, DeviceUpdate

router = APIRouter(prefix="/devices", tags=["devices"])


@router.get("", response_model=list[DeviceOut])
async def list_devices(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Device).where(Device.owner_id == current_user.id))
    return result.scalars().all()


@router.post("", response_model=DeviceOut, status_code=status.HTTP_201_CREATED)
async def create_device(
    body: DeviceCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    device = Device(
        name=body.name,
        device_token=str(uuid.uuid4()),
        owner_id=current_user.id,
    )
    db.add(device)
    await db.commit()
    await db.refresh(device)
    return device


@router.get("/{device_id}", response_model=DeviceOut)
async def get_device(
    device_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Device).where(Device.id == device_id, Device.owner_id == current_user.id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.patch("/{device_id}", response_model=DeviceOut)
async def update_device(
    device_id: uuid.UUID,
    body: DeviceUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Device).where(Device.id == device_id, Device.owner_id == current_user.id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    if body.name is not None:
        device.name = body.name
    if body.ui_descriptor is not None:
        device.ui_descriptor = body.ui_descriptor

    await db.commit()
    await db.refresh(device)
    return device


@router.delete("/{device_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_device(
    device_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Device).where(Device.id == device_id, Device.owner_id == current_user.id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    await db.delete(device)
    await db.commit()


@router.put("/{device_id}/ui", response_model=DeviceOut)
async def update_device_ui(
    device_id: uuid.UUID,
    body: dict,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save a UI descriptor and push it to the device via MQTT (retain=true)."""
    result = await db.execute(
        select(Device).where(Device.id == device_id, Device.owner_id == current_user.id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    device.ui_descriptor = body
    await db.commit()
    await db.refresh(device)

    import json
    from app.mqtt_client import mqtt_manager
    topic = f"devices/{device.device_token}/ui"
    try:
        await mqtt_manager.publish(topic, json.dumps(body), qos=1, retain=True)
    except Exception:
        pass  # Still saved to DB even if MQTT fails

    return device


@router.post("/heartbeat", status_code=status.HTTP_200_OK)
async def heartbeat(body: DeviceHeartbeat, db: AsyncSession = Depends(get_db)):
    """Called by ESP32 on boot to register its presence."""
    result = await db.execute(select(Device).where(Device.device_token == body.device_token))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    device.is_online = True
    device.last_seen = datetime.now(timezone.utc)
    if body.firmware_version:
        device.firmware_version = body.firmware_version
    if body.ip_address:
        device.ip_address = body.ip_address

    await db.commit()
    return {"status": "ok", "device_id": str(device.id)}
