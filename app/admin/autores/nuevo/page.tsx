import Link from 'next/link';
import { requireAdmin } from '@/lib/cms/auth';
import { createAuthorAction } from '../../actions';
import { AdminShell } from '../../components/admin-shell';
import { AuthorForm } from '../../components/author-form';

export const dynamic = 'force-dynamic';

export default async function NewAuthorPage() {
  await requireAdmin();
  return <AdminShell><div className="admin-heading"><h1>Nuevo autor</h1><Link className="admin-button secondary" href="/admin/autores">Volver</Link><p>La firma aparece en el byline de cada nota.</p></div><AuthorForm action={createAuthorAction} /></AdminShell>;
}
