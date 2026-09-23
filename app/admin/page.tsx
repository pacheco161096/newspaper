import Link from 'next/link';
import { requireAdmin } from '@/lib/cms/auth';
import { listCmsArticles } from '@/lib/cms/repository';
import { getOpenAiSpendSummary } from '@/lib/pipeline/openai';
import { AdminShell } from './components/admin-shell';

export const dynamic = 'force-dynamic';

function money(value: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(value);
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const query = (await searchParams).q?.trim().toLowerCase() ?? '';
  const [articles, spend] = await Promise.all([listCmsArticles(), getOpenAiSpendSummary().catch(() => null)]);
  const visible = articles.filter((article) => !query || article.title.toLowerCase().includes(query) || article.slug.includes(query));
  return <AdminShell><div className="admin-heading"><h1>Noticias</h1><Link className="admin-button" href="/admin/noticias/nueva">Nueva noticia</Link><p>Publica, edita o retira contenido del sitio.</p></div>
    {spend && <div className="admin-spend">
      <div className="admin-spend-card"><span>OpenAI hoy</span><strong>{money(spend.todayUsd)}</strong><small>{spend.todayCalls} llamadas</small></div>
      <div className="admin-spend-card"><span>Este mes</span><strong>{money(spend.monthUsd)}</strong><small>{spend.monthCalls} llamadas</small></div>
      <div className="admin-spend-card"><span>Acumulado</span><strong>{money(spend.totalUsd)}</strong><small>Clasificar {money(spend.classifyUsd)}</small></div>
      <div className="admin-spend-card"><span>Redacción</span><strong>{money(spend.editorialUsd)}</strong><small>Estimado según tarifas del modelo</small></div>
    </div>}
    <form className="admin-toolbar"><input name="q" defaultValue={query} placeholder="Buscar por titular o slug…" /><button className="admin-button secondary">Buscar</button></form>
    <div className="admin-table-wrap">{visible.length ? <table className="admin-table"><thead><tr><th>Noticia</th><th>Autor</th><th>Categoría</th><th>Estado</th><th>Actualización</th><th></th></tr></thead><tbody>
      {visible.map((article) => <tr key={article.id}><td><span className="admin-table-title">{article.title}</span><span className="admin-table-meta">/noticias/{article.slug}</span></td><td>{article.authorName}</td><td>{article.category}</td><td><span className={`status-pill ${article.status === 'published' ? '' : 'off'}`}>{article.status === 'published' ? 'Publicada' : 'No publicada'}</span></td><td>{new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(article.updatedAt))}</td><td><Link className="admin-button secondary" href={`/admin/noticias/${article.id}`}>Editar</Link></td></tr>)}
    </tbody></table> : <div className="admin-empty">Todavía no hay noticias. Crea la primera desde el botón superior.</div>}</div>
  </AdminShell>;
}
