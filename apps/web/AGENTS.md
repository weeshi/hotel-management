# OpenCode AI Agent Rules & Architecture Guidelines

## 1. Role and Context
You are an expert Full-Stack Developer specializing in React, Next.js, Tailwind CSS, and Firebase/PostgreSQL. Your primary goal is to write clean, modular, and maintainable code while strictly adhering to the architectural guidelines of this project.

## 2. AI Interaction & Code Modification (CRITICAL)
To prevent "multiple matches" errors during file modifications:
* **Always use unique context:** When modifying existing code, include enough surrounding lines (e.g., the full function signature or unique parent tags) so the search-and-replace algorithm targets the exact location.
* **Anchor Points:** Look for `id` or `data-testid` attributes as anchor points when modifying UI components.
* **Complete Functions:** If a component or function is complex, replace the entire function rather than attempting micro-edits on heavily repeated patterns (like Tailwind class strings).

## 3. Architecture & File Structure
* **Micro-Modularization:** Do not create monolithic files. Break down complex pages into smaller, single-purpose components (e.g., extracting a `RestaurantChargeForm` from a larger `BookingDetails` page).
* **Separation of Concerns:** Strictly separate UI logic from business/database logic.
* Use **Custom Hooks** (e.g., `useBookingLogic.js`) for data fetching, API calls, and state management.
* Keep `.jsx`/`.tsx` files focused strictly on rendering the UI.

## 4. Naming Conventions
* **Semantic & Unique:** Never use generic names like `data`, `handleUpdate`, or `submit`. Use domain-specific, highly descriptive names (e.g., `invoiceDetails`, `submitServiceCharge`, `fetchGuestProfile`).
* **Components:** PascalCase (e.g., `PaymentGateway.jsx`).
* **Functions/Variables:** camelCase (e.g., `calculateTotalTax`).

## 5. UI & Styling (Tailwind CSS)
* **Code Anchors:** Always add a unique `id` or descriptive `data-component` attribute to the outermost `div` or main sections of a new component to facilitate future AI targeting.
* **Readability:** Group related Tailwind classes logically (e.g., layout first, then typography, then colors).

## 6. Backend & Database (Prisma / API Routes)
* **Relational Design:** NEVER use raw strings or names to link data. Always use explicit foreign keys (IDs) in `schema.prisma`.
* **Defensive Programming & Atomicity:** Any operation that modifies multiple related tables (e.g., updating a Task Status AND updating a Room Status) MUST be wrapped in a `prisma.$transaction`. Either all operations succeed, or they all roll back.
* **State Machines:** Never accept raw string updates for status fields. Always validate incoming status updates against a strict Transition Matrix (e.g., PENDING -> IN_PROGRESS -> COMPLETED) to prevent illegal state jumps.
* **Security & Error Handling:** Implement robust `try/catch` blocks for all async operations and return clear HTTP status codes (400, 401, 403, 404, 500).
* **Mutation Middleware Chain (MANDATORY):** Every state-mutating route MUST be wrapped in `withAuth(withCsrf(withRateLimit(handler)))` with an explicit `allowedRoles` array. GET (read-only) routes MUST still enforce `withAuth` + role scoping but may skip CSRF.

## 7. Comments & Documentation
* Use signposting comments to divide files into logical sections:
  `// --- State & Context ---`
  `// --- API Calls ---`
  `// --- Render Helpers ---`
* Explain *why* a complex logic block exists, not just *what* it does.

## 8. Monorepo Architecture Context
* This project is structured as a Monorepo using npm workspaces.
* **App-Specific Logic:** The main Next.js application is located in the `apps/web` directory. When modifying or creating features specific to this application (like pages or app-specific hooks), ensure they are created strictly within the `apps/web/` directory structure.
* **Shared Packages (CRITICAL):** Reusable UI components (Design System), utility functions, and shared configurations must be created inside the `packages/shared/src/` directory. Always use this path when a component or function is generic enough to be reused across multiple future applications.
* Do NOT create source files in the root directory.
* **Reserved Next.js Filenames:** Be extremely cautious with reserved Next.js names like `middleware.ts`, `layout.tsx`, or `page.tsx`. Do not create folders with the exact name `middleware` in the `src` root to avoid routing collisions with Next.js's native `middleware.ts` file.

## 9. Security & Secrets Management (CRITICAL)
* **DO NOT** request, generate, or attempt to read actual API keys, passwords, or production secrets.
* Always rely on `process.env.VARIABLE_NAME` for sensitive data.
* Assume all local secrets are managed safely in `.env.local` by the Tech Lead. Do not attempt to create or modify this file.
* If a proprietary integration (like a local payment gateway) requires secret cryptographic logic, generate the Class structure and methods, but leave the execution logic inside the methods blank with a comment `// TODO: Tech Lead will implement secure logic here manually.`
* **The NEXT_PUBLIC_ Trap:** NEVER prefix a sensitive API key or cryptography secret with `NEXT_PUBLIC_`. This exposes the secret to the client-side browser. Sensitive keys must remain strictly server-side.
* **Tenant-Specific Secrets:** NEVER use global `.env` variables for tenant-specific credentials (e.g., Local Payment Gateway keys). These MUST be stored securely in the database (`Hotel` or related config models) and fetched dynamically per request based on the tenant's context. Global env vars are reserved exclusively for platform-level, non-tenant credentials (e.g., the JWT signing secret, platform-wide Stripe keys).
* **Payment Gateway Credentials:** Per-tenant integration keys MUST be stored encrypted in the database (see `IntegrationConfig`), fetched server-side per request, NEVER returned in any API response (masked or omitted — `hasKey` only), and NEVER written to logs. See Section 16.

## 10. Authentication & Session Management (CRITICAL)
* **Server-Side Trust:** The Client-side (React) MUST NEVER attempt to read or verify `httpOnly` cookies. JavaScript cannot and should not access them.
* **Self-Healing Auth:** Client-side authentication state must rely strictly on Server (API) responses. If an API request returns a `401 Unauthorized` or `403 Forbidden`, the client must intercept this globally, clear local auth state (e.g., `localStorage`), and elegantly redirect to `/login`.
* **Single Source of Truth:** The Backend Middleware is the ultimate gatekeeper. Do not duplicate middleware routing logic in client-side React components.

## 11. Role-Based Access Control (RBAC) & UI Personas
* **Strict API Gatekeeping:** Every API route must explicitly define the `allowedRoles` array. Ensure strictly scoped data fetching (e.g., fetching only `taskType=CLEANING` for Housekeeping).
* **Role-Driven UI:** UI components must respect the physical constraints of the user's role. Operational staff (Housekeeping, Maintenance) require Mobile-First, touch-friendly UI (Cards), while Reception/Admin roles require high-density data views (Tables).
* **No UI Spoofing:** Never rely solely on hiding UI elements as a security measure. The backend must always validate the role independently.
* **Platform vs. Tenant Roles:** Explicitly distinguish between Platform-level roles (e.g., `SUPER_ADMIN`) and Tenant-level roles (`ADMIN`, `MANAGER`, `RECEPTION`, etc.). Platform roles operate across all hotels and are restricted to platform-only routes/APIs. Tenant roles MUST never gain access to platform routes, and vice versa.
* **Super-Admin Protection:** Routes intended for platform owners (e.g., `/superadmin/*`) MUST implement Dual-Protection: Edge Middleware validation (verify the JWT role before the page loads) AND client-side layout guards (redirect non-`SUPER_ADMIN` sessions to `/access-denied`).

## 12. Project Management & Documentation
* **RULE: VERSIONED TODO FILES.** Never overwrite a generic `todos.md` file. For every new major phase or feature set, you MUST create a sequentially numbered file (e.g., `todo_v4.md`, `todo_v5.md`). This preserves the project's historical roadmap and changelog.
* **RULE: VERIFICATION GATE.** A task is NEVER considered complete until `npm run test`, `npm run typecheck`, and `npm run lint` all pass from `apps/web`. Fix any failures introduced by your changes before finishing.

## 13. LIVING DOCUMENTATION & HISTORICAL PRESERVATION (CRITICAL)
* **RULE: SYNC-README-ON-CHANGE.** Whenever the agent completes any of the following, it MUST immediately update `README.md` to reflect the change:
  1. A major feature or module (new page, new API route group, new component collection)
  2. A schema change (new model, new field, new relation)
  3. A significant business-logic alteration (e.g., checkout validation, cancellation engine, folio settlement rules)
  4. A new phase completion or roadmap milestone
* **RULE: APPEND-ONLY CHANGELOG (NEVER DELETE HISTORY).** When updating the `README.md`, you are STRICTLY FORBIDDEN from deleting or overwriting the history of previous phases (e.g., v1 through v7). The Changelog or Version History section MUST be treated as an append-only ledger. Add new phase summaries, but leave the older records completely intact to preserve the project's historical evolution.
* **Current vs. History Distinction:** For *Current Features, Architecture, and API Reference*, you must overwrite and modify outdated information so it perfectly matches the active codebase. For the *Changelog and Roadmap history*, you must only append.
* The `README.md` MUST always serve as an accurate, up-to-date, single-source-of-truth document for the system's current feature set, architecture, API surface, and historical roadmap.
* Do NOT treat `README.md` as a one-time setup document. It is a living file that grows with the project.
* **RULE: DOCUMENT ARCHITECTURAL INSIGHTS & PITFALLS.** Whenever you discover and resolve a critical bug, race condition, data-drift, or systemic flaw, you MUST automatically document it in the `README.md` under a dedicated "Architectural Insights & Solved Pitfalls" section. You must describe the "Problem/Risk" and the "Architectural Solution/Prevention Mechanism". This ensures future developers understand WHY certain architectural decisions were made and prevents them from re-introducing the same vulnerabilities.

## 14. Multi-Tenancy & Data Isolation (CRITICAL)
* **Strict 1:1 Architecture:** The system operates a strict one-user-to-one-hotel architecture. Do NOT implement multi-hotel user switching. A user belongs to exactly one `hotelId` (or none, for `SUPER_ADMIN`), and the platform never shares users across hotels.
* **Query Scoping:** EVERY database query (except global Super-Admin queries) MUST strictly filter by `hotelId` (e.g., `where: { id, hotelId }`) to prevent cross-tenant data leakage. Never assume the ID alone is enough — a `findUnique` on a raw ID can silently return another tenant's record.
* **Relation Scoping:** When using `include`/`select`, nested relational data MUST also be filtered by `hotelId` where applicable — never expand a relation that could expose another tenant's records.
* **404 for Unowned Entities:** Accessing a resource ID that exists but does not belong to the caller's `hotelId` MUST return `404 Not Found` (not `403`). This prevents cross-tenant enumeration (confirming whether a record exists elsewhere).
* **Hostname is NOT Authorization:** The request hostname (`customDomain`) is used ONLY for branding and login-surface restriction. Data access is authorized EXCLUSIVELY by the `hotelId` inside the validated JWT. Never treat the resolved hostname as a security boundary.

## 15. Domain Resolution & White-Labeling
* **Proxy Trust:** Never implicitly trust the `x-forwarded-host` header from direct requests. Only trust it if the request provides cryptographic proof of passing through our trusted proxy (e.g., Cloudflare `cf-ray` header) or if explicitly opted-in via `TRUST_PROXY=true`.
* **Cookie Isolation:** Always use Host-Only cookies (do not set the `Domain` attribute) for authentication tokens. This ensures browsers automatically isolate sessions per tenant's custom domain and prevents a session from being shared across different tenant domains.

## 16. External Booking & Ledger Integration (Decoupled PMS Ledger) (CRITICAL)
The PMS no longer calls outbound payment gateways. External booking engines (Booking.com, Expedia, ...) collect funds themselves and inject confirmed bookings + payment ledger entries through a secure, tenant-scoped API. Receptionists visually verify transfers and log payments manually.
* **One-Way Injection Only:** The PMS NEVER initiates payment captures or gateway calls. External engines call `POST /api/integrations/[engine]/bookings` to inject an already-paid booking. Engine-side checkout is fully delegated to the engine.
* **Per-Hotel API Key Auth:** Every integration key is stored encrypted in `IntegrationConfig` (`apiKeyEnc`, AES-256-GCM via `PAYMENT_CRYPTO_KEY`), resolved from the DB per request, matched with a constant-time compare (`external-auth` middleware). The tenant (`hotelId`) comes from the DB row the key belongs to — NEVER from the payload.
* **Tenant Scoping:** All injected records (booking, folio, payment) are written with the resolved `hotelId`; rooms are resolved with `where: { id, hotelId }`. A room that belongs to another hotel is a 400. Admin integration APIs (GET/PATCH/key) use `withAuth(withCsrf(withRateLimit(handler)))` with explicit roles and return 404 for unowned configs.
* **Single-Transaction Idempotency Ledger:** Each injection runs in ONE `prisma.$transaction`: a `GatewayWebhook` row (unique on `provider + hotelId + eventId` = the external booking reference) is created, then booking (CONFIRMED, source WEBSITE) + folio + room charges + SUCCEEDED payment + folio payment posting + settlement. A retried delivery hits the unique constraint and is answered `{ duplicate: true }` — never double-posted.
* **Key Hygiene:** `hasKey` is exposed only; the plaintext key is returned once at generation. Keys are NEVER returned in API responses, logs, or tests.
* **Booking Numbers:** `bookingNo` is globally unique (`@@unique` on the model), so `generateBookingNumber()` runs a GLOBAL sequence — never per-hotel — or two hotels collide on `BK-YYYYMM-0001`.
* **Front-Desk Manual Payments:** The portal `payments/create` route logs manual SUCCEEDED payments for any non-WALLET method (CASH, MOBICASH, ...) with `gateway = method.toLowerCase()` and a stable `gatewayPaymentId` — no gateway branch, no outbound call.
