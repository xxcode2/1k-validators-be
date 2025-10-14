import { ApiPromise, WsProvider } from '@polkadot/api';
import type { Vec } from '@polkadot/types';
import type { EventRecord } from '@polkadot/types/interfaces';
import { ValidatorModel } from '@avail-np/db/dist/models/Validator';

type Logger = Pick<Console, 'info' | 'warn' | 'error'>;

const DEFAULT_OFFLINE_SECONDS = Number(process.env.SESSION_LENGTH_SECONDS || 1200);

/* eslint-disable @typescript-eslint/no-var-requires */
// Import sebagai any agar kompatibel lintas versi avail-js-sdk
const sdk: any = require('avail-js-sdk');
/* eslint-enable @typescript-eslint/no-var-requires */

let apiSingleton: ApiPromise | null = null;

function resolveAvailOptions(): Record<string, unknown> {
  // Jika SDK menyediakan helper
  if (typeof sdk?.getApiOptions === 'function') {
    return sdk.getApiOptions();
  }
  // Jika tidak, ambil properti langsung bila ada
  const opts: Record<string, unknown> = {};
  if (sdk?.typesBundle) opts.typesBundle = sdk.typesBundle;
  if (sdk?.rpc) opts.rpc = sdk.rpc;
  if (sdk?.signedExtensions) opts.signedExtensions = sdk.signedExtensions;
  if (sdk?.types) opts.types = sdk.types;
  return opts;
}

export async function ensureApi(logger: Logger, endpoint?: string): Promise<ApiPromise> {
  if (apiSingleton && apiSingleton.isConnected) return apiSingleton;

  const RPC_ENDPOINT = endpoint ?? process.env.RPC_ENDPOINT;
  if (!RPC_ENDPOINT) {
    throw new Error('RPC_ENDPOINT is not set. Please set it via env/.env/docker-compose.');
  }

  const availOptions = resolveAvailOptions();
  const hasDirect =
    !!(availOptions as any)?.typesBundle ||
    !!(availOptions as any)?.rpc ||
    !!(availOptions as any)?.signedExtensions ||
    !!(availOptions as any)?.types;

  logger.info(
    hasDirect
      ? '[api] avail-js-sdk: using direct exports (types/rpc/extensions)'
      : '[api] avail-js-sdk: no direct exports found, relying on default registry'
  );
  logger.info(`[api] connecting to ${RPC_ENDPOINT}`);

  const provider = new WsProvider(RPC_ENDPOINT);
  apiSingleton = await ApiPromise.create({ provider, ...(availOptions as any) });

  const chain = await apiSingleton.rpc.system.chain();
  const ver = apiSingleton.runtimeVersion;

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
  logger.info(
    `[update] faults +1 for ${stash} (matched=${(res as any)?.matchedCount ?? 0}, modified=${
      (res as any)?.modifiedCount ?? 0
    })`
  );
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
  logger.info(
    `[update] offlineSeconds +${seconds}s for ${stash} (matched=${(res as any)?.matchedCount ?? 0}, modified=${
      (res as any)?.modifiedCount ?? 0
    })`
  );
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

    // Sample 10 event pertama untuk debugging
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
        const offendersRaw = (ev.data?.[0] as any) ?? [];
        const offendersJson = typeof offendersRaw?.toJSON === 'function' ? offendersRaw.toJSON() : offendersRaw;
        const list: string[] = [];

        if (Array.isArray(offendersJson)) {
          // Bentuk umum: array of tuples/objects
          for (const off of offendersJson) {
            const id =
              off?.[0] || off?.validatorId || off?.id || off?.accountId || off?.who || off?.stash || off?.address;
            if (id) list.push(String(id));
          }
        } else if (offendersJson) {
          // Bentuk object tunggal
          const single =
            offendersJson?.validatorId ||
            offendersJson?.id ||
            offendersJson?.accountId ||
            offendersJson?.who ||
            offendersJson?.stash ||
            offendersJson?.address;
          if (single) list.push(String(single));
        }

        // Fallback kasar jika struktur tidak terdeteksi
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
