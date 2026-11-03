import { BadRequestException, ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON, WebAuthnCredential } from '@simplewebauthn/server';
import { ClientSession, Model, Types } from 'mongoose';
import { User } from '../users/user.schema.js';
import { WithdrawalSecurityProof } from './withdrawal-security.schema.js';

export type WithdrawalContext = { amount: number; destinationAddress: string; network: string; source: string };
const contextHash = (context: WithdrawalContext) => createHash('sha256').update(JSON.stringify({ amount: Number(context.amount.toFixed(8)), destinationAddress: context.destinationAddress.trim(), network: context.network.trim().toLowerCase(), source: context.source.trim() })).digest('hex');
const b64url = (value: string) => Buffer.from(value, 'base64url');

@Injectable()
export class WithdrawalSecurityService {
  constructor(@InjectModel(User.name) private readonly users: Model<User>, @InjectModel(WithdrawalSecurityProof.name) private readonly proofs: Model<WithdrawalSecurityProof>) {}

  private async saveChallenge(userId: string, purpose: 'registration' | 'authentication', challenge: string, hash: string) {
    const challengeId = randomBytes(24).toString('base64url');
    const stored = await this.users.updateOne({ _id: userId }, { $set: { withdrawalPasskeyChallenge: challenge, withdrawalPasskeyChallengeId: challengeId, withdrawalPasskeyChallengePurpose: purpose, withdrawalPasskeyChallengeContextHash: hash, withdrawalPasskeyChallengeExpiresAt: new Date(Date.now() + 10 * 60_000) } }).exec();
    if (!stored.matchedCount) throw new UnauthorizedException('Sign in to continue.');
    return challengeId;
  }

  private async consumeChallenge(userId: string, challengeId: string, purpose: 'registration' | 'authentication', hash: string) {
    const user = await this.users.findById(userId).select('+withdrawalPasskeyChallenge +withdrawalPasskeyChallengeId +withdrawalPasskeyChallengePurpose +withdrawalPasskeyChallengeContextHash +withdrawalPasskeyChallengeExpiresAt').lean().exec();
    if (!user || user.withdrawalPasskeyChallengeId !== challengeId || user.withdrawalPasskeyChallengePurpose !== purpose || user.withdrawalPasskeyChallengeContextHash !== hash || !user.withdrawalPasskeyChallenge || !user.withdrawalPasskeyChallengeExpiresAt || user.withdrawalPasskeyChallengeExpiresAt.getTime() <= Date.now()) return null;
    const consumed = await this.users.updateOne({ _id: userId, withdrawalPasskeyChallengeId: challengeId, withdrawalPasskeyChallengePurpose: purpose, withdrawalPasskeyChallengeContextHash: hash, withdrawalPasskeyChallengeExpiresAt: { $gt: new Date() } }, { $unset: { withdrawalPasskeyChallenge: 1, withdrawalPasskeyChallengeId: 1, withdrawalPasskeyChallengePurpose: 1, withdrawalPasskeyChallengeContextHash: 1, withdrawalPasskeyChallengeExpiresAt: 1 } }).exec();
    return consumed.matchedCount ? user.withdrawalPasskeyChallenge : null;
  }

  async status(userId: string) {
    const user = await this.users.findById(userId).select('+withdrawalPinHash +withdrawalPasskeys').lean().exec();
    if (!user) throw new UnauthorizedException('Sign in to continue.');
    return { pinEnabled: Boolean(user.withdrawalPinHash), biometricEnabled: Boolean(user.withdrawalPasskeys?.length), biometricCount: user.withdrawalPasskeys?.length ?? 0, configured: Boolean(user.withdrawalPinHash || user.withdrawalPasskeys?.length) };
  }

  async setPin(userId: string, pin: string) {
    const hash = await argon2.hash(pin, { type: argon2.argon2id });
    await this.users.updateOne({ _id: userId }, { $set: { withdrawalPinHash: hash, withdrawalPinFailedAttempts: 0, withdrawalPinLockedUntil: null } }).exec();
    return { message: 'Withdrawal PIN saved.', ...(await this.status(userId)) };
  }

  private relyingParty() {
    const origins = (process.env.FRONTEND_URL ?? '').split(',').map((item) => item.trim()).filter(Boolean).map((item) => new URL(item));
    if (!origins.length) throw new BadRequestException('Passkey verification is not configured. Set FRONTEND_URL on the account service.');
    const rpID = process.env.WEBAUTHN_RP_ID?.trim() || origins[0].hostname;
    if (!origins.some((origin) => origin.hostname === rpID)) throw new BadRequestException('WEBAUTHN_RP_ID must match the frontend domain.');
    return { rpID, origins: origins.map((origin) => origin.origin), rpName: 'EchoVest' };
  }

  async registrationOptions(userId: string) {
    const user = await this.users.findById(userId).select('fullName email +withdrawalPasskeys').lean().exec();
    if (!user) throw new UnauthorizedException('Sign in to continue.');
    const { rpID, rpName } = this.relyingParty();
    const options = await generateRegistrationOptions({ rpName, rpID, userID: new TextEncoder().encode(userId), userName: user.email, userDisplayName: user.fullName, attestationType: 'none', authenticatorSelection: { authenticatorAttachment: 'platform', residentKey: 'preferred', userVerification: 'required' }, excludeCredentials: (user.withdrawalPasskeys ?? []).map((key: any) => ({ id: key.credentialId, transports: key.transports })) });
    const challengeId = await this.saveChallenge(userId, 'registration', options.challenge, 'registration');
    return { options, challengeId };
  }

  async verifyRegistration(userId: string, response: RegistrationResponseJSON, name?: string, challengeId?: string) {
    if (!challengeId || !/^[A-Za-z0-9_-]{32}$/.test(challengeId)) throw new ConflictException('Passkey setup expired. Start setup again.');
    const challenge = await this.consumeChallenge(userId, challengeId, 'registration', 'registration');
    if (!challenge) throw new ConflictException('Passkey setup expired. Start setup again.');
    const { rpID, origins } = this.relyingParty();
    const result = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: origins, expectedRPID: rpID, requireUserVerification: true });
    if (!result.verified || !result.registrationInfo) throw new UnauthorizedException('Could not verify this device passkey.');
    const info = result.registrationInfo;
    const credential = info.credential;
    const record = { credentialId: credential.id, publicKey: Buffer.from(credential.publicKey), counter: credential.counter, transports: response.response.transports ?? [], deviceType: info.credentialDeviceType, backedUp: info.credentialBackedUp, name: (name || 'This device').slice(0, 60) };
    await this.users.updateOne({ _id: userId, 'withdrawalPasskeys.credentialId': { $ne: record.credentialId } }, { $push: { withdrawalPasskeys: record } }).exec();
    return { message: 'Device biometric verification enabled.', ...(await this.status(userId)) };
  }

  async authenticationOptions(userId: string, context: WithdrawalContext) {
    const user = await this.users.findById(userId).select('+withdrawalPasskeys').lean().exec();
    if (!user?.withdrawalPasskeys?.length) throw new BadRequestException('Set up device verification or a withdrawal PIN first.');
    const { rpID } = this.relyingParty();
    const options = await generateAuthenticationOptions({ rpID, allowCredentials: (user.withdrawalPasskeys as any[]).map((key) => ({ id: key.credentialId, transports: key.transports })), userVerification: 'required' });
    const challengeId = await this.saveChallenge(userId, 'authentication', options.challenge, contextHash(context));
    return { options, challengeId };
  }

  async verifyAuthentication(userId: string, response: AuthenticationResponseJSON, context: WithdrawalContext, challengeId?: string) {
    if (!challengeId || !/^[A-Za-z0-9_-]{32}$/.test(challengeId)) throw new ConflictException('Device verification expired. Start again.');
    const challenge = await this.consumeChallenge(userId, challengeId, 'authentication', contextHash(context));
    if (!challenge) throw new ConflictException('Verification expired or withdrawal details changed. Try again.');
    const user = await this.users.findById(userId).select('+withdrawalPasskeys').exec();
    const record: any = user?.withdrawalPasskeys?.find((key: any) => key.credentialId === response.id);
    if (!record) throw new UnauthorizedException('This device is not registered for withdrawals.');
    const { rpID, origins } = this.relyingParty();
    const credential: WebAuthnCredential = { id: record.credentialId, publicKey: new Uint8Array(record.publicKey), counter: record.counter, transports: record.transports };
    const result = await verifyAuthenticationResponse({ response, expectedChallenge: challenge, expectedOrigin: origins, expectedRPID: rpID, credential, requireUserVerification: true });
    if (!result.verified) throw new UnauthorizedException('Device verification failed.');
    const updated = await this.users.updateOne({ _id: userId, 'withdrawalPasskeys.credentialId': record.credentialId, 'withdrawalPasskeys.counter': record.counter }, { $set: { 'withdrawalPasskeys.$.counter': result.authenticationInfo.newCounter } }).exec();
    if (!updated.matchedCount) throw new ConflictException('Device verification was already used. Try again.');
    const token = randomBytes(32).toString('base64url');
    await this.proofs.create({ userId: new Types.ObjectId(userId), tokenHash: createHash('sha256').update(token).digest('hex'), contextHash: contextHash(context), expiresAt: new Date(Date.now() + 5 * 60_000) });
    return { verificationToken: token, expiresInSeconds: 300 };
  }

  async assertWithdrawal(userId: string, verification: { pin?: string; verificationToken?: string }, context: WithdrawalContext, session?: ClientSession) {
    if (verification.verificationToken) {
      const tokenHash = createHash('sha256').update(verification.verificationToken).digest('hex');
      const proof = await this.proofs.findOneAndUpdate({ userId: new Types.ObjectId(userId), tokenHash, contextHash: contextHash(context), expiresAt: { $gt: new Date() }, consumedAt: null }, { $set: { consumedAt: new Date() } }, { new: true, session }).exec();
      if (!proof) throw new UnauthorizedException('Device verification is invalid, expired, or already used.');
      return;
    }
    if (!verification.pin) throw new UnauthorizedException('Verify this withdrawal with your PIN or device biometrics.');
    const user = await this.users.findById(userId).select('+withdrawalPinHash +withdrawalPinFailedAttempts +withdrawalPinLockedUntil').session(session ?? null).exec();
    if (!user?.withdrawalPinHash) throw new ForbiddenException('Set a withdrawal PIN or device verification before withdrawing.');
    if (user.withdrawalPinLockedUntil && user.withdrawalPinLockedUntil.getTime() > Date.now()) throw new ForbiddenException('Too many incorrect PIN attempts. Try again in 15 minutes.');
    const valid = await argon2.verify(user.withdrawalPinHash, verification.pin);
    if (!valid) {
      await this.users.updateOne({ _id: userId }, { $inc: { withdrawalPinFailedAttempts: 1 } }, { session }).exec();
      const recent = await this.users.findById(userId).select('+withdrawalPinFailedAttempts').session(session ?? null).lean().exec();
      if ((recent?.withdrawalPinFailedAttempts ?? 0) >= 5) {
        await this.users.updateOne({ _id: userId }, { $set: { withdrawalPinLockedUntil: new Date(Date.now() + 15 * 60_000), withdrawalPinFailedAttempts: 0 } }, { session }).exec();
        throw new ForbiddenException('Too many incorrect PIN attempts. Try again in 15 minutes.');
      }
      throw new UnauthorizedException('Withdrawal PIN is incorrect.');
    }
    if (user.withdrawalPinFailedAttempts || user.withdrawalPinLockedUntil) await this.users.updateOne({ _id: userId }, { $set: { withdrawalPinFailedAttempts: 0, withdrawalPinLockedUntil: null } }, { session }).exec();
  }
}
