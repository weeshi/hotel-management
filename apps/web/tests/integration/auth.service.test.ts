import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { AuthService } from '@/lib/services/auth.service';
import { resetDb, seedTestData, closeDb } from '../helpers/db';

const authService = new AuthService();

let data: Awaited<ReturnType<typeof seedTestData>>;

beforeEach(async () => {
  await resetDb();
  data = await seedTestData();
});

afterAll(async () => {
  await closeDb();
});

describe('AuthService', () => {
  describe('login', () => {
    it('should return tokens for valid credentials', async () => {
      const result = await authService.login('test@hotel.com', 'TestPass123');

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe('test@hotel.com');
      expect(result.user.role).toBe('ADMIN');
      expect(result.user.name).toBe('Test Admin');
    });

    it('should throw for wrong password', async () => {
      await expect(
        authService.login('test@hotel.com', 'WrongPassword')
      ).rejects.toThrow('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    });

    it('should throw for non-existent user', async () => {
      await expect(
        authService.login('nonexistent@hotel.com', 'TestPass123')
      ).rejects.toThrow('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    });

    it('should lock account after 5 failed attempts', async () => {
      for (let i = 0; i < 5; i++) {
        await expect(
          authService.login('test@hotel.com', 'WrongPassword')
        ).rejects.toThrow();
      }

      await expect(
        authService.login('test@hotel.com', 'TestPass123')
      ).rejects.toThrow('الحساب مقفل');
    });

    it('should reset failed attempts on successful login', async () => {
      for (let i = 0; i < 3; i++) {
        await expect(
          authService.login('test@hotel.com', 'WrongPassword')
        ).rejects.toThrow();
      }

      const result = await authService.login('test@hotel.com', 'TestPass123');
      expect(result.accessToken).toBeDefined();
    });

    it('should return receptionist role correctly', async () => {
      const result = await authService.login('reception@test.com', 'TestPass123');
      expect(result.user.role).toBe('RECEPTION');
    });
  });

  describe('refreshTokens', () => {
    it('should return new tokens for valid refresh token', async () => {
      const login = await authService.login('test@hotel.com', 'TestPass123');
      const refreshed = await authService.refreshTokens(login.refreshToken);

      expect(refreshed.accessToken).toBeDefined();
      expect(refreshed.refreshToken).toBeDefined();
      expect(refreshed.refreshToken).not.toBe(login.refreshToken);
    });

    it('should reject already used refresh token', async () => {
      const login = await authService.login('test@hotel.com', 'TestPass123');
      await authService.refreshTokens(login.refreshToken);

      await expect(
        authService.refreshTokens(login.refreshToken)
      ).rejects.toThrow('تم إلغاء رمز التحديث');
    });

    it('should reject invalid refresh token', async () => {
      await expect(
        authService.refreshTokens('invalid-token')
      ).rejects.toThrow();
    });
  });

  describe('logout', () => {
    it('should revoke all refresh tokens for user', async () => {
      const login1 = await authService.login('test@hotel.com', 'TestPass123');
      const login2 = await authService.login('test@hotel.com', 'TestPass123');

      await authService.logout(data.admin.id);

      await expect(
        authService.refreshTokens(login1.refreshToken)
      ).rejects.toThrow('تم إلغاء رمز التحديث');

      await expect(
        authService.refreshTokens(login2.refreshToken)
      ).rejects.toThrow('تم إلغاء رمز التحديث');
    });

    it('should revoke only family-specific tokens', async () => {
      const login = await authService.login('test@hotel.com', 'TestPass123');

      const family = (await import('@/lib/utils/jwt')).verifyRefreshToken;
      const payload = await family(login.refreshToken);

      await authService.logout(data.admin.id, payload.family);

      await expect(
        authService.refreshTokens(login.refreshToken)
      ).rejects.toThrow('تم إلغاء رمز التحديث');
    });
  });
});
