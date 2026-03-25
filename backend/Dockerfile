FROM python:3.12-slim

# Install system dependencies + PlatformIO prerequisites
RUN apt-get update && apt-get install -y \
    curl \
    git \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install PlatformIO Core
RUN pip install --no-cache-dir platformio

# Pre-install ESP32 Arduino platform (cached in Docker volume)
# This runs at container start via entrypoint if cache is empty
RUN mkdir -p /root/.platformio

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Create storage directories
RUN mkdir -p /app/firmware_storage /app/pio_workspace

EXPOSE 8000

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
