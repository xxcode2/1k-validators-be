import mongoose from 'mongoose';

const ScoreBreakdown = new mongoose.Schema(
  {
    performance: Number,
    bonded: Number,
    other: Number,
    // detail komponen
    faults: Number,
    offline: Number,
    unclaimed: Number,
    activeSet: Number,
    tenure: Number,
    bondedAmount: Number,
    recentNominations: Number,
    poolRank: Number,
    geoDiversity: Number,
    ispDiversity: Number
  },
  { _id: false }
);

const ValidatorSchema = new mongoose.Schema(
  {
    address: { type: String, index: true, unique: true },
    lastSeenEra: Number,
    identity: { name: String, operator: String },
    network: { geoRegion: String, ispASN: Number },

    // baru: kapan pertama kali validator ini terdeteksi
    firstSeenAt: { type: Date },

    current: {
      era: Number,
      faults: Number,
      offlineSeconds: Number,
      unclaimedEras: Number,
      inActiveSet: Boolean,
      discoveryTenureDays: Number,
      bondedAmount: String,
      recentNominations: Number,
      rankInPool: Number
    },

    score: {
      total: Number,
      breakdown: { type: ScoreBreakdown }
    },

    updatedAt: { type: Date, default: Date.now }
  },
  { collection: 'validators' }
);

// (opsional) index tambahan untuk query cepat
ValidatorSchema.index({ 'current.era': -1 });
ValidatorSchema.index({ 'score.total': -1 });

export type ValidatorDoc = mongoose.InferSchemaType<typeof ValidatorSchema>;
export const ValidatorModel =
  mongoose.models.Validator || mongoose.model('Validator', ValidatorSchema);

