import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Moss & Mischief — The Great Bramblewick Adventure',
  description:
    'Explore six island regions, build a village, farm, fish, craft and complete 36 quests while a goose mayor takes the credit.',
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
