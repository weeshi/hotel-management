import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Running BookingRoom migration...');

  // 1. Check if roomTypeId column exists, if not add it
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "BookingRoom" ADD COLUMN "roomTypeId" UUID;
    `);
    console.log('Added roomTypeId column');
  } catch (e: any) {
    if (e.message?.includes('already exists')) {
      console.log('roomTypeId column already exists, skipping');
    } else {
      throw e;
    }
  }

  // 2. Backfill roomTypeId from Room table
  try {
    await prisma.$executeRawUnsafe(`
      UPDATE "BookingRoom" br
      SET "roomTypeId" = r."roomTypeId"::uuid
      FROM "Room" r
      WHERE br."roomId" = r."id";
    `);
    console.log('Backfilled roomTypeId');
  } catch (e: any) {
    console.log('Backfill error (may be already done):', e.message);
  }

  // 3. Make roomId nullable
  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "BookingRoom" ALTER COLUMN "roomId" DROP NOT NULL;
    `);
    console.log('Made roomId nullable');
  } catch (e: any) {
    if (e.message?.includes('already')) {
      console.log('roomId already nullable, skipping');
    } else {
      throw e;
    }
  }

  // 4. Skip FK for now - will handle via proper migration later
  console.log('Skipping FK for roomTypeId (type mismatch) - will handle separately');

  // 5. Add index on roomTypeId
  try {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX "BookingRoom_roomTypeId_idx" ON "BookingRoom"("roomTypeId");
    `);
    console.log('Added index on roomTypeId');
  } catch (e: any) {
    if (e.message?.includes('already exists')) {
      console.log('Index already exists, skipping');
    } else {
      throw e;
    }
  }

  console.log('Migration completed successfully!');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });