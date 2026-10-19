-- Add hotelId to the five financial tables (nullable first, backfill, then NOT NULL).
-- Folio derives from Booking.hotelId; the rest derive through their folio/booking-room chain.

-- AlterTable
ALTER TABLE "Folio" ADD COLUMN "hotelId" TEXT;

-- BackfillFolio
UPDATE "Folio" f
SET "hotelId" = b."hotelId"
FROM "Booking" b
WHERE b."id" = f."bookingId";

-- AlterTable
ALTER TABLE "ScheduledCharge" ADD COLUMN "hotelId" TEXT;

-- BackfillScheduledCharge
UPDATE "ScheduledCharge" sc
SET "hotelId" = f."hotelId"
FROM "Folio" f
WHERE f."id" = sc."folioId";

-- AlterTable
ALTER TABLE "RoomCharge" ADD COLUMN "hotelId" TEXT;

-- BackfillRoomCharge
UPDATE "RoomCharge" rc
SET "hotelId" = b."hotelId"
FROM "BookingRoom" br
JOIN "Booking" b ON b."id" = br."bookingId"
WHERE br."id" = rc."bookingRoomId";

-- AlterTable
ALTER TABLE "FolioTransaction" ADD COLUMN "hotelId" TEXT;

-- BackfillFolioTransaction
UPDATE "FolioTransaction" ft
SET "hotelId" = f."hotelId"
FROM "Folio" f
WHERE f."id" = ft."folioId";

-- AlterTable
ALTER TABLE "FolioDiscount" ADD COLUMN "hotelId" TEXT;

-- BackfillFolioDiscount
UPDATE "FolioDiscount" fd
SET "hotelId" = f."hotelId"
FROM "Folio" f
WHERE f."id" = fd."folioId";

-- SetNotNull
ALTER TABLE "Folio" ALTER COLUMN "hotelId" SET NOT NULL;
ALTER TABLE "ScheduledCharge" ALTER COLUMN "hotelId" SET NOT NULL;
ALTER TABLE "RoomCharge" ALTER COLUMN "hotelId" SET NOT NULL;
ALTER TABLE "FolioTransaction" ALTER COLUMN "hotelId" SET NOT NULL;
ALTER TABLE "FolioDiscount" ALTER COLUMN "hotelId" SET NOT NULL;

-- CreateForeignKey
ALTER TABLE "Folio" ADD CONSTRAINT "Folio_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ScheduledCharge" ADD CONSTRAINT "ScheduledCharge_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RoomCharge" ADD CONSTRAINT "RoomCharge_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FolioTransaction" ADD CONSTRAINT "FolioTransaction_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FolioDiscount" ADD CONSTRAINT "FolioDiscount_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Folio_hotelId_idx" ON "Folio"("hotelId");
CREATE INDEX "ScheduledCharge_hotelId_idx" ON "ScheduledCharge"("hotelId");
CREATE INDEX "RoomCharge_hotelId_idx" ON "RoomCharge"("hotelId");
CREATE INDEX "FolioTransaction_hotelId_idx" ON "FolioTransaction"("hotelId");
CREATE INDEX "FolioDiscount_hotelId_idx" ON "FolioDiscount"("hotelId");