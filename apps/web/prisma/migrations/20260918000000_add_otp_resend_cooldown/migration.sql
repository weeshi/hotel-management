-- SA.2.5 OTP resend cooldown — see docs/SUPER-ADMIN-ARCH.md §5.7
-- Additive migration: one nullable column for the anti-spam cooldown floor.

-- AlterTable
ALTER TABLE "OtpChallenge" ADD COLUMN     "lastCodeSentAt" TIMESTAMP(3);