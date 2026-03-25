import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.device import Device
from app.models.telemetry import TelemetryRecord
from app.models.user import User
from app.schemas.telemetry import TelemetryOut

router = APIRouter(prefix="/devices", tags=["telemetry"])


@router.get("/{device_id}/telemetry", response_model=list[TelemetryOut])
async def get_telemetry(
    device_id: uuid.UUID,
    from_ts: datetime | None = Query(default=None),
    to_ts: datetime | None = Query(default=None),
    limit: int = Query(default=100, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify device ownership
    result = await db.execute(
        select(Device).where(Device.id == device_id, Device.owner_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Device not found")

    filters = [TelemetryRecord.device_id == device_id]
    if from_ts:
        filters.append(TelemetryRecord.recorded_at >= from_ts)
    if to_ts:
        filters.append(TelemetryRecord.recorded_at <= to_ts)

    result = await db.execute(
        select(TelemetryRecord)
        .where(and_(*filters))
        .order_by(TelemetryRecord.recorded_at.desc())
        .limit(limit)
    )
    return result.scalars().all()
