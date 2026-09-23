import type { Metadata } from 'next';
import { SiteFooter, SiteHeader } from '../../components/site-chrome';
import { SITE_URL } from '../../../lib/site';

export const metadata: Metadata = {
  title: 'Hola Vallarta — Autor',
  description: 'Perfil editorial de Hola Vallarta, medio digital de Puerto Vallarta y Bahía de Banderas.',
  alternates: { canonical: '/autores/hola-vallarta' },
};

export default function HolaVallartaAuthorPage() {
  const organization = {
    '@context': 'https://schema.org', '@type': 'NewsMediaOrganization', name: 'Hola Vallarta',
    url: SITE_URL, description: 'Medio digital con información de Puerto Vallarta, Bahía de Banderas, Jalisco y México.',
  };
  return <><SiteHeader /><main className="page-shell author-page">
    <span className="brand-mark author-mark" aria-hidden="true"><span>H</span><span>V</span></span>
    <span className="eyebrow">Perfil editorial</span><h1>Hola Vallarta</h1>
    <p className="author-lead">Somos un medio digital enfocado en informar lo que sucede en Puerto Vallarta, Bahía de Banderas, Jalisco y México.</p>
    <p>Nuestras noticias se publican bajo la firma institucional Hola Vallarta y siguen un proceso de identificación de fuentes, redacción original, actualización y corrección.</p>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organization).replace(/</g, '\\u003c') }} />
  </main><SiteFooter /></>;
}
