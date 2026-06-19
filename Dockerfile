FROM node:22-bookworm-slim

# Install Chromium
RUN apt-get update && apt-get install -y \
  chromium \
  unzip \
  ca-certificates \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Tell Puppeteer to use the system Chromium instead of downloading its own
ENV PUPPETEER_SKIP_BROWSER_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Pre-download the Reader View extension so it works offline at runtime
RUN node src/download-extension.js

RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8080

ENV PORT=8080
ENV LOG_LEVEL=info

CMD ["node", "src/server.js"]
