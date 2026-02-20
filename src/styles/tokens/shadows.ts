/**
 * Design Tokens - Sombras e Glows do Design System Lexato
 *
 * Sistema de sombras para elevação visual e efeitos
 * de glow com a cor primária Lexato.
 *
 * @see Requirements 1.7
 */

/**
 * Sombras e efeitos de glow
 *
 * Uso recomendado:
 * - sm: Elevação sutil (botões, badges)
 * - md: Elevação média (cards, dropdowns)
 * - lg: Elevação alta (modais, popovers)
 * - glow: Destaque padrão com cor primária
 * - glowSm: Destaque sutil
 * - glowLg: Destaque intenso
 * - glass: Sombra para efeito glassmorphism
 */
export const shadows = {
  /** Sombra pequena - Elevação sutil */
  sm: '0 4px 12px rgba(0, 0, 0, 0.25)',
  /** Sombra média - Elevação padrão */
  md: '0 8px 24px rgba(0, 0, 0, 0.4)',
  /** Sombra grande - Elevação alta */
  lg: '0 16px 48px rgba(0, 0, 0, 0.5)',
  /** Glow padrão - Destaque verde Lexato */
  glow: '0 0 20px rgba(0, 222, 165, 0.4)',
  /** Glow pequeno - Destaque sutil */
  glowSm: '0 0 12px rgba(0, 222, 165, 0.3)',
  /** Glow grande - Destaque intenso */
  glowLg: '0 0 30px rgba(0, 222, 165, 0.5)',
  /** Sombra glass - Para efeito glassmorphism */
  glass: '0 4px 30px rgba(0, 0, 0, 0.1)',
} as const;

/**
 * Sombras compostas para estados específicos
 *
 * Combinações de sombras para casos de uso comuns
 */
export const compositeShadows = {
  /** Card em hover - Elevação + glow sutil */
  cardHover: `${shadows.sm}, ${shadows.glowSm}`,
  /** Card selecionado - Glow + borda interna */
  cardSelected: `${shadows.glow}, inset 0 0 0 1px rgba(0, 222, 165, 0.3)`,
  /** Botão primário em hover */
  buttonPrimaryHover: '0 6px 20px rgba(0, 222, 165, 0.4)',
  /** Input em focus */
  inputFocus: '0 0 25px rgba(0, 222, 165, 0.1)',
  /** Erro - Glow vermelho */
  error: '0 0 15px rgba(239, 83, 80, 0.1)',
} as const;

/** Tipo inferido das sombras */
export type Shadows = typeof shadows;

/** Chaves válidas de sombras */
export type ShadowKey = keyof typeof shadows;

/** Tipo inferido das sombras compostas */
export type CompositeShadows = typeof compositeShadows;

/** Chaves válidas de sombras compostas */
export type CompositeShadowKey = keyof typeof compositeShadows;
