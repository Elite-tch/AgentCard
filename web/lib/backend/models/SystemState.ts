import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemState extends Document {
  key: string;
  value: string;
}

const SystemStateSchema = new Schema<ISystemState>({
  key: { type: String, required: true, unique: true, index: true },
  value: { type: String, required: true },
});

export const SystemState = (mongoose.models.SystemState as mongoose.Model<ISystemState>) || mongoose.model<ISystemState>('SystemState', SystemStateSchema);
