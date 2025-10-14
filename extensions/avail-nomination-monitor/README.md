# 🟣 Avail Nomination Monitor — 1K Validators Backend

This repository contains the **Avail Nomination Program backend** used to collect, monitor, and expose data about **validators and candidates** from the Avail network (Mainnet or Turing).  
It includes a MongoDB database, an Express API, and a worker process that connects to the Avail RPC via the `avail-js-sdk`.

---

## 🧩 Architecture Overview

| Component | Description |
|------------|--------------|
| **avail_mongo** | MongoDB database storing validators and candidates data. |
| **avail_worker** | Background worker that connects to Avail RPC, listens to events (staking, imOnline), and periodically collects validator information. |
| **avail_api** | Express.js REST API that exposes endpoints for `/validators`, `/candidates`, `/recommendations`, and `/health`. |
| **avail_mongo_express** | Optional web UI to browse the MongoDB database. |

---

## ⚙️ Environment Variables (`.env`)

Create or edit your `.env` file inside `./extensions/avail-nomination-monitor/` or at the repo root.

```bash
# .env
PORT=3030
MONGO_URI=mongodb://avail_mongo:27017/avail_np
RPC_ENDPOINT=wss://mainnet.avail-rpc.com/
CRON=*/10 * * * *
```
Notes

To switch to Turing Network, change:

```RPC_ENDPOINT=wss://turing-rpc.avail.so/```


All containers (API and Worker) will automatically read this .env file via docker-compose.

🐳 Docker Setup
Build and Start
```docker compose -f docker-compose.avail.yml up -d --build```

Stop and Clean (fresh start)
```docker compose -f docker-compose.avail.yml down -v```

🧠 Services Summary
Service	Port	Description
avail_mongo	27017	MongoDB database
avail_mongo_express	8082	Mongo Express UI (optional)
avail_api	3030	REST API server
avail_worker	—	Background data collector

🧪 Health Check & Validation
1️⃣ Check environment inside containers
```docker compose -f docker-compose.avail.yml exec avail_api env | egrep 'PORT|MONGO_URI|RPC_ENDPOINT|CRON'
docker compose -f docker-compose.avail.yml exec avail_worker env | egrep 'PORT|MONGO_URI|RPC_ENDPOINT|CRON'
```

Expected:

```PORT=3030
MONGO_URI=mongodb://avail_mongo:27017/avail_np
RPC_ENDPOINT=wss://mainnet.avail-rpc.com/
CRON=*/10 * * * *```

2️⃣ API Health
```curl -s http://localhost:3030/health && echo
# {"ok":true}
```
3️⃣ Validators & Candidates Endpoints
```curl -s "http://localhost:3030/validators?limit=3" | jq
curl -s "http://localhost:3030/candidates?limit=3" | jq
```

✅ Expected:
```
{
  "items": [
    {
      "address": "5CAp9rLiUiqq1ZimmBcGZgef4vCdj9Zxa9SsmTfL4hb3iecy",
      "current": { "era": 467, "inActiveSet": true }
    }
  ],
  "limit": 3,
  "offset": 0
}
```
4️⃣ MongoDB Verification
```docker compose -f docker-compose.avail.yml exec avail_mongo \
  mongosh "mongodb://avail_mongo:27017/avail_np" --quiet --eval \
'db.validators.countDocuments();
 db.validators.find({}, {address:1,"current.era":1,_id:0}).limit(3);'
```

✅ Expected:

```[
  { "address": "5CAp9rLiUiqq1ZimmBcGZgef4vCdj9Zxa9SsmTfL4hb3iecy", "current": { "era": 467 } }
]```

🔁 Worker Verification

Check logs:

```docker compose -f docker-compose.avail.yml logs -f avail_worker | egrep '\[api\]|\[watcher\]|\[collect\]'
```

✅ Expected:
```
[api] connecting to wss://mainnet.avail-rpc.com/
[api] connected chain=Avail DA Mainnet spec=avail v49 (avail types via sdk: true)
[watcher] started (finalized)
[collect] scanned=105 upserted=0 era=467
```
🧹 Dependency Synchronization

If you see warnings like:
```
@polkadot/... has multiple versions, ensure that there is only one installed.
```

add this to package.json:
```
"resolutions": {
  "@polkadot/api": "16.4.9",
  "@polkadot/rpc-augment": "16.4.9",
  "@polkadot/rpc-core": "16.4.9",
  "@polkadot/rpc-provider": "16.4.9",
  "@polkadot/api-derive": "16.4.9",
  "@polkadot/types": "16.4.9",
  "@polkadot/types-create": "16.4.9",
  "@polkadot/types-codec": "16.4.9",
  "@polkadot/types-known": "16.4.9",
  "@polkadot/util": "13.5.7",
  "@polkadot/util-crypto": "13.5.7",
  "@polkadot/keyring": "13.5.7"
}
```

Then reinstall and rebuild:
```
rm -rf node_modules package-lock.json pnpm-lock.yaml yarn.lock
pnpm install
docker compose -f docker-compose.avail.yml build --no-cache
docker compose -f docker-compose.avail.yml up -d --force-recreate
```
🧱 Project Structure
1k-validators-be/
├── docker-compose.avail.yml
├── extensions/
│   └── avail-nomination-monitor/
│       ├── Dockerfile
│       ├── .env
│       ├── packages/
│       │   ├── api/
│       │   │   └── src/
│       │   │       └── index.ts   → Express API
│       │   └── worker/
│       │       └── src/
│       │           ├── index.ts   → Worker entry
│       │           └── pipelines/
│       │               └── events.ts  → RPC event watcher
├── package.json
└── README.md

🌐 Switching Networks (Mainnet ↔ Turing)

To test on Turing instead of Mainnet:

Edit .env
```
RPC_ENDPOINT=wss://turing-rpc.avail.so/
```

Rebuild and restart:
```
docker compose -f docker-compose.avail.yml down -v
docker compose -f docker-compose.avail.yml up -d --build
```
🪶 API Endpoints Summary
Endpoint	Description	Query Params
/health	Health check	—
/validators	List validators with current era, bonded amount, etc.	limit, offset, sort
/validators/:address	Validator details	—
/candidates	List all candidates	limit, offset
/recommendations	Top-N ranked validators	n

🧑‍💻 Maintainer Notes

Before submitting updates to the Avail team:
- Ensure all endpoints respond correctly.
- Validate that docker-compose uses env vars (no hardcoded RPC/ports).
- Confirm current chain via log:

```[api] connected chain=Avail DA Mainnet spec=avail v49
```
Run one full collection cycle:
```
docker compose -f docker-compose.avail.yml logs -f avail_worker | grep '\[collect\]'
```
