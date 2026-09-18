import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'دخول المنصة',
};

// Centered-card wrapper for the pre-auth Super-Admin screens (SA.5). No
// sidebar/nav here — the full shell is only mounted by the `(dashboard)` group.
export default function SuperAdminAuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg-primary)] p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}