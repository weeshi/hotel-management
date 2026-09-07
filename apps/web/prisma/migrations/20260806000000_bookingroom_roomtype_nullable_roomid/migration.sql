-- Make roomId nullable and add roomTypeId to BookingRoom
-- Backfill roomTypeId from Room for existing records

-- 1. Add roomTypeId column (nullable first for backfill)
ALTER TABLE "BookingRoom" ADD COLUMN "roomTypeId" UUID;

-- 2. Backfill roomTypeId from Room table
UPDATE "BookingRoom" br
SET "roomTypeId" = r."roomTypeId"
FROM "Room" r
WHERE br."roomId" = r."id";

-- 3. Make roomId nullable
ALTER TABLE "BookingRoom" ALTER COLUMN "roomId" DROP NOT NULL;

-- 4. Add foreign key for roomTypeId (nullable)
ALTER TABLE "BookingRoom" ADD CONSTRAINT "BookingRoom_roomTypeId_fkey" 
    FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Add index on roomTypeId
CREATE INDEX "BookingRoom_roomTypeId_idx" ON "BookingRoom"("roomTypeId");