"""
PlatformIO CLI wrapper service.
Compiles ESP32 Arduino firmware from source code submitted via the dashboard.
"""
import asyncio
import json
import logging
import shutil
from pathlib import Path
from uuid import uuid4

from app.config import settings

logger = logging.getLogger(__name__)

TEMPLATES_DIR = Path(__file__).parent.parent.parent / "templates"

PLATFORMIO_INI_TEMPLATE = """[env:{board}]
platform = espressif32
board = {board}
framework = arduino
monitor_speed = 115200
lib_deps =
    knolleary/PubSubClient@^2.8
    bblanchon/ArduinoJson@^7.0
    NimBLE-Arduino
upload_speed = 921600
build_flags =
    -DCORE_DEBUG_LEVEL=0
"""

# In-memory store of running build processes (build_id -> asyncio.Queue)
_build_outputs: dict[str, asyncio.Queue] = {}
_semaphore: asyncio.Semaphore | None = None


def _get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(settings.max_concurrent_builds)
    return _semaphore


class CompilerService:

    def list_templates(self) -> list[dict]:
        templates = []
        if TEMPLATES_DIR.exists():
            for t in TEMPLATES_DIR.iterdir():
                if t.is_dir():
                    main_cpp = t / "src" / "main.cpp"
                    if main_cpp.exists():
                        templates.append({
                            "id": t.name,
                            "name": t.name.replace("_", " ").title(),
                            "description": self._read_template_description(t),
                        })
        return templates

    def _read_template_description(self, template_dir: Path) -> str:
        desc_file = template_dir / "description.txt"
        if desc_file.exists():
            return desc_file.read_text().strip()
        return ""

    def get_template_code(self, template_id: str) -> str | None:
        main_cpp = TEMPLATES_DIR / template_id / "src" / "main.cpp"
        if main_cpp.exists():
            return main_cpp.read_text()
        return None

    async def compile(self, source_code: str, board: str = "esp32dev") -> dict:
        build_id = str(uuid4())
        workspace = Path(settings.pio_workspace) / build_id
        workspace.mkdir(parents=True, exist_ok=True)

        # Write platformio.ini
        ini_content = PLATFORMIO_INI_TEMPLATE.format(board=board)
        (workspace / "platformio.ini").write_text(ini_content)

        # Write source code
        src_dir = workspace / "src"
        src_dir.mkdir(exist_ok=True)
        (src_dir / "main.cpp").write_text(source_code)

        output_lines = []
        queue: asyncio.Queue = asyncio.Queue()
        _build_outputs[build_id] = queue

        async def run():
            async with _get_semaphore():
                try:
                    proc = await asyncio.create_subprocess_exec(
                        "platformio", "run",
                        "-d", str(workspace),
                        "-e", board,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.STDOUT,
                    )
                    async for line in proc.stdout:
                        decoded = line.decode(errors="replace").rstrip()
                        output_lines.append(decoded)
                        await queue.put(decoded)

                    await proc.wait()
                    return proc.returncode
                except Exception as e:
                    await queue.put(f"ERROR: {e}")
                    return 1
                finally:
                    await queue.put(None)  # sentinel

        returncode = await run()
        success = (returncode == 0)

        bin_url = None
        if success:
            bin_path = workspace / ".pio" / "build" / board / "firmware.bin"
            if bin_path.exists():
                # Move to firmware storage
                storage = Path(settings.ota_storage_path) / "builds" / build_id
                storage.mkdir(parents=True, exist_ok=True)
                final_bin = storage / "firmware.bin"
                shutil.copy2(bin_path, final_bin)
                bin_url = f"/api/ota/build/{build_id}/firmware.bin"

        return {
            "build_id": build_id,
            "success": success,
            "bin_url": bin_url,
            "output": "\n".join(output_lines),
        }

    async def stream_output(self, build_id: str):
        queue = _build_outputs.get(build_id)
        if not queue:
            return
        while True:
            line = await queue.get()
            if line is None:
                break
            yield line

    async def cleanup(self, build_id: str):
        workspace = Path(settings.pio_workspace) / build_id
        if workspace.exists():
            shutil.rmtree(workspace, ignore_errors=True)
        _build_outputs.pop(build_id, None)


compiler_service = CompilerService()
