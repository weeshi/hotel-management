process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/hotel_test';
delete (globalThis as any).prisma;
