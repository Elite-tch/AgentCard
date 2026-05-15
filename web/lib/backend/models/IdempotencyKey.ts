import mongoose, { Schema, Document } from 'mongoose';

export interface IIdempotencyKey extends Document {
  key: string;
  apiKeyId: mongoose.Types.ObjectId | string;
  requestFingerprint?: string;
  responseStatus: number;
  responseBody: string;
  createdAt: Date;
}

const IdempotencyKeySchema = new Schema<IIdempotencyKey>({
  key: { type: String, required: true },
  apiKeyId: { type: Schema.Types.Mixed, required: true, index: true },
  requestFingerprint: { type: String },
  responseStatus: { type: Number, required: true },
  responseBody: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 86400 } // 24 hours TTL
});

IdempotencyKeySchema.index({ key: 1, apiKeyId: 1 }, { unique: true });

export const IdempotencyKey = (mongoose.models.IdempotencyKey as mongoose.Model<IIdempotencyKey>) || mongoose.model<IIdempotencyKey>('IdempotencyKey', IdempotencyKeySchema);
