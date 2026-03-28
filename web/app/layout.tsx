import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'VisionGenie Community',
  description: 'Shared web community built alongside the native app.',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
