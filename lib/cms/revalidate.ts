import { revalidatePath } from 'next/cache';

export function revalidateArticle(slug: string, category: string) {
  revalidatePath('/');
  revalidatePath('/sitemap.xml');
  revalidatePath(`/noticias/${slug}`);
  revalidatePath(`/${category}`);
}
