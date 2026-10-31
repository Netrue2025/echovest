import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  constructor(private readonly config: ConfigService) { this.resend = new Resend(this.config.getOrThrow<string>('RESEND_API_KEY')); }
  async sendVerificationCode(email: string, fullName: string, code: string) {
    const from = this.config.getOrThrow<string>('EMAIL_FROM');
    const safeName = fullName.replace(/[<>]/g, '');
    try {
      const { error } = await this.resend.emails.send({
        from, to: email, subject: 'Your EchoVest verification code',
        html: `<!doctype html><html><body style="margin:0;background:#f5f7f8;font-family:Arial,sans-serif;color:#1e2329"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:36px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border:1px solid #e5e9ed;border-radius:18px"><tr><td style="padding:34px"><div style="font-weight:800;font-size:20px;color:#1e2329">Echo<span style="color:#c99800">Vest</span></div><h1 style="font-size:25px;margin:28px 0 10px">Verify your email</h1><p style="color:#667085;line-height:1.6">Hi ${safeName}, use this code to finish setting up your account.</p><div style="margin:26px 0;padding:18px;background:#fff9e8;border:1px solid #f2dfaa;border-radius:12px;text-align:center;font-size:34px;font-weight:800;letter-spacing:10px;color:#735600">${code}</div><p style="color:#667085;line-height:1.6">This code expires in 10 minutes. If you did not request an EchoVest account, you can ignore this email.</p></td></tr></table></td></tr></table></body></html>`,
      });
      if (error) {
        const detail = `${error.name}: ${error.message}`.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]');
        this.logger.warn(`Resend rejected a verification email: ${detail}`);
        throw new ServiceUnavailableException('Email delivery is currently unavailable. Please try again shortly.');
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const detail = error instanceof Error ? error.message : 'Unknown provider error';
      this.logger.error(`Resend request failed: ${detail.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]').replace(/\bre_[A-Za-z0-9_-]+\b/g, '[redacted key]')}`);
      throw new ServiceUnavailableException('Email delivery is currently unavailable. Please try again shortly.');
    }
  }
  async sendPasswordResetCode(email: string, fullName: string, code: string) {
    const from = this.config.getOrThrow<string>('EMAIL_FROM');
    const safeName = fullName.replace(/[<>]/g, '');
    try {
      const { error } = await this.resend.emails.send({
        from, to: email, subject: 'Your EchoVest password reset code',
        html: `<!doctype html><html><body style="margin:0;background:#f5f6f7;font-family:Arial,sans-serif;color:#1e2329"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:36px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#fff;border:1px solid #e5e9ed;border-radius:18px"><tr><td style="padding:34px"><div style="font-weight:800;font-size:20px">Echo<span style="color:#c99800">Vest</span></div><h1 style="font-size:25px;margin:28px 0 10px">Reset your password</h1><p style="color:#667085;line-height:1.6">Hi ${safeName}, use this code to choose a new password.</p><div style="margin:26px 0;padding:18px;background:#fff9e8;border:1px solid #f2dfaa;border-radius:12px;text-align:center;font-size:34px;font-weight:800;letter-spacing:10px;color:#735600">${code}</div><p style="color:#667085;line-height:1.6">This code expires in 10 minutes. If you did not request a password reset, ignore this email. Your password will not change.</p></td></tr></table></td></tr></table></body></html>`,
      });
      if (error) {
        const detail = `${error.name}: ${error.message}`.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]');
        this.logger.warn(`Resend rejected a password reset email: ${detail}`);
        throw new ServiceUnavailableException('Email delivery is currently unavailable. Please try again shortly.');
      }
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      const detail = error instanceof Error ? error.message : 'Unknown provider error';
      this.logger.error(`Resend password reset request failed: ${detail.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]').replace(/\bre_[A-Za-z0-9_-]+\b/g, '[redacted key]')}`);
      throw new ServiceUnavailableException('Email delivery is currently unavailable. Please try again shortly.');
    }
  }
}
