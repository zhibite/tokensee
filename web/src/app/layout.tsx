import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TokenSee — Decode any transaction',
  description: 'Invisible infrastructure for on-chain data. Decode any blockchain transaction into human-readable format.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-zinc-950 antialiased">
        {children}
      </body>
    </html>
  );
}
