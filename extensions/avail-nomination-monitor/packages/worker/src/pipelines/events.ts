// packages/worker/src/pipelines/events.ts
import { ApiPromise, WsProvider } from '@polkadot/api';
import type { Vec } from '@polkadot/types';
import type { EventRecord } from '@polkadot/types/interfaces';
import { ValidatorModel } from '@avail-np/db/dist/models/Validator';

type Logger = Pick<Console, 'info' | 'warn' | 'error'>;

const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'wss://mainnet.avail-rpc.com/';
let _api: ApiPromise | null = null;

async function ensureApi(logger: Logger) {
  if (_api) return _api;
  logger.info(`[api] connecting ${RPC_ENDPOINT}`);
  const provider = new WsProvider(RPC_ENDPOINT);
  _api = await ApiPromise.create({ provider });
  await _api.isReady;
  logger.info('[api] connected');
  return _api;
}

async function incFaults(stash: string) {
  await ValidatorModel.updateOne(
    { address: stash },
    { $inc: { 'current.faults': 1 } }
  );
}

async function addOffline(stash: string, seconds: number) {
  await ValidatorModel.updateOne(
    { address: stash },
    { $inc: { 'current.offlineSeconds': seconds } }
  );
}

export async function startEventWatcher(logger: Logger = console) {
  const api = await ensureApi(logger);
  logger.info('[watcher] started (finalized)');

  api.rpc.chain.subscribeFinalizedHeads(async (header) => {
    try {
      const bn = header.number.toNumber();
      const hash = await api.rpc.chain.getBlockHash(bn);
      let events: Vec<EventRecord> | any;
      try {
        events = await api.query.system.events.at(hash);
      } catch (e) {
        logger.warn(`[events] cannot fetch at #${bn}: ${String(e)}`);
        return;
      }
      const arr: any[] = (events as any)?.toArray?.() ?? [];
      logger.info(`[events] #${bn} count=${arr.length}`);

      for (const rec of arr) {
        const ev = (rec as any).event;
        if (!ev) continue;
        const { section, method, data } = ev;
        if (section === 'staking' && method === 'Slashed') {
          const stash = String(data[0]);
          logger.info(`[match] staking.Slashed ${stash} @#${bn}`);
          await incFaults(stash);
        }
        if (section === 'imOnline' && method === 'SomeOffline') {
          const offenders = (data[0] as any)?.toJSON?.() ?? [];
          for (const off of offenders) {
            const stash = off?.[0] || off?.validatorId || off?.id || null;
            if (stash) {
              logger.info(`[match] imOnline.SomeOffline ${stash} @#${bn}`);
              await addOffline(String(stash), 1200); // default 20min/session
            }
          }
        }
      }
    } catch (e) {
      logger.error('[watcher] error:', e);
    }
  });
}
