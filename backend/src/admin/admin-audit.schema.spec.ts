import { describe, expect, it } from 'vitest';
import { AdminAuditSchema, assertAuditAppendOnly } from './admin-audit.schema.js';

describe('AdminAudit append-only protection', () => {
  it.each(['save', 'updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'])('rejects %s attempts', (operation) => {
    expect(() => assertAuditAppendOnly(operation)).toThrow(`admin_audit_append_only:${operation}`);
    expect(AdminAuditSchema.s.hooks.hasHooks(operation)).toBe(true);
  });
});
