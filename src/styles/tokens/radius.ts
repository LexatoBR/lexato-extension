/**
 * Design Tokens - Border Radius do Design System Lexato
 *
 * Escala de arredondamento para consistência visual
 * em botões, cards, inputs e outros elementos.
 *
 * @see Requirements 1.6
 */

/**
 * Escala de border-radius
 *
 * Uso recomendado:
 * - sm (6px): Badges, chips, elementos pequenos
 * - md (8px): Botões, inputs
 * - lg (12px): Cards pequenos, tooltips
 * - xl (16px): Cards grandes, modais
 * - 2xl (24px): Containers especiais, painéis
 * - full (9999px): Avatares, badges circulares, pills
 */
export const radius = {
  /** 6px - Badges, chips */
  sm: '6px',
  /** 8px - Botões, inputs */
  md: '8px',
  /** 12px - Cards pequenos */
  lg: '12px',
  /** 16px - Cards grandes, modais */
  xl: '16px',
  /** 24px - Containers especiais */
  '2xl': '24px',
  /** 9999px - Elementos circulares */
  full: '9999px',
} as const;

/**
 * Valores numéricos de border-radius (sem unidade)
 * Útil para cálculos e uso em JavaScript
 */
export const radiusValues = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  full: 9999,
} as const;

/** Tipo inferido do border-radius */
export type Radius = typeof radius;

/** Chaves válidas de border-radius */
export type RadiusKey = keyof typeof radius;

/** Valores numéricos de border-radius */
export type RadiusValue = (typeof radiusValues)[RadiusKey];
