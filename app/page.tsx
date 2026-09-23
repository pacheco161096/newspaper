/* eslint-disable @next/next/no-img-element */
import Link from 'next/link';
import { getAllArticles } from '../lib/content-provider';

export const dynamic = 'force-dynamic';

function storyTime(value: string) {
  return new Intl.DateTimeFormat('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' }).format(new Date(value));
}

function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <span>H</span><span>V</span>
    </span>
  );
}

export default async function Home() {
  const articles = await getAllArticles();
  const lead = articles[0];
  const latest = articles.slice(1, 4);
  const jalisco = articles.filter((article) => article.category === 'jalisco').slice(0, 2);
  if (!lead) return <main><header className="site-header"><div className="header-inner"><span /><Link className="brand" href="/"><BrandMark /><span className="brand-name"><strong>HOLA</strong> Vallarta</span></Link><span /></div></header><section className="page-shell listing-page"><header className="listing-title"><span className="eyebrow">Hola Vallarta</span><h1>Muy pronto</h1><p>Estamos preparando las noticias más importantes de Puerto Vallarta, Jalisco y México.</p></header></section></main>;
  return (
    <main>
      <header className="site-header">
        <div className="header-inner">
          <button className="icon-button menu-button" aria-label="Abrir menú"><span /><span /></button>
          <Link className="brand" href="/" aria-label="Hola Vallarta, inicio">
            <BrandMark />
            <span className="brand-name"><strong>HOLA</strong> Vallarta</span>
          </Link>
          <nav className="desktop-nav" aria-label="Navegación principal">
            <Link className="active" href="/ultimo-minuto">Último minuto</Link>
            <Link href="/jalisco">Jalisco</Link>
            <Link href="/nacional">Nacional</Link>
          </nav>
          <button className="icon-button search-button" aria-label="Buscar noticias"><span /></button>
        </div>
      </header>

      <section className="breaking" id="ultimo-minuto" aria-label="Último minuto">
        <div className="page-shell breaking-inner">
          <span className="breaking-label"><i /> Último minuto</span>
          <p>{latest[0]?.title ?? lead.title}</p>
          <span className="breaking-time">{storyTime(latest[0]?.publishedAt ?? lead.publishedAt)}</span>
        </div>
      </section>

      <div className="page-shell" id="inicio">
        <section className="hero-grid" aria-labelledby="principal-title">
          <article className="lead-story">
            <div className="lead-image-wrap">
              <img className="lead-image" src={lead.image ?? '/og.png'} alt={lead.title} />
              <span className="photo-credit">Imagen de la noticia</span>
            </div>
            <div className="lead-copy">
              <div className="story-meta"><span>{lead.categoryLabel}</span><time dateTime={lead.publishedAt}>{storyTime(lead.publishedAt)}</time></div>
              <h1 id="principal-title">{lead.title}</h1>
              <p>{lead.summary}</p>
              <Link className="read-link" href={`/noticias/${lead.slug}`}>Leer noticia <b>→</b></Link>
            </div>
          </article>

          <aside className="latest-panel" aria-label="Noticias recientes">
            <div className="section-heading compact"><p>Lo más reciente</p><span /></div>
            <div className="latest-list">
              {latest.map((story, index) => (
                <article className="latest-item" key={story.title}>
                  <span className="story-index">0{index + 1}</span>
                  <div>
                    <div className="story-meta"><span>{story.categoryLabel}</span><time dateTime={story.publishedAt}>{storyTime(story.publishedAt)}</time></div>
                    <h2><Link href={`/noticias/${story.slug}`}>{story.title}</Link></h2>
                  </div>
                </article>
              ))}
            </div>
            <Link className="all-news" href="/ultimo-minuto">Ver todas las noticias <span>→</span></Link>
          </aside>
        </section>

        <section className="news-section" id="jalisco">
          <div className="section-heading">
            <div><span className="eyebrow">En la región</span><h2>Jalisco</h2></div>
            <Link href="/jalisco">Ver todas <span>→</span></Link>
          </div>
          <div className="card-grid">
            {jalisco.map((story, index) => (
              <article className="news-card" key={story.title}>
                <div className={`card-visual ${index % 2 === 0 ? 'sea' : 'sun'}`} aria-hidden="true">
                  <span>HV</span><i>{index === 0 ? 'Jalisco' : 'Bahía'}</i>
                </div>
                <div className="card-copy">
                  <div className="story-meta"><span>Jalisco</span><time>Hoy</time></div>
                  <h3><Link href={`/noticias/${story.slug}`}>{story.title}</Link></h3><p>{story.summary}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="national-banner" id="nacional">
          <div>
            <span className="eyebrow light">Lo que mueve al país</span>
            <h2>Nacional</h2>
            <p>Las historias más relevantes de México, explicadas de forma clara y directa.</p>
          </div>
          <Link href="/nacional">Explorar Nacional <span>→</span></Link>
        </section>
      </div>

      <footer className="site-footer">
        <div className="page-shell footer-inner">
          <Link className="brand footer-brand" href="/"><BrandMark /><span className="brand-name"><strong>HOLA</strong> Vallarta</span></Link>
          <p>Noticias de Puerto Vallarta, Bahía de Banderas y México.</p>
          <small>© 2026 Hola Vallarta</small>
        </div>
      </footer>
    </main>
  );
}
