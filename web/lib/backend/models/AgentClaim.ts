import mongoose, { Schema, Document } from 'mongoose';

export interface IAgentClaim extends Document {
  code: string;
  apiKeyId: mongoose.Types.ObjectId;
  sealedPayload: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt?: Date;
  claimedIp?: string;
}

const AgentClaimSchema = new Schema<IAgentClaim>({
  code: { type: String, required: true, unique: true, index: true },
  apiKeyId: { type: Schema.Types.ObjectId, ref: 'ApiKey', required: true, index: true },
  sealedPayload: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date },
  claimedIp: { type: String },
});

export const AgentClaim = mongoose.models.AgentClaim || mongoose.model<IAgentClaim>('AgentClaim', AgentClaimSchema);
