import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  role: 'owner' | 'user';
  createdAt: Date;
  lastLoginAt?: Date;
}

const UserSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true, index: true },
  role: { type: String, enum: ['owner', 'user'], default: 'user' },
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date },
});

export const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);
