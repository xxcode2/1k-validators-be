# Nomination-Program-Monitoring-Algorithm

Backend monitoring algorithm for Avail's Nomination Program. Inspired by Kusama's 1KV, tailored to Avail's metrics & weights.

## Features
- Data collector (worker) pulling validator metrics via Avail RPC / SDK
- Scoring module (configurable weights & normalization)
- MongoDB persistence for current and historical snapshots
- REST API (Express) to expose scores, breakdowns, and recommendations
- Dockerized (api, worker, mongo, mongo-express)
- MIT licensed

## Quick Start
1) Prereqs: Docker & Docker Compose
2) Copy `.env.example` to `.env` and edit values
3) Run:
```bash
docker compose up -d --build
```
API will be at `http://localhost:3000`, Mongo Express at `http://localhost:8081`.

### Environment
- `MONGO_URI` (e.g. `mongodb://mongo:27017/avail_np`)
- `PORT` (default 3000)
- `RPC_ENDPOINT` (Avail RPC endpoint URL)
- `CRON` (worker schedule, e.g. `*/10 * * * *`)

## Monorepo Layout
```
packages/
  core/    # scoring & types
  db/      # mongoose models & connector
  api/     # REST API
  worker/  # data collector & scheduler
```

## Scoring Weights (Total 100)
- Performance — 40
  - Faults (15)
  - Offline Time (10)
  - Unclaimed Rewards (3)
  - Inclusion in Active Set (7)
  - Discovery Tenure (5)
- Bonded Stake — 40
  - Bonded Amount (40)
- Other Factors — 20
  - Recent Nominations (5)
  - Rank in Validator Pool (5)
  - Geographic Diversity (5)
  - ISP Diversity (5)

Configuration for normalization lives in `packages/core/src/config.ts`.

## Endpoints (initial)
- `GET /health`
- `GET /validators?limit=50&offset=0&sort=total:desc`
- `GET /validators/:address`
- `GET /recommendations?n=100`
- `GET /snapshots?era=...` (stub)

## Development (without Docker)
```bash
npm i
npm run build
npm run dev:api
npm run dev:worker
```
Set env vars accordingly.

## Notes
- Collector currently has stubs where real Avail data fetching should be implemented using `avail-js-sdk` / RPC.
- Add your actual logic in `packages/worker/src/pipelines/collect.ts`.
