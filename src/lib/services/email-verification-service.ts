import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

const VERIFICATION_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

export class EmailVerificationService {
  /**
   * Generate a verification token for the given email
   */
  async generateVerificationToken(email: string): Promise<string> {
    // Delete any existing tokens for this email
    await prisma.verificationToken.deleteMany({
      where: {
        email,
        type: 'EMAIL_VERIFICATION',
      },
    });

    // Generate a random token
    const token = crypto.randomBytes(32).toString('hex');

    // Create the token in the database
    await prisma.verificationToken.create({
      data: {
        email,
        token,
        type: 'EMAIL_VERIFICATION',
        expires: new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY),
      },
    });

    return token;
  }

  /**
   * Verify an email using the provided token
   */
  async verifyEmail(token: string): Promise<{ success: boolean; email?: string; error?: string }> {
    const verificationToken = await prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      return { success: false, error: 'Invalid token' };
    }

    if (verificationToken.type !== 'EMAIL_VERIFICATION') {
      return { success: false, error: 'Invalid token type' };
    }

    if (verificationToken.expires < new Date()) {
      return { success: false, error: 'Token expired' };
    }

    // Update the user's email verification status
    await prisma.user.update({
      where: { email: verificationToken.email },
      data: { emailVerified: new Date() },
    });

    // Delete the verification token
    await prisma.verificationToken.delete({
      where: { token },
    });

    return { success: true, email: verificationToken.email };
  }

  /**
   * Send verification email using Resend
   */
  async sendVerificationEmail(email: string, token: string): Promise<void> {
    const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-email?token=${token}`;

    try {
      if (process.env.RESEND_API_KEY) {
        // Dynamic import to avoid build errors if package not installed
        try {
          const { Resend } = await import('resend');
          const resend = new Resend(process.env.RESEND_API_KEY);

          await resend.emails.send({
            from: process.env.FROM_EMAIL || 'noreply@scrapenation.com',
            to: email,
            subject: 'Verify your email address - ScrapeNation',
            html: this.getVerificationEmailTemplate(verificationUrl),
          });

          console.log(`Verification email sent to ${email}`);
        } catch (importError) {
          // Fallback if resend package not installed
          console.warn('Resend package not installed. Logging verification URL instead.');
          console.log(`Verification URL for ${email}: ${verificationUrl}`);
        }
      } else {
        console.warn('RESEND_API_KEY not configured. Verification email not sent.');
        console.log(`Verification URL for ${email}: ${verificationUrl}`);
      }
    } catch (error) {
      console.error('Failed to send verification email:', error);
      throw new Error('Failed to send verification email');
    }
  }

  /**
   * Get the HTML template for verification email
   */
  private getVerificationEmailTemplate(verificationUrl: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verify your email</title>
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
            <h1 style="color: #2563eb; margin-top: 0;">Verify Your Email Address</h1>
            <p style="font-size: 16px; margin-bottom: 24px;">
              Thank you for signing up for ScrapeNation! Please click the button below to verify your email address.
            </p>
            <a href="${verificationUrl}"
               style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">
              Verify Email Address
            </a>
            <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">
              Or copy and paste this URL into your browser:<br>
              <span style="color: #2563eb; word-break: break-all;">${verificationUrl}</span>
            </p>
            <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">
              This link will expire in 24 hours.
            </p>
          </div>
          <p style="font-size: 12px; color: #9ca3af; text-align: center;">
            If you didn't create an account with ScrapeNation, you can safely ignore this email.
          </p>
        </body>
      </html>
    `;
  }
}

export const emailVerificationService = new EmailVerificationService();
