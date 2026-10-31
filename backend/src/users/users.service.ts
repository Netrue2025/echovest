import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'node:crypto';
import { User, UserDocument } from './user.schema.js';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly users: Model<User>) {}
  findByEmail(email: string, includePassword = false) {
    const query = this.users.findOne({ email: email.trim().toLowerCase() });
    return includePassword ? query.select('+passwordHash').exec() : query.exec();
  }
  findByEmailById(id: string) { return this.users.findById(id).exec(); }
  create(data: Pick<User, 'fullName' | 'email' | 'passwordHash'>, referredBy?: User['_id']) {
    const referralCode = `EV${randomBytes(6).toString('hex').toUpperCase()}`;
    return this.users.create({ ...data, referralCode, ...(referredBy ? { referredBy } : {}), email: data.email.trim().toLowerCase() });
  }
  findByReferralCode(code: string) { return this.users.findOne({ referralCode: code.trim().toUpperCase() }).exec(); }
  async ensureReferralCode(userId: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const existing = await this.users.findById(userId).select('referralCode').lean().exec();
      if (!existing) return null;
      if (existing.referralCode) return existing.referralCode;
      const referralCode = `EV${randomBytes(6).toString('hex').toUpperCase()}`;
      try {
        const updated = await this.users.findOneAndUpdate({ _id: userId, $or: [{ referralCode: { $exists: false } }, { referralCode: null }] }, { $set: { referralCode } }, { new: true }).select('referralCode').lean().exec();
        if (updated?.referralCode) return updated.referralCode;
      } catch (error) {
        if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error;
      }
    }
    throw new Error('Could not assign a referral code.');
  }
  async markVerified(userId: string) { return this.users.findByIdAndUpdate(userId, { isEmailVerified: true }, { new: true }).exec(); }
  async updatePassword(userId: string, passwordHash: string) { return this.users.findByIdAndUpdate(userId, { passwordHash }, { new: true }).exec(); }
  listAll() { return this.users.find({}).select('-passwordHash').sort({ createdAt: -1 }).lean().exec(); }
  findByIdWithPassword(id: string) { return this.users.findById(id).select('+passwordHash').exec(); }
  updateProfile(userId: string, updates: { fullName?: string; email?: string }) { return this.users.findByIdAndUpdate(userId, updates, { new: true, runValidators: true }).exec(); }
  updateAdminPermissions(userId: string, adminPermissions: string[]) { return this.users.findByIdAndUpdate(userId, { adminPermissions }, { new: true }).exec(); }
  updateAccountControls(userId: string, updates: { isDisabled?: boolean; withdrawalsDisabled?: boolean }) { return this.users.findByIdAndUpdate(userId, updates, { new: true }).exec(); }
  listAdmins() { return this.users.find({ role: 'admin', isSuperAdmin: { $ne: true } }).select('-passwordHash').sort({ createdAt: -1 }).lean().exec(); }
  createAdmin(data: { fullName: string; email: string; passwordHash: string; adminPermissions: string[] }) {
    return this.users.create({ ...data, email: data.email.trim().toLowerCase(), role: 'admin', isEmailVerified: true, isSuperAdmin: false, isDisabled: false, withdrawalsDisabled: false });
  }
  async deleteById(userId: string) { return this.users.findByIdAndDelete(userId).exec(); }
  upsertSuperAdmin(email: string, passwordHash: string, adminPermissions: string[]) {
    return this.users.findOneAndUpdate({ email }, { $set: { fullName: 'EchoVest Super Admin', email, passwordHash, role: 'admin', isEmailVerified: true, isSuperAdmin: true, adminPermissions, isDisabled: false, withdrawalsDisabled: false } }, { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }).exec();
  }
  async delete(userId: string) { await this.users.findByIdAndDelete(userId).exec(); }
  safe(user: UserDocument | User) { return { id: String((user as UserDocument)._id), fullName: user.fullName, email: user.email, role: user.role, isSuperAdmin: user.isSuperAdmin ?? false, adminPermissions: user.adminPermissions ?? [], isDisabled: user.isDisabled ?? false, withdrawalsDisabled: user.withdrawalsDisabled ?? false }; }
}
