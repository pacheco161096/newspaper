'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminSession, destroyAdminSession, requireAdmin, validateAdminCredentials } from '@/lib/cms/auth';
import { createCmsArticle, createCmsAuthor, setCmsArticleStatus, updateCmsArticle, updateCmsAuthor } from '@/lib/cms/repository';
import type { ArticleInput, ArticleStatus } from '@/lib/cms/types';
import type { CategorySlug } from '@/lib/content';
import { facebookInvite, stripOutletMentions, uniqueSlug } from '@/lib/pipeline/editorial';

function value(formData: FormData, name: string) { return String(formData.get(name) ?? '').trim(); }

function articleInput(formData: FormData): ArticleInput {
  const category = value(formData, 'category') as CategorySlug;
  const status = value(formData, 'status') as ArticleStatus;
  if (!['ultimo-minuto', 'jalisco', 'nacional'].includes(category)) throw new Error('Categoría inválida');
  if (!['published', 'unpublished'].includes(status)) throw new Error('Estado inválido');
  const input = {
    slug: value(formData, 'slug').toLowerCase(), category, title: value(formData, 'title'),
    summary: value(formData, 'summary'), bodyText: value(formData, 'bodyText'),
    heroImageUrl: value(formData, 'heroImageUrl'), imageAlt: value(formData, 'imageAlt'),
    seoTitle: value(formData, 'seoTitle'), seoDescription: value(formData, 'seoDescription'),
    facebookExcerpt: facebookInvite(value(formData, 'facebookExcerpt'), value(formData, 'summary')), sourceName: value(formData, 'sourceName'),
    sourceUrl: value(formData, 'sourceUrl'), authorId: value(formData, 'authorId') || undefined, status,
  };
  if (!input.title || !input.slug || !input.summary || !input.bodyText) throw new Error('Faltan campos obligatorios');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug)) throw new Error('El slug solo admite minúsculas, números y guiones');
  return input;
}

export async function loginAction(formData: FormData) {
  const email = value(formData, 'email'); const password = value(formData, 'password');
  if (!validateAdminCredentials(email, password)) redirect('/admin/login?error=1');
  await createAdminSession(email);
  redirect('/admin');
}

export async function logoutAction() { await destroyAdminSession(); redirect('/admin/login'); }

export async function importFactsAction(formData: FormData) {
  await requireAdmin();
  const title = stripOutletMentions(value(formData, 'title'));
  const facts = stripOutletMentions(value(formData, 'facts'));
  const summaryInput = stripOutletMentions(value(formData, 'summary'));
  const category = value(formData, 'category') as CategorySlug;
  const status = value(formData, 'status') as ArticleStatus;
  if (!title || facts.length < 180) throw new Error('Hace falta titular y al menos 180 caracteres de hechos');
  if (!['ultimo-minuto', 'jalisco', 'nacional'].includes(category)) throw new Error('Categoría inválida');
  if (!['published', 'unpublished'].includes(status)) throw new Error('Estado inválido');
  const summary = summaryInput || facts.slice(0, 280);
  const slug = await uniqueSlug(title);
  const facebookExcerpt = facebookInvite(undefined, summary);
  const id = await createCmsArticle({
    slug, category, title, summary, bodyText: facts,
    facebookExcerpt, sourceName: 'Captura manual', sourceUrl: value(formData, 'sourceUrl') || undefined,
    status,
  });
  revalidatePath('/'); revalidatePath('/sitemap.xml');
  redirect(`/admin/noticias/${id}?saved=1`);
}

export async function createArticleAction(formData: FormData) {
  await requireAdmin();
  const id = await createCmsArticle(articleInput(formData));
  revalidatePath('/'); revalidatePath('/sitemap.xml');
  redirect(`/admin/noticias/${id}?saved=1`);
}

export async function updateArticleAction(id: string, formData: FormData) {
  await requireAdmin();
  await updateCmsArticle(id, articleInput(formData));
  revalidatePath('/'); revalidatePath('/sitemap.xml');
  revalidatePath(`/noticias/${value(formData, 'slug')}`);
  redirect(`/admin/noticias/${id}?saved=1`);
}

export async function changeArticleStatusAction(id: string, status: ArticleStatus) {
  await requireAdmin();
  await setCmsArticleStatus(id, status);
  revalidatePath('/'); revalidatePath('/sitemap.xml');
  redirect(`/admin/noticias/${id}?saved=1`);
}

function authorInput(formData: FormData) {
  const name = value(formData, 'name');
  const slug = value(formData, 'slug').toLowerCase();
  const role = value(formData, 'role') || 'Reportero';
  const bio = value(formData, 'bio');
  const isDefault = formData.get('isDefault') === 'on';
  if (!name || !slug) throw new Error('Faltan nombre o slug');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('El slug solo admite minúsculas, números y guiones');
  return { name, slug, role, bio, isDefault };
}

export async function createAuthorAction(formData: FormData) {
  await requireAdmin();
  await createCmsAuthor(authorInput(formData));
  redirect('/admin/autores');
}

export async function updateAuthorAction(id: string, formData: FormData) {
  await requireAdmin();
  await updateCmsAuthor(id, authorInput(formData));
  redirect('/admin/autores');
}
