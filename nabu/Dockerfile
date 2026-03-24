FROM python:3.12-slim AS base

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# Install bun globally
RUN curl -fsSL https://bun.sh/install | bash \
    && mv /root/.bun/bin/bun /usr/local/bin/bun

# Install yt-dlp
RUN pip install --no-cache-dir yt-dlp

# Install whisper
RUN pip install --no-cache-dir openai-whisper

# App setup
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --production
COPY src/ ./src/
COPY tsconfig.json ./

# Use /output as home so tools can write cache files to the mounted volume
ENV HOME=/output

# Run as the host user's UID/GID (passed via docker run --user)
# Default to 1000:1000 if not specified
USER 1000:1000

ENTRYPOINT ["bun", "run", "src/index.ts"]
