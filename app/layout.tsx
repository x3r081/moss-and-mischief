import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Moss & Mischief — A little island. A grand adventure.',
  description:
    'Explore a sunlit island, build your homestead, grow your garden, and save a goose mayor from himself.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
