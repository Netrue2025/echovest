import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './user.schema.js';

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly users: Model<User>) {}
  findByEmail(email: string, includePassword = false) {
    const query = this.users.findOne({ email: email.trim().toLowerCase() });
    return includePassword ? query.select('+passwordHash').exec() : query.exec();
  }
  findByEmailById(id: string) { return this.users.findById(id).exec(); }
  create(data: Pick<User, 'fullName' | 'email' | 'passwordHash'>) { return this.users.create({ ...data, email: data.email.trim().toLowerCase() }); }
  async markVerified(userId: string) { return this.users.findByIdAndUpdate(userId, { isEmailVerified: true }, { new: true }).exec(); }
  async updatePassword(userId: string, passwordHash: string) { return this.users.findByIdAndUpdate(userId, { passwordHash }, { new: true }).exec(); }
  async delete(userId: string) { await this.users.findByIdAndDelete(userId).exec(); }
  safe(user: UserDocument | User) { return { id: String((user as UserDocument)._id), fullName: user.fullName, email: user.email, role: user.role }; }
}
