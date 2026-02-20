/**
 * Design Tokens - Transições do Design System Lexato
 *
 * Durações e easings para animações e transições
 * consistentes em toda a extensão.
 *
 * @see Requirements 1.8
 */

/**
 * Durações de transição
 *
 * Uso recomendado:
 * - fast (150ms): Hover, focus, micro-interações
 * - base (200ms): Transições padrão
 * - slow (300ms): Animações de entrada/saída
 * - smooth (400ms): Transições complexas, morphing
 */
export const transitions = {
  /** 150ms - Micro-interações rápidas */
  fast: '150ms ease',
  /** 200ms - Transições padrão */
  base: '200ms ease',
  /** 300ms - Animações de entrada/saída */
  slow: '300ms ease',
  /** 400ms - Transições suaves e complexas */
  smooth: '400ms cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

/**
 * Durações em milissegundos (valores numéricos)
 * Útil para uso em JavaScript/TypeScript
 */
export const durations = {
  /** 150ms */
  fast: 150,
  /** 200ms */
  base: 200,
  /** 300ms */
  slow: 300,
  /** 400ms */
  smooth: 400,
} as const;

/**
 * Funções de easing
 *
 * Curvas de aceleração para diferentes tipos de animação
 */
export const easings = {
  /** Easing padrão - Suave */
  ease: 'ease',
  /** Easing linear - Constante */
  linear: 'linear',
  /** Easing in - Acelera no início */
  easeIn: 'ease-in',
  /** Easing out - Desacelera no final */
  easeOut: 'ease-out',
  /** Easing in-out - Acelera e desacelera */
  easeInOut: 'ease-in-out',
  /** Easing suave - Material Design */
  smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
  /** Easing de entrada - Material Design */
  enter: 'cubic-bezier(0, 0, 0.2, 1)',
  /** Easing de saída - Material Design */
  exit: 'cubic-bezier(0.4, 0, 1, 1)',
} as const;

/**
 * Transições pré-configuradas para propriedades comuns
 */
export const transitionPresets = {
  /** Transição de todas as propriedades */
  all: `all ${transitions.base}`,
  /** Transição de cor */
  colors: `color ${transitions.fast}, background-color ${transitions.fast}, border-color ${transitions.fast}`,
  /** Transição de opacidade */
  opacity: `opacity ${transitions.fast}`,
  /** Transição de transform */
  transform: `transform ${transitions.base}`,
  /** Transição de sombra */
  shadow: `box-shadow ${transitions.base}`,
} as const;

/** Tipo inferido das transições */
export type Transitions = typeof transitions;

/** Chaves válidas de transições */
export type TransitionKey = keyof typeof transitions;

/** Tipo inferido das durações */
export type Durations = typeof durations;

/** Chaves válidas de durações */
export type DurationKey = keyof typeof durations;

/** Tipo inferido dos easings */
export type Easings = typeof easings;

/** Chaves válidas de easings */
export type EasingKey = keyof typeof easings;
