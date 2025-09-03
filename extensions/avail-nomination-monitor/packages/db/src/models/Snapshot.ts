import mongoose from 'mongoose';

const SnapshotSchema = new mongoose.Schema({
  era: { type: Number, index: true },
  createdAt: { type: Date, default: Date.now },
  validators: [{
    address: String,
    total: Number,
    breakdown: Object
  }]
});

export const SnapshotModel = mongoose.model('Snapshot', SnapshotSchema);
