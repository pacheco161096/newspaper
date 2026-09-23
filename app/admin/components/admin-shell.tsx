import Link from 'next/link';
import { logoutAction } from '../actions';

export function AdminShell({ children }: { children: React.ReactNode }) {
  return <div className="admin-body"><header className="admin-topbar">
    <Link className="admin-brand" href="/admin"><i>HV</i> Hola Vallarta CMS</Link>
    <nav className="admin-nav"><Link href="/admin">Noticias</Link><Link href="/admin/autores">Autores</Link><Link href="/" target="_blank">Ver sitio</Link><form action={logoutAction}><button className="admin-link-button">Cerrar sesión</button></form></nav>
  </header><main className="admin-main">{children}</main></div>;
}
