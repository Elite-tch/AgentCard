import mongoose, { Schema, Document } from 'mongoose';

export interface IDashboard extends Document {
  userId: mongoose.Types.ObjectId;
  name: string;
  spendLimitUsdc?: string;
  frozen: boolean;
  createdAt: Date;
}

const DashboardSchema = new Schema<IDashboard>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, default: 'My Dashboard' },
  spendLimitUsdc: { type: String },
  frozen: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

export const Dashboard = mongoose.models.Dashboard || mongoose.model<IDashboard>('Dashboard', DashboardSchema);
