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

# Invoice/receipt PDFs need system Chromium. Leave this false to skip that
# install (it is the slow part of the backend image build).
# Coolify: mark ENABLE_INVOICE_PDF as available at build time, then rebuild.
ARG ENABLE_INVOICE_PDF=false

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    ca-certificates \
    && if [ "$ENABLE_INVOICE_PDF" = "true" ]; then \
         apt-get install -y --no-install-recommends \
           chromium \
           fonts-liberation \
           fonts-dejavu-core; \
       fi \
    && rm -rf /var/lib/apt/lists/*

ENV ENABLE_INVOICE_PDF=${ENABLE_INVOICE_PDF} \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/build ./build
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/release ./release
COPY --from=builder /usr/src/app/worklenz-email-templates ./worklenz-email-templates
COPY --from=builder /usr/src/app/scripts/migrate.js ./scripts/migrate.js
COPY --from=builder /usr/src/app/database/pg-migrations ./database/pg-migrations

EXPOSE 3000
CMD ["node", "build/bin/www"]
