import type { CmsAuthor } from '@/lib/cms/types';

export function AuthorForm({ author, action }: { author?: CmsAuthor; action: (formData: FormData) => void | Promise<void> }) {
  return <form className="admin-form" action={action}>
    <section className="admin-form-card"><h2>Perfil</h2><div className="admin-grid two">
      <div className="admin-field"><label htmlFor="name">Nombre *</label><input id="name" name="name" defaultValue={author?.name} required maxLength={80} /></div>
      <div className="admin-field"><label htmlFor="slug">Slug *</label><input id="slug" name="slug" defaultValue={author?.slug} required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="emilio-vargas" /></div>
      <div className="admin-field"><label htmlFor="role">Rol</label><input id="role" name="role" defaultValue={author?.role ?? 'Reportero'} maxLength={40} /></div>
      <div className="admin-field full"><label htmlFor="bio">Biografía</label><textarea id="bio" name="bio" defaultValue={author?.bio} maxLength={400} /></div>
      <div className="admin-field full"><label><input type="checkbox" name="isDefault" defaultChecked={author?.isDefault} /> Usar como autor predeterminado de las notas automáticas</label></div>
    </div></section>
    <div className="admin-actions"><button className="admin-button" type="submit">Guardar autor</button></div>
  </form>;
}
