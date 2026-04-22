FROM node:20-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vite build

FROM node:20-slim AS deps

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-slim AS truv-demo-app

WORKDIR /app
COPY package.json ./
COPY server/ server/
COPY --from=deps  /app/node_modules node_modules/
COPY --from=build /app/dist         dist/

RUN groupadd --system appuser && \
    useradd --system --gid appuser appuser && \
    chown -R appuser:appuser /app
USER appuser

EXPOSE 3000

ENTRYPOINT ["node"]
CMD ["server/index.js"]
