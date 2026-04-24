# syntax=docker/dockerfile:1.6

# ---- deps: install node modules once, reused by dev and build stages ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# No lockfile yet on first build; fall back to `npm install`.
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
RUN npm run build:data && npm run build

# ---- prod: serves the built dist via nginx ----
FROM nginx:1.27-alpine AS prod
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
