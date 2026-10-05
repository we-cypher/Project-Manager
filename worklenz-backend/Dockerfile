# --- Stage 1: Build ---
FROM node:20-slim AS builder

# bcrypt and segfault-handler compile native addons. pg is pure JS,
# so postgresql-server-dev-all is not needed.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./

# System Chromium is installed in the production stage. Skip Puppeteer's
# postinstall browser download.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

RUN --mount=type=cache,target=/root/.npm \
    npm ci --include=dev

COPY . .
RUN npm run build

ARG RELEASE_VERSION
RUN echo "$RELEASE_VERSION" > release

# --- Stage 2: Production Image ---
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    chromium \
    fonts-liberation \
    fonts-dejavu-core \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/build ./build
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/release ./release
COPY --from=builder /usr/src/app/worklenz-email-templates ./worklenz-email-templates

EXPOSE 3000
CMD ["node", "build/bin/www"]
