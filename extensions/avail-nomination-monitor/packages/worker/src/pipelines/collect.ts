import { ValidatorMetrics } from '@avail-np/core';

/**
 * collectBatch should fetch real data from Avail RPC / SDK.
 * For now returns dummy sample to let the pipeline run.
 */
export async function collectBatch(): Promise<ValidatorMetrics[]> {
  // TODO: implement with avail-js-sdk + RPC queries
  return [
    {
      address: '5FdummyAddress1',
      era: 12345,
      faults: 0,
      offlineSeconds: 120,
      unclaimedEras: 0,
      inActiveSet: true,
      discoveryTenureDays: 45,
      bondedAmount: '500000000000',
      recentNominations: 3,
      rankInPool: 10,
      geoRegion: 'APAC',
      ispASN: 4788
    },
    {
      address: '5FdummyAddress2',
      era: 12345,
      faults: 2,
      offlineSeconds: 3600,
      unclaimedEras: 1,
      inActiveSet: false,
      discoveryTenureDays: 10,
      bondedAmount: '150000000000',
      recentNominations: 1,
      rankInPool: 200,
      geoRegion: 'EU',
      ispASN: 3320
    }
  ];
}
