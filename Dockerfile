# syntax=docker/dockerfile:1.6

# ---- deps: install node modules once, reused by dev and build stages ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---- dev: runs the Vite dev server with source bind-mounted at runtime ----
FROM node:20-alpine AS dev
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=deps /app/node_modules /app/node_modules
COPY . .
ENV HOST=0.0.0.0 \
    PORT=5173 \
    CHOKIDAR_USEPOLLING=true
EXPOSE 5173
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["npm", "run", "dev"]

# ---- build: generates static site into /app/dist ----
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules /app/node_modules
COPY . .
# Snapshot any bundled dataset (uploaded via .railwayignore) as a seed, try to
# refresh from CelesTrak (best-effort — the build network may be blocked), then
# reconcile so we never ship an empty dataset when a seed is available.
RUN mkdir -p public/data \
 && cp -f public/data/satellites.json public/data/satellites.seed.json 2>/dev/null || true \
 && (npm run build:data && echo "[build] dataset refreshed from CelesTrak" \
       || echo "[build] build:data failed; falling back to bundled seed") \
 && node scripts/ensure-dataset.mjs \
 && rm -f public/data/satellites.seed.json \
 && npm run build

# ---- prod: tiny Node server (static + Cohere proxy), zero npm deps ----
FROM node:20-alpine AS prod
WORKDIR /app
RUN apk add --no-cache tini && adduser -D -H -u 10001 app
COPY --from=build /app/dist /app/dist
COPY server/server.js /app/server/server.js
ENV HOST=0.0.0.0 \
    PORT=8080 \
    NODE_ENV=production \
    STATIC_DIR=/app/dist
USER app
EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/server.js"]
