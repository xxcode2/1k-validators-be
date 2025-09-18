import { ApiPromise, WsProvider } from '@polkadot/api';
import type { Vec } from '@polkadot/types';
import type { EventRecord } from '@polkadot/types/interfaces';
import { ValidatorModel } from '@avail-np/db/dist/models/Validator';

type Logger = Pick<Console, 'info' | 'warn' | 'error'>;

const RPC_ENDPOINT = process.env.RPC_ENDPOINT || 'wss://mainnet.avail-rpc.com/';
const DEFAULT_OFFLINE_SECONDS = Number(process.env.SESSION_LENGTH_SECONDS || 1200);

// --- Avail SDK: import sebagai any agar kompatibel lintas versi ---
/* eslint-disable @typescript-eslint/no-var-requires */
const sdk: any = require('avail-js-sdk');
/* eslint-enable @typescript-eslint/no-var-requires */

let apiSingleton: ApiPromise | null = null;

function resolveAvailOptions(): Record<string, unknown> {
  // Kalau versi SDK punya helper getApiOptions, pakai itu
  if (typeof sdk?.getApiOptions === 'function') {
    return sdk.getApiOptions();
  }
  // Fallback ke properti langsung bila tersedia
  const opts: Record<string, unknown> = {};
  if (sdk?.typesBundle) opts.typesBundle = sdk.typesBundle;
  if (sdk?.rpc) opts.rpc = sdk.rpc;
  if (sdk?.signedExtensions) opts.signedExtensions = sdk.signedExtensions;
  if (sdk?.types) opts.types = sdk.types;
  return opts;
}

export async function ensureApi(logger: Logger): Promise<ApiPromise> {
  if (apiSingleton && apiSingleton.isConnected) return apiSingleton;

  const provider = new WsProvider(RPC_ENDPOINT);
  const availOptions = resolveAvailOptions();

  const hasDirect = !!(availOptions.typesBundle || availOptions.rpc || availOptions.signedExtensions || availOptions.types);
  logger.info(
    hasDirect
      ? '[api] avail-js-sdk: using direct exports (types/rpc/extensions)'
      : '[api] avail-js-sdk: no direct exports found, relying on default registry'
  );

  logger.info(`[api] connecting to ${RPC_ENDPOINT}`);
  apiSingleton = await ApiPromise.create({ provider, ...(availOptions as any) });

  const [chain, ver] = await Promise.all([
    apiSingleton.rpc.system.chain(),
    apiSingleton.runtimeVersion,
  ]);

  const has = {
    imOnline: Boolean((apiSingleton.events as any)?.imOnline),
    staking: Boolean((apiSingleton.events as any)?.staking),
  };
  const ev = {
    imOnline_SomeOffline: Boolean((apiSingleton.events as any)?.imOnline?.SomeOffline),
    staking_Slashed: Boolean((apiSingleton.events as any)?.staking?.Slashed),
  };

  logger.info(
    `[api] connected chain=${chain.toString()} spec=${ver.specName.toString()} v${ver.specVersion.toString()} (avail types via sdk: ${hasDirect})`
  );
  logger.info(
    `[config] hasPallet.imOnline=${has.imOnline} hasPallet.staking=${has.staking} ` +
    `hasEvent.imOnline.SomeOffline=${ev.imOnline_SomeOffline} hasEvent.staking.Slashed=${ev.staking_Slashed}`
  );

  return apiSingleton;
}

async function incFaults(stash: string, bn: number, hash: string, logger: Logger) {
  const res = await ValidatorModel.updateOne(
    { address: stash },
    {
      $inc: { 'current.faults': 1 },
      $push: { history: { kind: 'SLASHED', atBlock: bn, blockHash: hash, ts: new Date() } },
    },
    { upsert: true }
  );
  logger.info(`[update] faults +1 for ${stash} (matched=${res.matchedCount}, modified=${res.modifiedCount})`);
}

async function addOffline(stash: string, seconds: number, bn: number, hash: string, logger: Logger) {
  const res = await ValidatorModel.updateOne(
    { address: stash },
    {
      $inc: { 'current.offlineSeconds': seconds },
      $push: { history: { kind: 'OFFLINE', atBlock: bn, blockHash: hash, seconds, ts: new Date() } },
    },
    { upsert: true }
  );
  logger.info(`[update] offlineSeconds +${seconds}s for ${stash} (matched=${res.matchedCount}, modified=${res.modifiedCount})`);
}

export async function startEventWatcher(logger: Logger = console) {
  const api = await ensureApi(logger);
  logger.info('[watcher] started (finalized)');

  await api.rpc.chain.subscribeFinalizedHeads(async (header) => {
    const bn = header.number.toNumber();

    let hash: any;
    try {
      hash = await api.rpc.chain.getBlockHash(bn);
    } catch (e) {
      logger.warn(`[events] getBlockHash(#${bn}) failed: ${String(e)}`);
      return;
    }

    let events: Vec<EventRecord> | any;
    try {
      events = await api.query.system.events.at(hash);
    } catch (e) {
      logger.warn(`[events] cannot fetch at #${bn}: ${String(e)}`);
      return;
    }

    const arr: any[] = (events as any)?.toArray?.() ?? [];
    logger.info(`[events] #${bn} count=${arr.length}`);

    // Sampling 10 event pertama untuk debug
    for (let i = 0; i < Math.min(10, arr.length); i++) {
      const ev = (arr[i] as any)?.event;
      if (!ev) continue;
      logger.info(`[sample] #${bn} [${i}] ${String(ev.section)}.${String(ev.method)}`);
    }

    for (const rec of arr) {
      const ev = (rec as any)?.event;
      if (!ev) continue;

      const section = String(ev.section);
      const method = String(ev.method);

      if (section === 'imOnline') logger.info(`[seen] imOnline.${method} @#${bn}`);
      if (section === 'staking') logger.info(`[seen] staking.${method} @#${bn}`);

      // staking.Slashed -> tambah faults
      if (section === 'staking' && method === 'Slashed') {
        const stash = String(ev.data?.[0] ?? '');
        if (stash) {
          logger.info(`[match] staking.Slashed ${stash} @#${bn}`);
          await incFaults(stash, bn, String(hash), logger);
        }
      }

      // imOnline.SomeOffline -> tambah offlineSeconds
      if (section === 'imOnline' && method === 'SomeOffline') {
        const offenders = (ev.data?.[0] as any)?.toJSON?.() ?? ev.data?.[0] ?? [];
        const list: string[] = [];

        if (Array.isArray(offenders)) {
          for (const off of offenders) {
            const id = off?.[0] || off?.validatorId || off?.id || off?.accountId || off?.who;
            if (id) list.push(String(id));
          }
        } else if (offenders) {
          const single = offenders?.validatorId || offenders?.id || offenders?.accountId || offenders?.who;
          if (single) list.push(String(single));
        }

        // fallback kasar
        if (list.length === 0) {
          const raw0 = String(ev.data?.[0] ?? '');
          if (raw0) list.push(raw0);
        }

        for (const stash of list) {
          logger.info(`[match] imOnline.SomeOffline ${stash} @#${bn}`);
          await addOffline(String(stash), DEFAULT_OFFLINE_SECONDS, bn, String(hash), logger);
        }
      }
    }
  });
}
