import Link from 'next/link';
import { requireAdmin } from '@/lib/cms/auth';
import { getPipelineQueueSnapshot } from '@/lib/pipeline/repository';
import { AdminShell } from '../components/admin-shell';

export const dynamic = 'force-dynamic';

const PIPELINE_LABEL: Record<string, string> = {
  discovered: 'Por clasificar',
  processing: 'En proceso',
  classified: 'Por resolver',
  rejected: 'Descartada',
  resolved: 'Resuelta',
  failed: 'Fallida',
};

const EDITORIAL_LABEL: Record<string, string> = {
  pending: 'Por redactar',
  processing: 'Redactando',
  drafted: 'Borrador CMS',
  published: 'Publicada',
  failed: 'Redacción fallida',
  skipped: 'Omitida',
};

function pillClass(status: string) {
  if (status === 'failed' || status === 'rejected') return 'status-pill bad';
  if (status === 'processing' || status === 'discovered' || status === 'classified' || status === 'pending') return 'status-pill warn';
  return 'status-pill';
}

export default async function PipelineQueuePage() {
  await requireAdmin();
  const snapshot = await getPipelineQueueSnapshot();
  return <AdminShell>
    <div className="admin-heading">
      <h1>Cola del pipeline</h1>
      <Link className="admin-button secondary" href="/admin">Volver</Link>
      <p>Documentos de fuente. Los duplicados se resuelven y no se vuelven a redactar.</p>
    </div>
    <div className="admin-spend">
      {snapshot.counts.length ? snapshot.counts.map((item) => (
        <div className="admin-spend-card" key={`${item.pipelineStatus}-${item.editorialStatus ?? ''}`}>
          <span>{PIPELINE_LABEL[item.pipelineStatus] ?? item.pipelineStatus}</span>
          <strong>{item.count}</strong>
          <small>{item.editorialStatus ? (EDITORIAL_LABEL[item.editorialStatus] ?? item.editorialStatus) : 'sin redacción'}</small>
        </div>
      )) : <div className="admin-empty">Todavía no hay documentos en cola.</div>}
    </div>
    <div className="admin-table-wrap">{snapshot.documents.length ? <table className="admin-table"><thead><tr><th>Titular de origen</th><th>Fuente</th><th>Cola</th><th>Redacción</th><th>Fecha</th></tr></thead><tbody>
      {snapshot.documents.map((document) => (
        <tr key={document.id}>
          <td><span className="admin-table-title">{document.rawTitle || 'Sin titular'}</span>{document.lastError && <span className="admin-table-meta">{document.lastError}</span>}{document.resolutionKind && <span className="admin-table-meta">{document.resolutionKind}</span>}</td>
          <td>{document.sourceKey}</td>
          <td><span className={pillClass(document.pipelineStatus)}>{PIPELINE_LABEL[document.pipelineStatus] ?? document.pipelineStatus}</span></td>
          <td><span className={pillClass(document.editorialStatus ?? '')}>{document.editorialStatus ? (EDITORIAL_LABEL[document.editorialStatus] ?? document.editorialStatus) : '—'}</span></td>
          <td>{document.sourcePublishedAt ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }).format(new Date(document.sourcePublishedAt)) : '—'}</td>
        </tr>
      ))}
    </tbody></table> : <div className="admin-empty">No hay documentos recientes.</div>}</div>
  </AdminShell>;
}
