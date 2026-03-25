import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import engine
from app.database import Base  # noqa: F401 - needed to register models with metadata
from app.mqtt_client import mqtt

# Import all models so Alembic/Base can see them
import app.models.user      # noqa: F401
import app.models.device    # noqa: F401
import app.models.telemetry # noqa: F401
import app.models.firmware  # noqa: F401

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup — must call mqtt.connection() explicitly because fastapi_mqtt
    # uses @app.on_event("startup") internally, which is skipped when lifespan= is set
    await mqtt.connection()
    logger.info("ESP Platform backend started, MQTT connected")
    yield
    # Shutdown
    logger.info("Shutting down...")


def create_app() -> FastAPI:
    app = FastAPI(
        title="ESP Platform API",
        version="1.0.0",
        description="IoT device management platform for ESP32 devices",
        lifespan=lifespan,
    )

    # CORS - allow dashboard dev server
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://localhost:5173", "http://localhost",
                       "https://esp.cruzanet.cloud"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount MQTT
    mqtt.init_app(app)

    # Register API routers
    from app.api import auth, devices, telemetry, commands, ota, compiler
    from app.websocket import live_data

    prefix = "/api"
    app.include_router(auth.router, prefix=prefix)
    app.include_router(devices.router, prefix=prefix)
    app.include_router(telemetry.router, prefix=prefix)
    app.include_router(commands.router, prefix=prefix)
    app.include_router(ota.router, prefix=prefix)
    app.include_router(compiler.router, prefix=prefix)
    app.include_router(live_data.router)  # /ws prefix already set

    @app.get("/api/health")
    async def health():
        return {"status": "ok", "service": "esp-platform"}

    return app


app = create_app()
