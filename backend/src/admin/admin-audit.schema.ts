import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'admin_audit', timestamps: { createdAt: true, updatedAt: false } })
export class AdminAudit {
  @Prop({ required: true, index: true }) actorId!: string;
  @Prop({ required: true }) actorEmail!: string;
  @Prop({ required: true, index: true }) action!: string;
  @Prop({ required: true, index: true }) targetType!: string;
  @Prop({ required: true }) targetId!: string;
  @Prop({ required: true }) targetLabel!: string;
  @Prop({ default: '' }) detail!: string;
  createdAt?: Date;
}

export const AdminAuditSchema = SchemaFactory.createForClass(AdminAudit);
