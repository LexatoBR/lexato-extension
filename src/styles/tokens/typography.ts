/**
 * Design Tokens - Tipografia do Design System Lexato
 *
 * Sistema tipográfico com Inter como fonte principal e
 * JetBrains Mono para código/hashes.
 *
 * @see Requirements 2.1, 2.2, 2.3, 2.4, 2.5
 */

/**
 * Famílias de fontes
 *
 * - sans: Inter para textos gerais
 * - mono: JetBrains Mono para código e hashes
 */
export const fonts = {
  /** Fonte principal para textos */
  sans: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  /** Fonte monospace para código e hashes */
  mono: "'JetBrains Mono', 'Fira Code', monospace",
} as const;

/**
 * Escala de tamanhos de fonte
 *
 * Escala de 11px a 20px para hierarquia visual clara
 */
export const fontSizes = {
  /** 11px - Micro: versão, badges pequenos */
  xs: '11px',
  /** 12px - Caption: labels pequenos */
  sm: '12px',
  /** 13px - Body small: texto secundário */
  base: '13px',
  /** 14px - Body: texto principal */
  md: '14px',
  /** 16px - H3: subtítulos */
  lg: '16px',
  /** 18px - H2: títulos de seção */
  xl: '18px',
  /** 20px - H1: títulos principais */
  '2xl': '20px',
} as const;

/**
 * Valores numéricos de tamanhos de fonte (sem unidade)
 */
export const fontSizeValues = {
  xs: 11,
  sm: 12,
  base: 13,
  md: 14,
  lg: 16,
  xl: 18,
  '2xl': 20,
} as const;

/**
 * Pesos de fonte
 *
 * - normal: Texto corrido
 * - medium: Ênfase leve
 * - semibold: Subtítulos, labels
 * - bold: Títulos, CTAs
 */
export const fontWeights = {
  /** 400 - Texto normal */
  normal: '400',
  /** 500 - Ênfase média */
  medium: '500',
  /** 600 - Subtítulos, labels */
  semibold: '600',
  /** 700 - Títulos, CTAs */
  bold: '700',
} as const;

/**
 * Alturas de linha
 *
 * Valores otimizados para legibilidade em cada contexto
 */
export const lineHeights = {
  /** 1.2 - Títulos grandes */
  tight: '1.2',
  /** 1.3 - Subtítulos */
  snug: '1.3',
  /** 1.4 - Labels, captions */
  normal: '1.4',
  /** 1.5 - Texto corrido */
  relaxed: '1.5',
} as const;

/**
 * Presets tipográficos combinando tamanho, peso e line-height
 *
 * Uso: `typography.h1` retorna objeto com todas as propriedades
 */
export const typography = {
  /** H1 - Títulos principais (20px, bold, 1.2) */
  h1: {
    fontSize: fontSizes['2xl'],
    fontWeight: fontWeights.bold,
    lineHeight: lineHeights.tight,
  },
  /** H2 - Títulos de seção (18px, semibold, 1.3) */
  h2: {
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.snug,
  },
  /** H3 - Subtítulos (16px, semibold, 1.4) */
  h3: {
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.semibold,
    lineHeight: lineHeights.normal,
  },
  /** Body - Texto principal (14px, normal, 1.5) */
  body: {
    fontSize: fontSizes.md,
    fontWeight: fontWeights.normal,
    lineHeight: lineHeights.relaxed,
  },
  /** Body Small - Texto secundário (13px, normal, 1.5) */
  bodySmall: {
    fontSize: fontSizes.base,
    fontWeight: fontWeights.normal,
    lineHeight: lineHeights.relaxed,
  },
  /** Caption - Labels, hints (12px, medium, 1.4) */
  caption: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    lineHeight: lineHeights.normal,
  },
  /** Micro - Versão, badges (11px, medium, 1.3) */
  micro: {
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
    lineHeight: lineHeights.snug,
  },
} as const;

/** Tipo inferido das fontes */
export type Fonts = typeof fonts;

/** Tipo inferido dos tamanhos de fonte */
export type FontSizes = typeof fontSizes;

/** Chaves válidas de tamanho de fonte */
export type FontSizeKey = keyof typeof fontSizes;

/** Tipo inferido dos pesos de fonte */
export type FontWeights = typeof fontWeights;

/** Chaves válidas de peso de fonte */
export type FontWeightKey = keyof typeof fontWeights;

/** Tipo inferido das alturas de linha */
export type LineHeights = typeof lineHeights;

/** Chaves válidas de altura de linha */
export type LineHeightKey = keyof typeof lineHeights;

/** Tipo inferido dos presets tipográficos */
export type Typography = typeof typography;

/** Chaves válidas de presets tipográficos */
export type TypographyKey = keyof typeof typography;
