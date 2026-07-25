# syntax=docker/dockerfile:1.6

# ---- deps: install node modules once, reused by dev and build stages ----
FROM node:22-alpine AS deps
WORKDIR /app
# Pin npm to the major that writes this lockfile. The image's bundled npm (10.x)
# computes a different tree than npm 12 and reads the lock as out of sync; the
# previous `npm ci || npm install` fallback papered over that by silently
# resolving fresh versions, which defeats the lockfile as a supply-chain
# control. Keep `npm ci` strict so a real integrity mismatch FAILS the build.
# (npm 12 requires Node >= 22, which is also why these stages are on 22 LTS —
# Node 20 is past end-of-life and no longer receives security patches.)
RUN npm i -g npm@12.0.1
COPY package.json package-lock.json* ./
RUN npm ci

# ---- dev: runs the Vite dev server with source bind-mounted at runtime ----
FROM node:22-alpine AS dev
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
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules /app/node_modules
COPY . .
# Try to refresh the dataset from CelesTrak (best-effort — the build network may
# be blocked), then reconcile via ensure-dataset, which falls back to the
# git-tracked gzipped seed so we never deploy an empty dataset. Drop the seed
# before `npm run build` so it isn't copied into dist/.
RUN mkdir -p public/data \
 && (npm run build:data && echo "[build] dataset refreshed from CelesTrak" \
       || echo "[build] build:data failed; falling back to bundled seed") \
 && node scripts/ensure-dataset.mjs \
 && rm -f public/data/satellites.seed.json public/data/satellites.seed.json.gz \
 && npm run build

# ---- prod: tiny Node server (static + Cohere proxy), zero npm deps ----
FROM node:22-alpine AS prod
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
