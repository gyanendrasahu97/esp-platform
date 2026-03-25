import uuid
from datetime import datetime

from pydantic import BaseModel


class FirmwareOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    filename: str
    version: str
    file_size: int | None
    checksum: str | None
    created_at: datetime


class OtaLatest(BaseModel):
    has_update: bool
    version: str | None = None
    download_url: str | None = None
    checksum: str | None = None


class OtaPush(BaseModel):
    firmware_id: uuid.UUID
