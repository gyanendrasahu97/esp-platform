import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class DeviceCreate(BaseModel):
    name: str


class DeviceUpdate(BaseModel):
    name: str | None = None
    ui_descriptor: dict[str, Any] | None = None


class DeviceHeartbeat(BaseModel):
    device_token: str
    firmware_version: str | None = None
    ip_address: str | None = None


class DeviceOut(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    device_token: str
    firmware_version: str | None
    target_firmware_version: str | None
    is_online: bool
    last_seen: datetime | None
    ip_address: str | None
    ui_descriptor: dict[str, Any] | None
    created_at: datetime


class DeviceCommand(BaseModel):
    action: str
    value: Any = None
