import hashlib
import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import settings
from app.database import get_db
from app.models.device import Device
from app.models.firmware import Firmware
from app.models.user import User
from app.schemas.ota import FirmwareOut, OtaLatest, OtaPush

router = APIRouter(prefix="/ota", tags=["ota"])


@router.post("/upload", response_model=FirmwareOut, status_code=201)
async def upload_firmware(
    version: str = Form(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    storage = Path(settings.ota_storage_path)
    storage.mkdir(parents=True, exist_ok=True)

    firmware_id = uuid.uuid4()
    filename = f"{firmware_id}_{file.filename}"
    file_path = storage / filename

    sha256 = hashlib.sha256()
    size = 0

    async with aiofiles.open(file_path, "wb") as f:
        while chunk := await file.read(65536):
            await f.write(chunk)
            sha256.update(chunk)
            size += len(chunk)

    fw = Firmware(
        id=firmware_id,
        filename=file.filename,
        version=version,
        file_path=str(file_path),
        file_size=size,
        checksum=sha256.hexdigest(),
        uploaded_by=current_user.id,
    )
    db.add(fw)
    await db.commit()
    await db.refresh(fw)
    return fw


@router.get("/list", response_model=list[FirmwareOut])
async def list_firmware(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(select(Firmware).order_by(Firmware.created_at.desc()))
    return result.scalars().all()


@router.get("/download/{firmware_id}")
async def download_firmware(firmware_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    """Public endpoint - ESP32 downloads firmware from here (authenticated via device_token in query)."""
    result = await db.execute(select(Firmware).where(Firmware.id == firmware_id))
    fw = result.scalar_one_or_none()
    if not fw:
        raise HTTPException(status_code=404, detail="Firmware record not found in database")
    
    file_path = Path(fw.file_path)
    if not file_path.exists():
        print(f"ERROR: OTA File missing on disk at {fw.file_path}")
        raise HTTPException(
            status_code=404, 
            detail=f"Firmware file not found on server storage: {fw.filename}. "
                   "Check if your /app/firmware_storage volume is correctly mounted in Dokploy!"
        )
        
    return FileResponse(fw.file_path, filename=fw.filename, media_type="application/octet-stream")


@router.get("/{device_token}/latest", response_model=OtaLatest)
async def check_for_update(device_token: str, current_version: str | None = None, db: AsyncSession = Depends(get_db)):
    """ESP32 polls this endpoint to check if an update is available."""
    result = await db.execute(select(Device).where(Device.device_token == device_token))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    if not device.target_firmware_version:
        return OtaLatest(has_update=False)

    if current_version == device.target_firmware_version:
        return OtaLatest(has_update=False)

    # Find the firmware record for the target version
    result = await db.execute(
        select(Firmware).where(Firmware.version == device.target_firmware_version).order_by(Firmware.created_at.desc())
    )
    fw = result.scalar_one_or_none()
    if not fw:
        return OtaLatest(has_update=False)

    download_url = f"{settings.ota_download_base_url}/{fw.id}"
    return OtaLatest(has_update=True, version=fw.version, download_url=download_url, checksum=fw.checksum)


@router.post("/{device_id}/push")
async def push_ota(
    device_id: uuid.UUID,
    body: OtaPush,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Push OTA notification to device via MQTT."""
    result = await db.execute(
        select(Device).where(Device.id == device_id, Device.owner_id == current_user.id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    result = await db.execute(select(Firmware).where(Firmware.id == body.firmware_id))
    fw = result.scalar_one_or_none()
    if not fw:
        raise HTTPException(status_code=404, detail="Firmware not found")

    device.target_firmware_version = fw.version
    await db.commit()

    from app.mqtt_client import mqtt_manager
    topic = f"devices/{device.device_token}/ota"
    payload = {
        "version": fw.version,
        "url": f"{settings.ota_download_base_url}/{fw.id}",
        "checksum": fw.checksum,
    }
    await mqtt_manager.publish(topic, payload)

    return {"status": "pushed", "version": fw.version}
