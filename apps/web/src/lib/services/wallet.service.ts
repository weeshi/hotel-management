import { prisma, tenantTx } from '@/lib/utils/prisma';
import { Prisma } from '@prisma/client';
import type { PaymentMethod, Role } from '@prisma/client';
import { NotFoundError, ValidationError, ForbiddenError } from '@/lib/utils/errors';

const RECEPTION_LIMIT = 500;
const OVERRIDE_ROLES: Role[] = ['ADMIN', 'MANAGER'];

export class WalletService {
  async getWallet(guestId: string, hotelId: string) {
    const wallet = await prisma.wallet.findUnique({
      where: { guestId_hotelId: { guestId, hotelId } },
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 50 } },
    });
    if (!wallet) throw new NotFoundError('المحفظة غير موجودة');
    return wallet;
  }

  async getWalletById(walletId: string, hotelId: string) {
    const wallet = await prisma.wallet.findFirst({
      where: { id: walletId, hotelId },
      include: {
        guest: true,
        transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!wallet) throw new NotFoundError('المحفظة غير موجودة');
    return wallet;
  }

  async getOrCreateWallet(guestId: string, hotelId: string) {
    return prisma.wallet.upsert({
      where: { guestId_hotelId: { guestId, hotelId } },
      create: { guestId, hotelId },
      update: {},
    });
  }

  async deposit(data: {
    guestId: string;
    hotelId: string;
    amount: number | string;
    description?: string;
    method: PaymentMethod;
    referenceId?: string;
    idempotencyKey?: string;
    createdById?: string;
    userRole: Role;
  }) {
    if (data.idempotencyKey) {
      const existing = await prisma.walletTransaction.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (existing) return existing;
    }

    if (!['ADMIN', 'MANAGER', 'RECEPTION'].includes(data.userRole)) {
      throw new ForbiddenError('ليس لديك صلاحية الإيداع في المحفظة');
    }

    const wallet = await this.getOrCreateWallet(data.guestId, data.hotelId);
    const amount = new Prisma.Decimal(data.amount);
    const newBalance = wallet.balance.add(amount);

    const transaction = await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'DEPOSIT',
        amount,
        balanceBefore: wallet.balance,
        balanceAfter: newBalance,
        description: data.description,
        referenceId: data.referenceId,
        idempotencyKey: data.idempotencyKey,
        method: data.method,
        createdById: data.createdById,
      },
    });

    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: newBalance },
    });

    return transaction;
  }

  async withdraw(data: {
    guestId: string;
    hotelId: string;
    amount: number | string;
    description?: string;
    method: PaymentMethod;
    referenceId?: string;
    idempotencyKey?: string;
    createdById?: string;
    userRole: Role;
  }) {
    if (data.idempotencyKey) {
      const existing = await prisma.walletTransaction.findUnique({
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (existing) return existing;
    }

    if (!['ADMIN', 'MANAGER', 'RECEPTION'].includes(data.userRole)) {
      throw new ForbiddenError('ليس لديك صلاحية السحب من المحفظة');
    }

    const wallet = await this.getOrCreateWallet(data.guestId, data.hotelId);

    if (wallet.isFrozen) {
      throw new ValidationError('المحفظة مجمدة. لا يمكن إجراء عمليات السحب');
    }

    const amount = new Prisma.Decimal(data.amount);

    if (data.userRole === 'RECEPTION' && amount.gt(RECEPTION_LIMIT)) {
      throw new ValidationError(
        `حد السحب للموظفين هو ${RECEPTION_LIMIT} د.ل. يتجاوز المبلغ هذا الحد`
      );
    }

    if (wallet.balance.lt(amount)) {
      throw new ValidationError('رصيد المحفظة غير كافٍ');
    }

    const newBalance = wallet.balance.sub(amount);

    const transaction = await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'WITHDRAWAL',
        amount: amount.negated(),
        balanceBefore: wallet.balance,
        balanceAfter: newBalance,
        description: data.description,
        referenceId: data.referenceId,
        idempotencyKey: data.idempotencyKey,
        method: data.method,
        createdById: data.createdById,
      },
    });

    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: newBalance },
    });

    return transaction;
  }

  async processPayment(data: {
    guestId: string;
    hotelId: string;
    amount: number | string;
    description?: string;
    referenceId?: string;
    idempotencyKey: string;
    createdById?: string;
    userRole: Role;
  }) {
    const existing = await prisma.walletTransaction.findUnique({
      where: { idempotencyKey: data.idempotencyKey },
    });
    if (existing) return existing;

    if (!['ADMIN', 'MANAGER', 'RECEPTION', 'RESTAURANT'].includes(data.userRole)) {
      throw new ForbiddenError('ليس لديك صلاحية الدفع من المحفظة');
    }

    const wallet = await this.getOrCreateWallet(data.guestId, data.hotelId);

    if (wallet.isFrozen) {
      throw new ValidationError('المحفظة مجمدة. لا يمكن إجراء عمليات الدفع');
    }

    const amount = new Prisma.Decimal(data.amount);

    if (data.userRole === 'RECEPTION' && amount.gt(RECEPTION_LIMIT)) {
      throw new ValidationError(
        `حد الدفع للموظفين هو ${RECEPTION_LIMIT} د.ل. يتجاوز المبلغ هذا الحد`
      );
    }

    if (wallet.balance.lt(amount)) {
      throw new ValidationError('رصيد المحفظة غير كافٍ');
    }

    const newBalance = wallet.balance.sub(amount);

    const transaction = await prisma.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'PAYMENT',
        amount: amount.negated(),
        balanceBefore: wallet.balance,
        balanceAfter: newBalance,
        description: data.description,
        referenceId: data.referenceId,
        idempotencyKey: data.idempotencyKey,
        method: 'CASH',
        createdById: data.createdById,
      },
    });

    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: newBalance },
    });

    return transaction;
  }

  async migrateDebt(params: {
    guestId: string;
    hotelId: string;
    bookingId: string;
    bookingNo: string;
    amount: number;
    createdById: string;
    userRole: Role;
  }) {
    if (!['ADMIN', 'MANAGER'].includes(params.userRole)) {
      throw new ForbiddenError('فقط المدير يمكنه ترحيل الديون إلى المحفظة');
    }

    const guest = await prisma.guest.findFirst({ where: { id: params.guestId, hotelId: params.hotelId } });
    if (!guest) throw new NotFoundError('النزيل غير موجود');
    if (!guest.allowCredit) {
      throw new ForbiddenError('هذا النزيل غير مصرح له بالحصول على رصيد دائن. قم بتفعيل "السماح بالائتمان" من ملف النزيل');
    }

    return tenantTx(async (tx) => {
      let wallet = await tx.wallet.findUnique({
        where: { guestId_hotelId: { guestId: params.guestId, hotelId: params.hotelId } },
      });

      if (!wallet) {
        wallet = await tx.wallet.create({
          data: { guestId: params.guestId, hotelId: params.hotelId, balance: 0 },
        });
      }

      const amount = new Prisma.Decimal(params.amount);
      const balanceBefore = wallet.balance;
      const balanceAfter = wallet.balance.sub(amount);

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: balanceAfter },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'WITHDRAWAL',
          amount: amount.negated(),
          balanceBefore,
          balanceAfter,
          description: `ترحيل ديون حجز #${params.bookingNo}`,
          referenceId: params.bookingId,
          method: 'CASH',
          status: 'COMPLETED',
          createdById: params.createdById,
        },
      });

      return wallet;
    });
  }

  async toggleFreeze(walletId: string, hotelId: string, userRole: Role) {
    if (!['ADMIN', 'MANAGER'].includes(userRole)) {
      throw new ForbiddenError('فقط المدير يمكنه تجميد أو إلغاء تجميد المحفظة');
    }

    const wallet = await prisma.wallet.findFirst({ where: { id: walletId, hotelId } });
    if (!wallet) throw new NotFoundError('المحفظة غير موجودة');

    return prisma.wallet.update({
      where: { id: walletId },
      data: { isFrozen: !wallet.isFrozen },
    });
  }

  async getTransactions(
    walletId: string,
    hotelId: string,
    options?: { skip?: number; take?: number }
  ) {
    const wallet = await prisma.wallet.findFirst({ where: { id: walletId, hotelId } });
    if (!wallet) throw new NotFoundError('المحفظة غير موجودة');

    return prisma.walletTransaction.findMany({
      where: { walletId },
      orderBy: { createdAt: 'desc' },
      skip: options?.skip ?? 0,
      take: options?.take ?? 50,
    });
  }
}
