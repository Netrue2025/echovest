import { describe, expect, it, vi } from 'vitest';
import { SessionsService } from './sessions.service.js';

describe('SessionsService', () => {
  it('stores only the hash of a random session token', async () => {
    const create = vi.fn(async (record: unknown) => record);
    const service = new SessionsService({ create } as never);
    const session = await service.create('user-id');
    expect(session.token).toHaveLength(43);
    expect(create.mock.calls[0][0]).toMatchObject({ userId: 'user-id' });
    expect(create.mock.calls[0][0]).not.toHaveProperty('token', session.token);
    expect(create.mock.calls[0][0]).toHaveProperty('tokenHash');
    expect((create.mock.calls[0][0] as { tokenHash: string }).tokenHash).not.toBe(session.token);
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60 * 1000);
  });

  it('looks up and revokes sessions by their token hash and expires old sessions', async () => {
    let filter: Record<string, unknown> | undefined;
    const model = {
      findOne: vi.fn((query: Record<string, unknown>) => { filter = query; return { exec: async () => ({ userId: 'user-id' }) }; }),
      deleteOne: vi.fn((query: Record<string, unknown>) => { filter = query; return { exec: async () => ({ deletedCount: 1 }) }; }),
    };
    const service = new SessionsService(model as never);
    await service.findByToken('raw-token');
    expect(filter?.tokenHash).not.toBe('raw-token');
    const expiryFilter = filter?.expiresAt as { $gt: Date } | undefined;
    expect(expiryFilter?.$gt).toBeInstanceOf(Date);
    await service.revoke('raw-token');
    expect(filter?.tokenHash).not.toBe('raw-token');
  });
});
