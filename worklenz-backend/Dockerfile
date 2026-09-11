# --- Stage 1: Build ---
FROM node:20-slim AS builder

ARG RELEASE_VERSION
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    curl \
    postgresql-server-dev-all \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run clean
RUN npx tsc --build tsconfig.prod.json --pretty false 2>&1; TSC_EXIT=$?; if [ $TSC_EXIT -ne 0 ]; then echo "TSC FAILED WITH EXIT CODE $TSC_EXIT"; exit $TSC_EXIT; fi
RUN npm run copy
RUN npm run compress

RUN echo "$RELEASE_VERSION" > release

# --- Stage 2: Production Image ---
FROM node:20-slim

RUN apt-get update && apt-get install -y libpq5 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/build ./build
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/release ./release
COPY --from=builder /usr/src/app/worklenz-email-templates ./worklenz-email-templates


EXPOSE 3000
CMD ["node", "build/bin/www"]

