import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  dashboardId: mongoose.Types.ObjectId;
  actorUserId?: mongoose.Types.ObjectId;
  actorEmail: string;
  actorRole: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: string;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
  dashboardId: { type: Schema.Types.ObjectId, ref: 'Dashboard', required: true, index: true },
  actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
  actorEmail: { type: String, required: true, index: true },
  actorRole: { type: String, required: true },
  action: { type: String, required: true, index: true },
  resourceType: { type: String },
  resourceId: { type: String },
  details: { type: String }, // JSON stringified data
  ip: { type: String },
  userAgent: { type: String },
  createdAt: { type: Date, default: Date.now },
});

export const AuditLog = mongoose.models.AuditLog || mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
