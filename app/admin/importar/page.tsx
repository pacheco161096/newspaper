import Link from 'next/link';
import { requireAdmin } from '@/lib/cms/auth';
import { importFactsAction } from '../actions';
import { AdminShell } from '../components/admin-shell';

export const dynamic = 'force-dynamic';

export default async function ImportFactsPage() {
  await requireAdmin();
  return <AdminShell>
    <div className="admin-heading">
      <h1>Importar hechos</h1>
      <Link className="admin-button secondary" href="/admin">Volver</Link>
      <p>Para notas que no entran por el cron. Pega el titular y los hechos; no copies el artículo ni uses fotos ajenas. El sitio no mostrará de dónde salió el insumo.</p>
    </div>
    <form className="admin-form" action={importFactsAction}>
      <section className="admin-form-card">
        <h2>Hechos</h2>
        <div className="admin-grid two">
          <div className="admin-field full"><label htmlFor="title">Titular *</label><input id="title" name="title" required maxLength={180} /></div>
          <div className="admin-field"><label htmlFor="category">Categoría *</label><select id="category" name="category" defaultValue="jalisco"><option value="ultimo-minuto">Último minuto</option><option value="jalisco">Jalisco</option><option value="nacional">Nacional</option></select></div>
          <div className="admin-field"><label htmlFor="status">Al guardar</label><select id="status" name="status" defaultValue="unpublished"><option value="unpublished">No publicar (revisar)</option><option value="published">Publicar</option></select></div>
          <div className="admin-field full"><label htmlFor="summary">Resumen</label><textarea id="summary" name="summary" maxLength={320} /><small>Si lo dejas vacío se toma el inicio de los hechos.</small></div>
          <div className="admin-field full"><label htmlFor="facts">Hechos verificables *</label><textarea className="article-editor" id="facts" name="facts" required minLength={180} /><small>Solo datos: qué, quién, dónde, cuándo. Mínimo 180 caracteres. No inventes.</small></div>
          <div className="admin-field full"><label htmlFor="sourceUrl">URL de referencia (solo interna)</label><input id="sourceUrl" name="sourceUrl" type="url" placeholder="https://…" /><small>No se publica. No descargamos esa página.</small></div>
        </div>
      </section>
      <div className="admin-actions"><button className="admin-button" type="submit">Crear borrador</button></div>
    </form>
  </AdminShell>;
}
