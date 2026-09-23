import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/cms/auth';
import { listCmsAuthors } from '@/lib/cms/repository';
import { updateAuthorAction } from '../../actions';
import { AdminShell } from '../../components/admin-shell';
import { AuthorForm } from '../../components/author-form';

export const dynamic = 'force-dynamic';

export default async function EditAuthorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const author = (await listCmsAuthors()).find((item) => item.id === id);
  if (!author) notFound();
  const update = updateAuthorAction.bind(null, id);
  return <AdminShell><div className="admin-heading"><h1>Editar autor</h1><Link className="admin-button secondary" href="/admin/autores">Volver</Link><p>/autores/{author.slug}</p></div><AuthorForm author={author} action={update} /></AdminShell>;
}
