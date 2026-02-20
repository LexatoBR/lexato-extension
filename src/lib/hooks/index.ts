/**
 * Hooks customizados do Design System Lexato
 *
 * Exporta hooks reutilizáveis para uso em toda a extensão.
 *
 * @module lib/hooks
 */

export { useOS } from './useOS';
export type { UseOSResult, OperatingSystem } from './useOS';

export { useCommandPalette } from './useCommandPalette';
export type {
  UseCommandPaletteResult,
  UseCommandPaletteOptions,
  CommandPaletteState,
  Command,
  CommandCategory,
} from './useCommandPalette';
