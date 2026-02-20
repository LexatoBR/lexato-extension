/**
 * Design Tokens - Espaçamento do Design System Lexato
 *
 * Escala de espaçamento baseada em múltiplos de 4px.
 * Garante consistência visual e alinhamento em toda a extensão.
 *
 * @see Requirements 1.5
 */

/**
 * Escala de espaçamento em múltiplos de 4px
 *
 * Uso recomendado:
 * - 0: Reset de margens/paddings
 * - 1 (4px): Espaçamento mínimo entre elementos inline
 * - 2 (8px): Espaçamento padrão entre elementos pequenos
 * - 3 (12px): Espaçamento entre elementos de formulário
 * - 4 (16px): Espaçamento padrão de containers
 * - 5 (20px): Espaçamento entre seções pequenas
 * - 6 (24px): Espaçamento entre seções médias
 * - 8 (32px): Espaçamento entre seções grandes
 * - 10 (40px): Espaçamento entre blocos principais
 * - 12 (48px): Espaçamento máximo entre seções
 */
export const spacing = {
  /** 0px - Reset */
  0: '0px',
  /** 4px - Espaçamento mínimo */
  1: '4px',
  /** 8px - Espaçamento pequeno */
  2: '8px',
  /** 12px - Espaçamento médio-pequeno */
  3: '12px',
  /** 16px - Espaçamento padrão */
  4: '16px',
  /** 20px - Espaçamento médio */
  5: '20px',
  /** 24px - Espaçamento médio-grande */
  6: '24px',
  /** 32px - Espaçamento grande */
  8: '32px',
  /** 40px - Espaçamento extra-grande */
  10: '40px',
  /** 48px - Espaçamento máximo */
  12: '48px',
} as const;

/**
 * Valores numéricos de espaçamento (sem unidade)
 * Útil para cálculos e uso em JavaScript
 */
export const spacingValues = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

/** Tipo inferido do espaçamento */
export type Spacing = typeof spacing;

/** Chaves válidas de espaçamento */
export type SpacingKey = keyof typeof spacing;

/** Valores numéricos de espaçamento */
export type SpacingValue = (typeof spacingValues)[SpacingKey];
