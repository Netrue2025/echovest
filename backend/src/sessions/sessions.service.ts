import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'node:crypto';
import { Model } from 'mongoose';
import { Session } from './session.schema.js';

export const SESSION_COOKIE = 'ev_session';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
@Injectable()
export class SessionsService {
  constructor(@InjectModel(Session.name) private readonly sessions: Model<Session>) {}
  async create(userId: string) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.sessions.create({ userId, tokenHash: hash(token), expiresAt });
    return { token, expiresAt };
  }
  findByToken(token: string) { return this.sessions.findOne({ tokenHash: hash(token), expiresAt: { $gt: new Date() } }).exec(); }
  revoke(token: string) { return this.sessions.deleteOne({ tokenHash: hash(token) }).exec(); }
  revokeAllForUser(userId: string) { return this.sessions.deleteMany({ userId }).exec(); }
}
