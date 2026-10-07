import type { Metadata, Viewport } from 'next';
import { Inter, Prompt } from 'next/font/google';
import './globals.css';
import { FloodStoreProvider } from '@/lib/store';

const prompt = Prompt({
  subsets: ['latin', 'thai'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-prompt',
  display: 'swap',
});
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'FloodSafe กระบี่ – นำทางหลบน้ำท่วมด้วย AI และศูนย์สั่งการกู้ภัย',
  description:
    'ระบบนำทางหลบน้ำท่วมแบบเรียลไทม์ รายงานระดับน้ำจากประชาชน และ AI ช่วยจัดสรรทรัพยากรกู้ภัย จังหวัดกระบี่',
};

export const viewport: Viewport = {
  themeColor: '#0b1120',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${prompt.variable} ${inter.variable}`}>
      <body className="bg-navy-950 font-sans text-slate-200 antialiased">
        <FloodStoreProvider>{children}</FloodStoreProvider>
      </body>
    </html>
  );
}
