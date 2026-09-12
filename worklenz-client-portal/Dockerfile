FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --include=dev

COPY . .

RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build

FROM node:22-alpine AS production

WORKDIR /app

RUN npm install -g serve

COPY --from=build /app/dist /app/dist

# Create env-config.sh script to inject runtime env vars
RUN echo '#!/bin/sh' > /app/env-config.sh && \
    echo 'cat > /app/dist/env-config.js << EOL' >> /app/env-config.sh && \
    echo 'window.CLIENT_PORTAL_API_URL="${CLIENT_PORTAL_API_URL:-}";' >> /app/env-config.sh && \
    echo 'window.CLIENT_PORTAL_SOCKET_URL="${CLIENT_PORTAL_SOCKET_URL:-}";' >> /app/env-config.sh && \
    echo 'EOL' >> /app/env-config.sh && \
    chmod +x /app/env-config.sh

# Create start.sh script
RUN echo '#!/bin/sh' > /app/start.sh && \
    echo '/app/env-config.sh' >> /app/start.sh && \
    echo 'exec serve -s dist -l 5174' >> /app/start.sh && \
    chmod +x /app/start.sh

EXPOSE 5174
CMD ["/app/start.sh"]
