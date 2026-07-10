import type { Metadata } from 'next';
import { Manrope, Montserrat } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth';

// Self-hosted by Next.js — no external request, no layout shift.
// Montserrat = primary/display (headings, brand); Manrope = secondary (body/UI).
const montserrat = Montserrat({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-montserrat',
});

const manrope = Manrope({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-manrope',
});

export const metadata: Metadata = {
  title: 'NISMS — Natural Intellects School Management System',
  description: 'Multi-tenant school management platform by Natural Intellects',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${montserrat.variable} ${manrope.variable}`}>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
