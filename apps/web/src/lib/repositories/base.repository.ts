import { prisma } from '@/lib/utils/prisma';
import { Prisma } from '@prisma/client';

export class BaseRepository<T extends { id: string }> {
  constructor(
    protected model: {
      findUnique: (args: any) => any;
      findMany: (args: any) => any;
      findFirst: (args: any) => any;
      create: (args: any) => any;
      update: (args: any) => any;
      delete: (args: any) => any;
      count: (args: any) => any;
    }
  ) {}

  async findById(id: string): Promise<T | null> {
    return this.model.findUnique({ where: { id } });
  }

  async findMany(args?: {
    where?: any;
    include?: any;
    orderBy?: any;
    skip?: number;
    take?: number;
  }): Promise<T[]> {
    return this.model.findMany(args);
  }

  async findFirst(where: any): Promise<T | null> {
    return this.model.findFirst({ where });
  }

  async create(data: any): Promise<T> {
    return this.model.create({ data });
  }

  async update(id: string, data: any): Promise<T> {
    return this.model.update({ where: { id }, data });
  }

  async delete(id: string): Promise<T> {
    return this.model.delete({ where: { id } });
  }

  async count(where?: any): Promise<number> {
    return this.model.count({ where });
  }

  async paginate(params: {
    page?: number;
    limit?: number;
    where?: any;
    include?: any;
    orderBy?: any;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.model.findMany({
        where: params.where,
        include: params.include,
        orderBy: params.orderBy || { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.model.count({ where: params.where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
