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

## 10. Authentication & Session Management (CRITICAL)
* **Server-Side Trust:** The Client-side (React) MUST NEVER attempt to read or verify `httpOnly` cookies. JavaScript cannot and should not access them.
* **Self-Healing Auth:** Client-side authentication state must rely strictly on Server (API) responses. If an API request returns a `401 Unauthorized` or `403 Forbidden`, the client must intercept this globally, clear local auth state (e.g., `localStorage`), and elegantly redirect to `/login`.
* **Single Source of Truth:** The Backend Middleware is the ultimate gatekeeper. Do not duplicate middleware routing logic in client-side React components.

## 11. Role-Based Access Control (RBAC) & UI Personas
* **Strict API Gatekeeping:** Every API route must explicitly define the `allowedRoles` array. Ensure strictly scoped data fetching (e.g., fetching only `taskType=CLEANING` for Housekeeping).
* **Role-Driven UI:** UI components must respect the physical constraints of the user's role. Operational staff (Housekeeping, Maintenance) require Mobile-First, touch-friendly UI (Cards), while Reception/Admin roles require high-density data views (Tables).
* **No UI Spoofing:** Never rely solely on hiding UI elements as a security measure. The backend must always validate the role independently.