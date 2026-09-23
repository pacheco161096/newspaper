import type { Core } from '@strapi/strapi';

export default {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    const defaults = [
      { name: 'Último minuto', slug: 'ultimo-minuto', description: 'Las noticias más recientes de Hola Vallarta.', navigationOrder: 1 },
      { name: 'Jalisco', slug: 'jalisco', description: 'Información de Puerto Vallarta, Bahía de Banderas y Jalisco.', navigationOrder: 2 },
      { name: 'Nacional', slug: 'nacional', description: 'Los acontecimientos más relevantes de México.', navigationOrder: 3 },
    ];

    for (const category of defaults) {
      const existing = await strapi.documents('api::category.category').findFirst({ filters: { slug: category.slug } });
      if (!existing) await strapi.documents('api::category.category').create({ data: { ...category, color: '#F22F50' } });
    }
  },
};
