export type CategorySlug = 'ultimo-minuto' | 'jalisco' | 'nacional';

export type Article = {
  slug: string;
  category: CategorySlug;
  categoryLabel: string;
  title: string;
  summary: string;
  publishedAt: string;
  updatedAt?: string;
  image?: string;
  imageAlt?: string;
  seoTitle?: string;
  seoDescription?: string;
  paragraphs: string[];
  authorName: string;
  authorSlug: string;
  authorRole: string;
};

export const articles: Article[] = [
  {
    slug: 'el-malecon-se-prepara-para-una-nueva-jornada', category: 'ultimo-minuto', categoryLabel: 'Puerto Vallarta',
    title: 'El Malecón se prepara para una nueva jornada de actividades',
    summary: 'Autoridades y comerciantes coordinan acciones para recibir a residentes y visitantes durante el fin de semana.',
    publishedAt: '2026-09-22T12:24:00-06:00', updatedAt: '2026-09-22T12:42:00-06:00',
    image: 'https://images.unsplash.com/photo-1689326232193-d55f0b7965eb?auto=format&fit=crop&q=84&w=1800',
    authorName: 'Emilio Vargas', authorSlug: 'emilio-vargas', authorRole: 'Reportero',
    paragraphs: [
      'El corredor del Malecón de Puerto Vallarta se prepara para recibir una nueva jornada de actividades culturales y comerciales durante el fin de semana.',
      'De acuerdo con la información preliminar, distintas áreas municipales coordinarán labores de movilidad, limpieza y atención preventiva en los puntos de mayor afluencia.',
      'Comerciantes de la zona señalaron que esperan una presencia constante de visitantes. Las autoridades recomendaron atender los avisos oficiales y anticipar los traslados hacia el centro.',
    ],
  },
  {
    slug: 'ajustes-viales-en-el-centro', category: 'ultimo-minuto', categoryLabel: 'Último minuto',
    title: 'Anuncian ajustes viales en el centro de Vallarta', summary: 'Los cambios serán temporales y se aplicarán en las calles con mayor afluencia.',
    publishedAt: '2026-09-22T12:35:00-06:00', authorName: 'Emilio Vargas', authorSlug: 'emilio-vargas', authorRole: 'Reportero', paragraphs: ['La autoridad municipal informó que habrá ajustes temporales a la circulación en el primer cuadro de la ciudad.'],
  },
  {
    slug: 'inversion-movilidad-regional', category: 'jalisco', categoryLabel: 'Jalisco',
    title: 'Jalisco anuncia inversión para mejorar la movilidad regional', summary: 'El plan incluye obras y mantenimiento en puntos prioritarios.',
    publishedAt: '2026-09-22T10:10:00-06:00', authorName: 'Emilio Vargas', authorSlug: 'emilio-vargas', authorRole: 'Reportero', paragraphs: ['El programa considera intervenciones escalonadas y coordinación con los municipios participantes.'],
  },
  {
    slug: 'medidas-para-viajeros-en-aeropuertos', category: 'nacional', categoryLabel: 'Nacional',
    title: 'Presentan nuevas medidas para viajeros en aeropuertos', summary: 'Las autoridades dieron a conocer recomendaciones para agilizar los traslados.',
    publishedAt: '2026-09-22T09:40:00-06:00', authorName: 'Emilio Vargas', authorSlug: 'emilio-vargas', authorRole: 'Reportero', paragraphs: ['Las disposiciones buscan mejorar la orientación y reducir tiempos durante los periodos de mayor demanda.'],
  },
];

export const categoryNames: Record<CategorySlug, string> = {
  'ultimo-minuto': 'Último minuto', jalisco: 'Jalisco', nacional: 'Nacional',
};
