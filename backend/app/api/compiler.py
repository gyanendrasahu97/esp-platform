import hashlib
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.config import settings
from app.database import get_db
from app.models.firmware import Firmware
from app.models.user import User
from app.services.compiler_service import compiler_service

router = APIRouter(prefix="/compiler", tags=["compiler"])


class BuildRequest(BaseModel):
    source_code: str
    board: str = "esp32dev"
    template: str = "basic"


class BuildResult(BaseModel):
    build_id: str
    success: bool
    bin_url: str | None = None
    firmware_id: str | None = None   # DB firmware UUID - use for OTA push
    output: str


@router.get("/templates")
async def list_templates(_: User = Depends(get_current_user)):
    return compiler_service.list_templates()


@router.get("/templates/{template_id}")
async def get_template_code(template_id: str, _: User = Depends(get_current_user)):
    code = compiler_service.get_template_code(template_id)
    if code is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"code": code}


@router.post("/build", response_model=BuildResult)
async def build_firmware(
    body: BuildRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await compiler_service.compile(
        source_code=body.source_code,
        board=body.board,
    )

    firmware_id = None

    # On success, register the binary as a Firmware DB record so OTA push can reference it
    if result["success"] and result.get("bin_url"):
        bin_path = Path(settings.ota_storage_path) / "builds" / result["build_id"] / "firmware.bin"
        checksum = None
        if bin_path.exists():
            checksum = hashlib.sha256(bin_path.read_bytes()).hexdigest()

        fw = Firmware(
            filename=f"build_{result['build_id']}.bin",
            version=f"build-{result['build_id'][:8]}",
            file_path=str(bin_path),
            file_size=bin_path.stat().st_size if bin_path.exists() else None,
            checksum=checksum,
            uploaded_by=current_user.id,
        )
        db.add(fw)
        await db.commit()
        await db.refresh(fw)
        firmware_id = str(fw.id)

    return BuildResult(
        build_id=result["build_id"],
        success=result["success"],
        bin_url=result.get("bin_url"),
        firmware_id=firmware_id,
        output=result["output"],
    )


@router.get("/build/{build_id}/stream")
async def stream_build(build_id: str, current_user: User = Depends(get_current_user)):
    """Stream build output via Server-Sent Events."""
    async def event_generator():
        async for line in compiler_service.stream_output(build_id):
            yield f"data: {line}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.delete("/build/{build_id}")
async def cleanup_build(build_id: str, current_user: User = Depends(get_current_user)):
    await compiler_service.cleanup(build_id)
    return {"status": "cleaned"}


@router.get("/manifest/{build_id}")
async def get_manifest(build_id: str):
    """ESP Web Tools manifest for USB flashing."""
    bin_url = f"/api/compiler/build/{build_id}/firmware.bin"
    manifest = {
        "name": "ESP Platform Custom Firmware",
        "builds": [
            {
                "chipFamily": "ESP32",
                "parts": [{"path": bin_url, "offset": 0x10000}]
            }
        ]
    }
    return JSONResponse(manifest)


@router.get("/build/{build_id}/firmware.bin")
async def download_build(build_id: str):
    """Serve compiled firmware binary for ESP Web Tools."""
    bin_path = Path(settings.ota_storage_path) / "builds" / build_id / "firmware.bin"
    if not bin_path.exists():
        raise HTTPException(status_code=404, detail="Build not found")
    return FileResponse(str(bin_path), filename="firmware.bin", media_type="application/octet-stream")
