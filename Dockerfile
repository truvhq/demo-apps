FROM node:20-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vite build

FROM node:20-slim AS truv-demo-app

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server/ server/
COPY --from=build /app/dist dist/

RUN groupadd --system appuser && useradd --system --gid appuser appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "const http = require('http'); http.get('http://localhost:3000/api/tunnel-url', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"
CMD ["node", "server/index.js"]
