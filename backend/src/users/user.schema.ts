import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true, collection: 'users' })
export class User {
  @Prop({ required: true, trim: true, maxlength: 120 }) fullName!: string;
  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true }) email!: string;
  @Prop({ required: true, select: false }) passwordHash!: string;
  @Prop({ default: false, index: true }) isEmailVerified!: boolean;
  @Prop({ enum: ['user', 'admin'], default: 'user' }) role!: string;
}

export const UserSchema = SchemaFactory.createForClass(User);
