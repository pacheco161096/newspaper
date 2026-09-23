import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/cms/auth';
import { loginAction } from '../actions';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getAdminSession()) redirect('/admin');
  const { error } = await searchParams;
  return <main className="login-shell"><section className="login-card">
    <span className="brand-mark"><span>H</span><span>V</span></span>
    <h1>Hola Vallarta</h1><p>Acceso al panel editorial</p>
    <form action={loginAction}>
      <div className="admin-field"><label htmlFor="email">Correo</label><input id="email" name="email" type="email" autoComplete="username" required /></div>
      <div className="admin-field"><label htmlFor="password">Contraseña</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
      {error && <p className="login-error">Correo o contraseña incorrectos.</p>}
      <button className="admin-button" type="submit">Entrar al CMS</button>
    </form>
  </section></main>;
}
