import Link from 'next/link';
import { requireAdmin } from '@/lib/cms/auth';
import { listCmsAuthors } from '@/lib/cms/repository';
import { AdminShell } from '../components/admin-shell';

export const dynamic = 'force-dynamic';

export default async function AuthorsPage() {
  await requireAdmin();
  const authors = await listCmsAuthors();
  return <AdminShell>
    <div className="admin-heading"><h1>Autores</h1><Link className="admin-button" href="/admin/autores/nuevo">Nuevo autor</Link><p>Firmas públicas de las notas. El predeterminado se asigna a la redacción automática.</p></div>
    <div className="admin-table-wrap">{authors.length ? <table className="admin-table"><thead><tr><th>Nombre</th><th>Rol</th><th>Predeterminado</th><th></th></tr></thead><tbody>
      {authors.map((author) => <tr key={author.id}><td><span className="admin-table-title">{author.name}</span><span className="admin-table-meta">/autores/{author.slug}</span></td><td>{author.role}</td><td>{author.isDefault ? 'Sí' : '—'}</td><td><Link className="admin-button secondary" href={`/admin/autores/${author.id}`}>Editar</Link></td></tr>)}
    </tbody></table> : <div className="admin-empty">Todavía no hay autores.</div>}</div>
  </AdminShell>;
}
