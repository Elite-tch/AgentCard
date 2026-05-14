import mongoose, { Schema, Document } from 'mongoose';

export interface IApiKey extends Document {
  keyHash: string;
  label?: string;
  spendLimitUsdc?: string;
  totalSpentUsdc: string;
  enabled: boolean;
  createdAt: Date;
  keyPrefix?: string;
  webhookSecret?: string;
  defaultWebhookUrl?: string;
  walletPublicKey?: string;
  suspended: boolean;
  policyDailyLimitUsdc?: string;
  policySingleTxLimitUsdc?: string;
  policyRequireApprovalAboveUsdc?: string;
  policyAllowedHours?: string;
  policyAllowedDays?: string;
  dashboardId?: mongoose.Types.ObjectId;
  mode: 'live' | 'sandbox';
  rateLimitRpm?: number;
  expiresAt?: Date;
  agentState?: string;
  agentStateAt?: Date;
  agentStateDetail?: string;
  lastUsedAt?: Date;
  claimCode?: string;
  claimExpiresAt?: Date;
  temporaryRawKey?: string;
}

const ApiKeySchema = new Schema<IApiKey>({
  keyHash: { type: String, required: true, unique: true },
  label: { type: String },
  spendLimitUsdc: { type: String },
  totalSpentUsdc: { type: String, required: true, default: '0' },
  enabled: { type: Boolean, required: true, default: true },
  createdAt: { type: Date, default: Date.now },
  keyPrefix: { type: String, index: true },
  webhookSecret: { type: String },
  defaultWebhookUrl: { type: String },
  walletPublicKey: { type: String },
  suspended: { type: Boolean, required: true, default: false },
  policyDailyLimitUsdc: { type: String },
  policySingleTxLimitUsdc: { type: String },
  policyRequireApprovalAboveUsdc: { type: String },
  policyAllowedHours: { type: String },
  policyAllowedDays: { type: String },
  dashboardId: { type: Schema.Types.ObjectId, ref: 'Dashboard', index: true },
  mode: { type: String, enum: ['live', 'sandbox'], default: 'live' },
  rateLimitRpm: { type: Number },
  expiresAt: { type: Date },
  agentState: { type: String },
  agentStateAt: { type: Date },
  agentStateDetail: { type: String },
  lastUsedAt: { type: Date },
  claimCode: { type: String, index: true, sparse: true },
  claimExpiresAt: { type: Date },
  temporaryRawKey: { type: String },
});

export const ApiKey = (mongoose.models.ApiKey as mongoose.Model<IApiKey>) || mongoose.model<IApiKey>('ApiKey', ApiKeySchema);
