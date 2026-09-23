import Link from 'next/link';

export function BrandMark() {
  return <span className="brand-mark" aria-hidden="true"><span>H</span><span>V</span></span>;
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <button className="icon-button menu-button" aria-label="Abrir menú"><span /><span /></button>
        <Link className="brand" href="/" aria-label="Hola Vallarta, inicio">
          <BrandMark /><span className="brand-name"><strong>HOLA</strong> Vallarta</span>
        </Link>
        <nav className="desktop-nav" aria-label="Navegación principal">
          <Link href="/ultimo-minuto">Último minuto</Link><Link href="/jalisco">Jalisco</Link><Link href="/nacional">Nacional</Link>
        </nav>
        <button className="icon-button search-button" aria-label="Buscar noticias"><span /></button>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer"><div className="page-shell footer-inner">
      <Link className="brand footer-brand" href="/"><BrandMark /><span className="brand-name"><strong>HOLA</strong> Vallarta</span></Link>
      <p>Noticias de Puerto Vallarta, Bahía de Banderas y México.</p><small>© 2026 Hola Vallarta</small>
    </div></footer>
  );
}
