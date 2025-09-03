# extensions/avail-nomination-monitor/Dockerfile

FROM node:20-alpine AS deps
WORKDIR /app

# Salin manifest monorepo extension
COPY package.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/api/package.json packages/api/
COPY packages/worker/package.json packages/worker/

# Install deps untuk semua workspace
RUN npm i

# --- Build library packages dulu (core & db) ---
FROM deps AS build_libs
WORKDIR /app
COPY packages/core packages/core
COPY packages/db packages/db
RUN npm -w packages/core run build && npm -w packages/db run build

# --- Build API & Worker ---
FROM build_libs AS build_all
WORKDIR /app
COPY packages/api packages/api
COPY packages/worker packages/worker
RUN npm -w packages/api run build && npm -w packages/worker run build

# ---------- Runtime: API ----------
FROM node:20-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
# copy node_modules & dist dari build
COPY --from=build_all /app/node_modules ./node_modules
COPY --from=build_all /app/packages ./packages
EXPOSE 3000
CMD ["node","packages/api/dist/index.js"]

# ---------- Runtime: Worker ----------
FROM node:20-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build_all /app/node_modules ./node_modules
COPY --from=build_all /app/packages ./packages
CMD ["node","packages/worker/dist/index.js"]

