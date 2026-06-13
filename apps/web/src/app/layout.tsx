import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: 'نظام إدارة الفنادق',
    template: '%s | نظام إدارة الفنادق',
  },
  description: 'منصة متكاملة لإدارة الفنادق - حجوزات، فوترة، خدمات',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
