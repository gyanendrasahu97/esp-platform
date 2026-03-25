from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    database_url: str = "postgresql+asyncpg://espplatform:espplatform@localhost:5432/espplatform"

    # Auth
    secret_key: str = "dev-secret-key-change-in-production"
    access_token_expire_minutes: int = 10080  # 7 days

    # MQTT
    mqtt_broker: str = "localhost"
    mqtt_port: int = 1883
    mqtt_username: str = ""
    mqtt_password: str = ""

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Storage
    ota_storage_path: str = "/app/firmware_storage"
    pio_workspace: str = "/app/pio_workspace"
    ota_download_base_url: str = "http://localhost/api/ota/download"

    # Compiler
    max_concurrent_builds: int = 1


settings = Settings()
