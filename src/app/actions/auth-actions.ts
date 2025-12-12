'use server';

import { signIn } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';
import { emailVerificationService } from '@/lib/services/email-verification-service';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AuthError } from 'next-auth';

// Validation schemas
const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type ActionResult<T = void> = {
  success: boolean;
  error?: string;
  data?: T;
};

/**
 * Sign up a new user
 */
export async function signupAction(
  formData: FormData
): Promise<ActionResult> {
  try {
    const rawData = {
      email: formData.get('email'),
      password: formData.get('password'),
      confirmPassword: formData.get('confirmPassword'),
    };

    // Validate input
    const validatedData = signupSchema.parse(rawData);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validatedData.email },
    });

    if (existingUser) {
      return {
        success: false,
        error: 'An account with this email already exists',
      };
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(validatedData.password, 10);

    // Create the user
    const user = await prisma.user.create({
      data: {
        email: validatedData.email,
        passwordHash,
        tier: 'FREE',
        jobsCreated: 0,
      },
    });

    // Generate verification token
    const token = await emailVerificationService.generateVerificationToken(
      user.email
    );

    // Send verification email
    await emailVerificationService.sendVerificationEmail(user.email, token);

    return {
      success: true,
      data: { email: user.email },
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0].message,
      };
    }

    console.error('Signup error:', error);
    return {
      success: false,
      error: 'An error occurred during signup. Please try again.',
    };
  }
}

/**
 * Log in an existing user
 */
export async function loginAction(
  formData: FormData
): Promise<ActionResult> {
  try {
    const rawData = {
      email: formData.get('email'),
      password: formData.get('password'),
    };

    // Validate input
    const validatedData = loginSchema.parse(rawData);

    // Attempt to sign in
    await signIn('credentials', {
      email: validatedData.email,
      password: validatedData.password,
      redirect: false,
    });

    return { success: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0].message,
      };
    }

    if (error instanceof AuthError) {
      if (error.message === 'EMAIL_NOT_VERIFIED') {
        return {
          success: false,
          error: 'Please verify your email address before logging in',
        };
      }
      return {
        success: false,
        error: 'Invalid email or password',
      };
    }

    console.error('Login error:', error);
    return {
      success: false,
      error: 'An error occurred during login. Please try again.',
    };
  }
}

/**
 * Verify email address
 */
export async function verifyEmailAction(
  token: string
): Promise<ActionResult<{ email: string }>> {
  try {
    const result = await emailVerificationService.verifyEmail(token);

    if (!result.success) {
      return {
        success: false,
        error: result.error,
      };
    }

    return {
      success: true,
      data: { email: result.email! },
    };
  } catch (error) {
    console.error('Email verification error:', error);
    return {
      success: false,
      error: 'An error occurred during email verification',
    };
  }
}

/**
 * Resend verification email
 */
export async function resendVerificationEmailAction(
  email: string
): Promise<ActionResult> {
  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return {
        success: false,
        error: 'No account found with this email address',
      };
    }

    if (user.emailVerified) {
      return {
        success: false,
        error: 'This email is already verified',
      };
    }

    // Generate new verification token
    const token = await emailVerificationService.generateVerificationToken(email);

    // Send verification email
    await emailVerificationService.sendVerificationEmail(email, token);

    return { success: true };
  } catch (error) {
    console.error('Resend verification email error:', error);
    return {
      success: false,
      error: 'An error occurred while resending verification email',
    };
  }
}
