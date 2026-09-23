import type { Metadata } from 'next';
import { Geist, Newsreader } from 'next/font/google';
import './globals.css';
import { SITE_URL } from '@/lib/site';

const sans = Geist({ variable: '--font-sans', subsets: ['latin'] });
const editorial = Newsreader({ variable: '--font-editorial', subsets: ['latin'] });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Hola Vallarta | Noticias de Puerto Vallarta y Jalisco', template: '%s | Hola Vallarta' },
  description: 'Noticias de último minuto de Puerto Vallarta, Bahía de Banderas, Jalisco y México.',
  alternates: { canonical: '/' },
  openGraph: { type: 'website', locale: 'es_MX', siteName: 'Hola Vallarta', title: 'Hola Vallarta', description: 'Lo que pasa en Vallarta, Jalisco y México, al momento.', images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Hola Vallarta — Lo que pasa, al momento.' }] },
  twitter: { card: 'summary_large_image', title: 'Hola Vallarta', description: 'Lo que pasa en Vallarta, Jalisco y México, al momento.', images: ['/og.png'] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-MX" data-scroll-behavior="smooth"><body className={`${sans.variable} ${editorial.variable}`}>{children}</body></html>;
}
