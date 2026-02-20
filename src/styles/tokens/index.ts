/**
 * Design Tokens - Exportação Central do Design System Lexato
 *
 * Ponto de entrada único para todos os tokens do Design System.
 * Importar deste arquivo para garantir consistência.
 *
 * @example
 * ```typescript
 * import { colors, spacing, typography } from '@/styles/tokens';
 *
 * const style = {
 *   color: colors.primary.DEFAULT,
 *   padding: spacing[4],
 *   fontSize: typography.body.fontSize,
 * };
 * ```
 *
 * @see Requirements 1.1-1.8
 */

// Cores
export { colors } from './colors';
export type {
  Colors,
  PrimaryColors,
  BackgroundColors,
  TextColors,
  StatusColors,
  GlassColors,
} from './colors';

// Espaçamento
export { spacing, spacingValues } from './spacing';
export type { Spacing, SpacingKey, SpacingValue } from './spacing';

// Tipografia
export {
  fonts,
  fontSizes,
  fontSizeValues,
  fontWeights,
  lineHeights,
  typography,
} from './typography';
export type {
  Fonts,
  FontSizes,
  FontSizeKey,
  FontWeights,
  FontWeightKey,
  LineHeights,
  LineHeightKey,
  Typography,
  TypographyKey,
} from './typography';

// Border Radius
export { radius, radiusValues } from './radius';
export type { Radius, RadiusKey, RadiusValue } from './radius';

// Sombras
export { shadows, compositeShadows } from './shadows';
export type {
  Shadows,
  ShadowKey,
  CompositeShadows,
  CompositeShadowKey,
} from './shadows';

// Transições
export {
  transitions,
  durations,
  easings,
  transitionPresets,
} from './transitions';
export type {
  Transitions,
  TransitionKey,
  Durations,
  DurationKey,
  Easings,
  EasingKey,
} from './transitions';

/**
 * Objeto consolidado com todos os tokens
 *
 * Útil para passar todos os tokens de uma vez
 * ou para integração com bibliotecas de estilo
 */
import { colors } from './colors';
import { spacing } from './spacing';
import { fonts, fontSizes, fontWeights, lineHeights } from './typography';
import { radius } from './radius';
import { shadows } from './shadows';
import { transitions } from './transitions';

export const tokens = {
  colors,
  spacing,
  fonts,
  fontSizes,
  fontWeights,
  lineHeights,
  radius,
  shadows,
  transitions,
} as const;

/** Tipo do objeto consolidado de tokens */
export type Tokens = typeof tokens;
