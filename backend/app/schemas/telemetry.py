import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class TelemetryOut(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    device_id: uuid.UUID
    payload: dict[str, Any]
    recorded_at: datetime


class TelemetryQuery(BaseModel):
    from_ts: datetime | None = None
    to_ts: datetime | None = None
    limit: int = 100
