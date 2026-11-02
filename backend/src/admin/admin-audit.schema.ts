import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ collection: 'admin_audit', timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' })
export class AdminAudit {
  @Prop({ required: true, index: true, immutable: true }) actorId!: string;
  @Prop({ required: true, immutable: true }) actorEmail!: string;
  @Prop({ required: true, index: true, immutable: true }) action!: string;
  @Prop({ required: true, index: true, immutable: true }) targetType!: string;
  @Prop({ required: true, immutable: true }) targetId!: string;
  @Prop({ required: true, immutable: true }) targetLabel!: string;
  @Prop({ default: '', immutable: true }) detail!: string;
  createdAt?: Date;
}

export const AdminAuditSchema = SchemaFactory.createForClass(AdminAudit);

export function assertAuditAppendOnly(operation: string) {
  throw new Error(`admin_audit_append_only:${operation}`);
}

AdminAuditSchema.pre('save', function () {
  if (!this.isNew) assertAuditAppendOnly('save');
});
for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'] as const) {
  AdminAuditSchema.pre(operation, function () { assertAuditAppendOnly(operation); });
}
