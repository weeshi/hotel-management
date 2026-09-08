import { prisma } from '@/lib/utils/prisma';
import { hashPassword, verifyPassword } from '@/lib/utils/password';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type AccessTokenPayload,
} from '@/lib/utils/jwt';
import { UnauthorizedError, ValidationError } from '@/lib/utils/errors';
import { randomBytes } from 'crypto';

function uuidv4() {
  return crypto.randomUUID();
}

export class AuthService {
  // `hotelId` locks the login to a specific tenant (used when the request host
  // matches a registered hotel customDomain). The failure message stays uniform
  // so the host never leaks which accounts exist.
  async login(email: string, password: string, hotelId?: string) {
    let user = hotelId
      ? await prisma.user.findFirst({ where: { email, hotelId } })
      : await prisma.user.findUnique({ where: { email } });

    // Platform-wide SUPER_ADMINs have hotelId = null (they see all hotels), so
    // the tenant-locked lookup above returns nothing when a hotel host is
    // detected. Fall back to the global account lookup, but ONLY for
    // SUPER_ADMIN accounts — tenant isolation for regular staff is preserved.
    if (!user && hotelId) {
      const globalUser = await prisma.user.findUnique({ where: { email } });
      if (globalUser && globalUser.role === 'SUPER_ADMIN' && !globalUser.hotelId) {
        user = globalUser;
      }
    }

    if (!user) throw new UnauthorizedError('البريد الإلكتروني أو كلمة المرور غير صحيحة');

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const minutes = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 60000
      );
      throw new UnauthorizedError(
        `الحساب مقفل. حاول بعد ${minutes} دقيقة`
      );
    }

    const valid = await verifyPassword(password, user.password);
    if (!valid) {
      await this.handleFailedLogin(user.id);
      throw new UnauthorizedError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    return this.generateTokens(user);
  }

  private async handleFailedLogin(userId: string) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
    });

    if (user.failedLoginAttempts >= 5) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
          failedLoginAttempts: 0,
        },
      });
    }
  }

  private async generateTokens(user: any) {
    const family = randomBytes(16).toString('hex');
    const tokenId = uuidv4();

    const accessToken = await signAccessToken({
      userId: user.id,
      role: user.role,
      hotelId: user.hotelId || undefined,
    });

    const refreshToken = await signRefreshToken({
      userId: user.id,
      tokenId,
      family,
    });

    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        family,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async refreshTokens(oldRefreshToken: string) {
    const payload = await verifyRefreshToken(oldRefreshToken);
    if (!payload) throw new UnauthorizedError('رمز التحديث غير صالح');

    const stored = await prisma.refreshToken.findUnique({
      where: { token: oldRefreshToken },
      include: { user: true },
    });

    if (!stored || stored.revoked) {
      if (stored?.family) {
        await prisma.refreshToken.updateMany({
          where: { family: stored.family, revoked: false },
          data: { revoked: true },
        });
      }
      throw new UnauthorizedError('تم إلغاء رمز التحديث');
    }

    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedError('انتهت صلاحية رمز التحديث');
    }

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revoked: true },
    });

    return this.generateTokens(stored.user);
  }

  async logout(userId: string, family?: string) {
    if (family) {
      await prisma.refreshToken.updateMany({
        where: { userId, family, revoked: false },
        data: { revoked: true },
      });
    } else {
      await prisma.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true },
      });
    }
  }
}
