# Stage 4: Core Operational Perfection — todo_v4.md

> **Phase:** Post-MVP Operational Hardening
> **Branch:** `fix/qa-round-1` → `feat/operations-v4`
> **Goal:** Achieve operational perfection in booking lifecycle management for Reception staff.

---

## Phase 1: In-House Management (Modifications During Stay)

### 1.1 Room Move Logic (`CHECKED_IN` bookings)

**API — `POST /api/admin/bookings/[id]/move-room`**
- Accept body: `{ targetRoomId: string, reason?: string }`
- Validate booking status === `CHECKED_IN`
- Validate target room is `AVAILABLE` or `DIRTY` (allow moving to DIRTY with override flag)
- **Business logic (`booking.service.ts:moveRoom()`):**
  1. Wrap everything in `prisma.$transaction`
  2. Create a `FolioTransaction` crediting back unused nights on old room (pro-rated if mid-stay)
  3. Create a `FolioTransaction` charging new room rate for remaining nights
  4. Update `BookingRoom` – set `checkOut` on old room record, create new `BookingRoom` for target room
  5. Set old room `status = DIRTY`
  6. Set new room `status = OCCUPIED`
  7. Create `AuditLog` entry with move reason
- **UI (`MoveRoomModal.tsx`)**:
  - Dropdown/combobox to select target room (filtered by `AVAILABLE` + `DIRTY`)
  - Show room type, floor, current status
  - Confirmation summary: old room → new room, any rate difference
  - Triggered from a "Move Room" button on `BookingCard.tsx` (visible only when `CHECKED_IN`)

### 1.2 Stay Extension Logic

**API — `PATCH /api/admin/bookings/[id]/extend`**
- Accept body: `{ newCheckOut: string (ISO date) }`
- Validate `newCheckOut > currentCheckOut`
- Validate room availability for the extension period (no overlapping bookings)
- **Business logic (`booking.service.ts:extendStay()`):**
  1. Wrap in `prisma.$transaction`
  2. Delete existing room-charge `FolioTransaction` rows for the original stay
  3. Recalculate room charges for the full new date range
  4. Insert new `FolioTransaction` rows with updated amounts
  5. Update booking `checkOut` date on `Booking` and all `BookingRoom` records
  6. If room was already paid via folio settlement, reset folio to `ACTIVE`
- **Access control:** `RECEPTION`, `ADMIN`, `MANAGER`
- **UI (`ExtendStayModal.tsx`):**
  - Date picker for new check-out date
  - Show availability calendar (green/red dots for available/occupied nights)
  - Price summary: additional nights, new total
  - Triggered from "Extend Stay" button on `BookingCard.tsx`

### Prisma Schema Changes (Phase 1)
- Maybe add `moveReason` column to `AuditLog` or a new `RoomMove` table if detailed history is needed.

---

## Phase 2: Cancellations, No-Shows & Refunds

### 2.1 Strict Cancellation Policy Engine

**Prisma Schema — `CancellationPolicy` model (already exists, may need expansion)**
- Ensure fields: `name`, `hotelId`, `rules` (JSON array of `{ hoursBefore: number, refundPercent: number }`), `isDefault`
- Add helper: `calculateRefundPercent(checkIn: Date, cancelTime: Date, rules: Json): number`
  - Sort rules by `hoursBefore` descending
  - Find first rule where `hoursBefore * 3600000 <= diffMs(checkIn, cancelTime)`
  - Return `refundPercent`

**API — `POST /api/admin/bookings/[id]/cancel` (enhance existing)**
- Accept optional body: `{ reason?: string, noShow?: boolean }`
- **Business logic (`booking.service.ts:cancelBooking()`):**
  1. Load booking with `Folio`, `FolioTransaction`, `Wallet`
  2. If `noShow === true` AND `status === CONFIRMED` AND `checkIn < now`, treat as no-show
  3. Apply cancellation policy:
     - Calculate `refundPercent` via `CancellationPolicy`
     - If `refundPercent === 0`: full penalty — charge folio full amount, no refund
     - If `refundPercent === 100`: full refund — void all charges, refund payments
     - If partial: keep penalty portion on folio, refund rest
  4. **Penalty charge:** Create a `FolioTransaction` with `type = CANCELLATION_PENALTY` (negative amount = debt)
  5. **Refund tracking:**
     - If wallet has credit transactions, refund to wallet (create `WalletTransaction` with `type = REFUND`)
     - If payment was via gateway, create a `Refund` record linked to original `Payment`
  6. Update booking `status = CANCELLED` or `NO_SHOW`
  7. Set all assigned rooms `status = AVAILABLE` (or `DIRTY` if no-show after check-in time)
  8. Create `AuditLog`
- **Access control:** `RECEPTION`, `ADMIN`, `MANAGER` (with possible confirmation dialog for full refunds)

### 2.2 Secure Refund Gateway Integration

**API — `POST /api/admin/payments/[id]/refund`**
- Already exists stub. Enhance with:
  - Validate original payment method supports refunds
  - Call payment gateway refund API (mock: mark as `REFUNDED`)
  - Create `Refund` record with `amount`, `paymentId`, `reason`, `processedById`
  - Link refund to folio as negative `FolioTransaction`

**UI (`RefundModal.tsx` — exists, enhance):**
- Show original payment details (method, amount, date)
- Refund amount field (default = full, can be partial)
- Reason textarea
- Confirmation with warning: "This action cannot be undone"
- Only accessible for `ADMIN`/`MANAGER`

### Prisma Schema Changes (Phase 2)
- Add `type` field to `FolioTransaction` enum: add `CANCELLATION_PENALTY`, `REFUND`
- Add `Refund` model if not fully defined:
  ```prisma
  model Refund {
    id            String   @id @default(cuid())
    amount        Decimal
    reason        String?
    status        RefundStatus @default(PENDING)
    paymentId     String
    payment       Payment  @relation(fields: [paymentId], references: [id])
    processedById String
    processedBy   User     @relation(fields: [processedById], references: [id])
    createdAt     DateTime @default(now())
  }
  enum RefundStatus { PENDING PROCESSED FAILED }
  ```
- Add `noShow` or `cancellationReason` field to `Booking`

---

## Phase 3: Group Bookings & Master Folios

### 3.1 Group Booking Structure

**Prisma Schema Changes**
```prisma
model GroupBooking {
  id              String    @id @default(cuid())
  name            String
  hotelId         String
  hotel           Hotel     @relation(fields: [hotelId], references: [id])
  masterFolioId   String?   // optional: can bill everything to one folio
  masterFolio     Folio?    @relation("MasterFolio", fields: [masterFolioId], references: [id])
  bookings        Booking[]
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

// Add to Booking model:
// groupBookingId  String?
// groupBooking    GroupBooking? @relation(fields: [groupBookingId], references: [id])
```

**API — `POST /api/admin/group-bookings`**
- Create group with name, hotelId
- Optionally assign existing bookings by IDs

**API — `POST /api/admin/group-bookings/[id]/assign`**
- Accept `{ bookingIds: string[] }`
- Validate bookings belong to same hotel
- Link bookings to group

### 3.2 Master Folio vs Sub-Folios

**Routing Rules**
- Master Folio: created when group is created. All room charges billed to master.
- Sub-Folios: each booking retains its own folio for incidentals (minibar, restaurant, etc.)
- Routing Rule model:
  ```prisma
  model FolioRoutingRule {
    id            String @id @default(cuid())
    groupBookingId String
    groupBooking  GroupBooking @relation(fields: [groupBookingId], references: [id])
    chargeType    String // ROOM_CHARGE, SERVICE, RESTAURANT, etc.
    targetFolioId String // master folio or sub-folio
    targetFolio   Folio  @relation(fields: [targetFolioId], references: [id])
  }
  ```

**API — `PUT /api/admin/group-bookings/[id]/routing`**
- Accept `{ rules: [{ chargeType, targetFolioId }] }`
- Update routing rules

**Folio Transaction Enhancement**
- When adding a charge, check if booking belongs to a group with routing rules
- Route charge to appropriate folio (master vs sub) based on `chargeType`

**UI (`GroupBookingPanel.tsx`):**
- Show group members (bookings) with room numbers, guest names
- Master Folio balance card
- Per-booking Sub-Folio balance cards
- Routing rule editor: dropdown per charge type selecting target folio
- Visible on booking details page when `groupBookingId` is set

---

## Phase 4: Interactive Tape Chart (UI/UX)

### 4.1 Tape Chart Component

**New Component: `components/checkin/TapeChart.tsx`**
- Full-screen calendar/chart for Reception
- **X-axis:** Dates (horizontal, columns = days)
- **Y-axis:** Rooms (rows, grouped by floor/room type)
- **Cells:** Colored by booking status:
  - `CONFIRMED` arrival → departure: blue bar
  - `CHECKED_IN`: green bar
  - `OVERSTAY`: red bar
  - `MAINTENANCE`/`DIRTY`: gray/shaded
  - `AVAILABLE`: white/empty
- **Interactions:**
  - **Drag right edge** of a booking bar → extend stay (calls `PATCH /extend`)
  - **Drag whole bar vertically** → move room (calls `POST /move-room`)
  - **Click on empty cell** → new booking modal for that room on that date

### 4.2 Data Fetching

**API — `GET /api/admin/tape-chart?from=DATE&to=DATE`**
- Returns:
  ```ts
  {
    rooms: { id, roomNumber, floor, roomType, status }[]
    bookings: {
      id, guestName, roomId, checkIn, checkOut, status,
      folioBalance, phone
    }[]
  }
  ```
- Backend logic: query `BookingRoom` joined with `Booking`, `Guest` for the date range
- Filter to hotel scope

### 4.3 Drag-and-Drop Logic

**Custom Hook: `useTapeChartDrag.ts`**
- `onDragEnd(bookingId, sourceRoomId, targetRoomId, newCheckOut)`
- Validate before calling API:
  - Target room not occupied for overlapping dates
  - Date change is forward only (no shortening via drag — use Edit for that)
- Show loading spinner on the cell during API call
- On success, re-fetch tape chart data
- On error, show toast and snap bar back to original position

### 4.4 Tape Chart Page

**Page: `app/(dashboard)/reception/tape-chart/page.tsx`**
- Date range selector (default: today to today+14)
- `TapeChart` component
- Search/filter: by guest name, room number, floor
- Print-friendly CSS for daily reports
- Link from navigation sidebar for Reception role

### Prisma Schema Changes (Phase 4)
- No schema changes needed beyond Phase 1 & 3. All data already exists in `BookingRoom`, `Booking`, `Room`.

---

---
---

## Phase 5: Staging & Deployment Infrastructure

### 5.1 Staging Environment Setup
- **Target:** Deploy the current `fix/qa-round-1` branch to a staging server
- **Hosting options (TBD):** Vercel (easiest for Next.js), Railway, or self-hosted VPS
- **Requirements:**
  - PostgreSQL instance for staging database
  - Environment variables configured (DATABASE_URL, JWT_SECRET, etc.)
  - CI/CD pipeline (GitHub Actions) for auto-deploy on push to staging branch
- **Deliverables:**
  - `vercel.json` or Dockerfile for deployment
  - GitHub Actions workflow `.github/workflows/deploy-staging.yml`
  - Staging environment config template

### 5.2 Database Migration Strategy
- Run `prisma migrate deploy` on staging (not `db push`)
- Maintain a `prisma/migrations/` history — never reset on staging
- Backup/restore procedure for staging DB snapshots

### 5.3 Smoke Tests & Health Checks
- **Health endpoint:** `GET /api/health` returning `{ status: "ok", db: "connected" }`
- **Smoke test suite:** A lightweight suite that verifies:
  - Guest creation + Booking creation
  - Folio charge + payment
  - Wallet deposit + withdrawal
  - Room status transitions
- **Post-deploy script:** Automatically run smoke tests after staging deploy

### 5.4 Monitoring & Alerting
- Basic error tracking (Sentry or similar)
- Uptime monitoring (pingdom, uptimerobot, or similar)
- Slack/Discord webhook for deploy notifications

---

---
---

## Phase 6: Smart Hotel & Security Compliance (Future)

### 6.1 QR Code Integration (Inspired by EFQRCode)
- **Web-based QR generation:** Generate QR codes server-side for:
  - **Fast Check-in:** Guest scans QR at reception kiosk → pre-filled registration form
  - **Restaurant POS:** Table-side QR links to digital menu + guest folio for payment
  - **Digital Wallet:** Guest scans QR to top up wallet or view balance
- **Architecture:**
  - Use `qrcode` npm package (server-side) or native Web QR API (`QRCode` from `html5-qrcode`)
  - QR payload: encrypted token + booking/table reference
  - No native/hardware dependency — fully web-based
- **UI Components:**
  - `QRCodeGenerator.tsx` — renders QR in modals / print receipts
  - `QRScanner.tsx` — camera-based scanner using browser `getUserMedia` for check-in kiosk
- **Security:** QR tokens must be single-use, time-limited (5 min), signed with HMAC

### 6.2 Live ID/Passport Document Scanner
- **Hardware Integration:** Camera-based document scanner using WebRTC (`getUserMedia`)
- **Processing:**
  - Capture image frame from camera stream
  - (Future) Integrate with OCR service (e.g., Tesseract.js or cloud API) to extract MRZ lines
  - Store captured image as secure attachment linked to Guest profile
- **Storage:**
  - Images stored in `Guest.documents` relation (new model `GuestDocument`)
  - Encrypted at rest, access-logged via AuditLog
  - Retention policy: auto-delete after guest checkout + 30 days
- **Prisma Schema Addition:**
  ```prisma
  model GuestDocument {
    id        String   @id @default(uuid())
    guestId   String
    guest     Guest    @relation(fields: [guestId], references: [id])
    type      String   // PASSPORT, ID, VISA
    imageUrl  String   // encrypted path
    mrzData   String?  // extracted MRZ text
    uploadedAt DateTime @default(now())
    expiresAt DateTime?
  }
  ```

---

## Summary of All Prisma Schema Changes Needed

| Model | Change | Phase |
|-------|--------|-------|
| `FolioTransaction` | Add enum values `CANCELLATION_PENALTY`, `REFUND` | P2 |
| `Refund` | Create new model with payment link | P2 |
| `Booking` | Add `groupBookingId`, `cancellationReason`, `noShow` | P2, P3 |
| `GroupBooking` | Create new model | P3 |
| `FolioRoutingRule` | Create new model | P3 |
| `GuestDocument` | Create new model for scanned IDs/passports | P6 |

## Summary of All New API Routes

| Method | Route | Phase |
|--------|-------|-------|
| `POST` | `/api/admin/bookings/[id]/move-room` | P1 |
| `PATCH` | `/api/admin/bookings/[id]/extend` | P1 |
| `POST` | `/api/admin/bookings/[id]/cancel` (enhance) | P2 |
| `POST` | `/api/admin/payments/[id]/refund` (enhance) | P2 |
| `POST` | `/api/admin/group-bookings` | P3 |
| `POST` | `/api/admin/group-bookings/[id]/assign` | P3 |
| `PUT` | `/api/admin/group-bookings/[id]/routing` | P3 |
| `GET` | `/api/admin/tape-chart` | P4 |
| `POST` | `/api/admin/bookings/[id]/move-room` (enhance with drag) | P4 |
| `PATCH` | `/api/admin/bookings/[id]/extend` (enhance with drag) | P4 |

## Summary of All New UI Components

| Component | Phase | Description |
|-----------|-------|-------------|
| `MoveRoomModal.tsx` | P1 | Room transfer dialog |
| `ExtendStayModal.tsx` | P1 | Stay extension with availability preview |
| `GroupBookingPanel.tsx` | P3 | Group management with routing rules |
| `TapeChart.tsx` | P4 | Interactive drag-and-drop calendar |
| `useTapeChartDrag.ts` | P4 | Drag-and-drop hook |
| `QRCodeGenerator.tsx` | P6 | QR code renderer for receipts/kiosk |
| `QRScanner.tsx` | P6 | Camera-based QR scanner for fast check-in |
| `DocumentScanner.tsx` | P6 | Live ID/passport camera capture |
