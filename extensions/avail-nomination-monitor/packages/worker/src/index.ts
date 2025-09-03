// packages/worker/src/index.ts
import 'dotenv/config';
import cron from 'node-cron';

import { connectMongo } from '@avail-np/db/dist/mongo';
import { startEventWatcher } from './pipelines/events';
import { collectBatch } from './pipelines/collect';

function getEnv(name: string, def?: string) {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  if (def !== undefined) return def;
  throw new Error(`Missing env ${name}`);
}

const MONGO_URI = getEnv('MONGO_URI', 'mongodb://mongo:27017/avail_np');
const CRON = getEnv('CRON', '*/10 * * * *');

async function runOnce() {
  console.info('[worker] runOnce: start collectBatch()');
  try {
    const processed = await collectBatch();
    console.info(`[worker] processed ${processed} validators`);
  } catch (e) {
    console.error('[worker] runOnce error:', e);
  }
  console.info('[worker] runOnce: done');
}

async function main() {
  console.info('[boot] starting worker …');
  console.info(`[boot] MONGO_URI=${MONGO_URI}`);
  console.info(`[boot] RPC_ENDPOINT=${process.env.RPC_ENDPOINT || '(unset)'}`);
  console.info(`[boot] CRON="${CRON}"`);

  await connectMongo(MONGO_URI);
  console.info('[boot] Mongo connected');

  // 🔴 Aktifkan event watcher
  await startEventWatcher(console);

  // Seed awal
  await runOnce();

  // Schedule batch
  cron.schedule(CRON, runOnce);
  console.info(`[worker] scheduled with ${CRON}`);
  console.info('[boot] worker ready');
}

main().catch((e) => {
  console.error('[boot] fatal:', e);
  process.exit(1);
});
