import type { Schema, Struct } from '@strapi/strapi';

export interface EditorialFacebookPublication extends Struct.ComponentSchema {
  collectionName: 'components_editorial_facebook_publications';
  info: {
    displayName: 'Publicaci\u00F3n de Facebook';
  };
  attributes: {
    firstComment: Schema.Attribute.Text;
    message: Schema.Attribute.Text & Schema.Attribute.Required;
    sentAt: Schema.Attribute.DateTime;
    status: Schema.Attribute.Enumeration<['pending', 'sent', 'failed']> &
      Schema.Attribute.Required &
      Schema.Attribute.DefaultTo<'pending'>;
    zernioPostId: Schema.Attribute.String;
  };
}

export interface EditorialSourceReference extends Struct.ComponentSchema {
  collectionName: 'components_editorial_source_references';
  info: {
    description: 'Trazabilidad interna; no contiene atribuci\u00F3n de autor\u00EDa de Hola Vallarta';
    displayName: 'Referencia de fuente';
  };
  attributes: {
    documentFingerprint: Schema.Attribute.String & Schema.Attribute.Required;
    factsUsed: Schema.Attribute.Text;
    sourceName: Schema.Attribute.String & Schema.Attribute.Required;
    sourcePublishedAt: Schema.Attribute.DateTime;
    sourceUrl: Schema.Attribute.String & Schema.Attribute.Required;
  };
}

export interface SharedSeo extends Struct.ComponentSchema {
  collectionName: 'components_shared_seos';
  info: {
    description: 'Metadatos de b\u00FAsqueda y redes';
    displayName: 'SEO';
  };
  attributes: {
    canonicalPath: Schema.Attribute.String & Schema.Attribute.Required;
    keywords: Schema.Attribute.JSON;
    metaDescription: Schema.Attribute.Text &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 170;
      }>;
    metaTitle: Schema.Attribute.String &
      Schema.Attribute.Required &
      Schema.Attribute.SetMinMaxLength<{
        maxLength: 70;
      }>;
    noIndex: Schema.Attribute.Boolean & Schema.Attribute.DefaultTo<false>;
  };
}

declare module '@strapi/strapi' {
  export namespace Public {
    export interface ComponentSchemas {
      'editorial.facebook-publication': EditorialFacebookPublication;
      'editorial.source-reference': EditorialSourceReference;
      'shared.seo': SharedSeo;
    }
  }
}
