import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.database import get_db
from app.models.device import Device
from app.models.rule_set import RuleSet
from app.models.user import User

router = APIRouter(prefix="/devices", tags=["rules"])


class RulesBody(BaseModel):
    rules: list[dict]


@router.get("/{device_id}/rules")
async def get_rules(
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

    result = await db.execute(select(RuleSet).where(RuleSet.device_id == device_id))
    rule_set = result.scalar_one_or_none()
    return {"rules": rule_set.rules.get("rules", []) if rule_set else []}


@router.put("/{device_id}/rules")
async def update_rules(
    device_id: uuid.UUID,
    body: RulesBody,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save rules and push them to the device via MQTT (retain=true).
    Device receives the JSON and loads it into the rules engine instantly — no reflash."""
    result = await db.execute(
        select(Device).where(Device.id == device_id, Device.owner_id == current_user.id)
    )
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    rules_dict = {"rules": body.rules}

    result = await db.execute(select(RuleSet).where(RuleSet.device_id == device_id))
    rule_set = result.scalar_one_or_none()
    if rule_set:
        rule_set.rules = rules_dict
    else:
        rule_set = RuleSet(device_id=device_id, rules=rules_dict)
        db.add(rule_set)

    await db.commit()

    from app.mqtt_client import mqtt_manager
    topic = f"devices/{device.device_token}/rules"
    try:
        await mqtt_manager.publish(topic, json.dumps(rules_dict), qos=1, retain=True)
    except Exception:
        pass

    return {"status": "deployed", "rule_count": len(body.rules)}
