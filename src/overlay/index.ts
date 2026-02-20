/**
 * Módulo de Overlay da Extensão Lexato
 *
 * Exporta componentes de overlay para injeção na página durante captura.
 * Acessível via web_accessible_resources no manifest.
 *
 * @module overlay
 */

// Componente principal do overlay de captura
export { default as CaptureOverlay, OVERLAY_Z_INDEX } from './CaptureOverlay';
export type { CaptureOverlayProps } from './CaptureOverlay';

// Componente de barra de progresso
export { default as ProgressBar } from './ProgressBar';
export type { ProgressBarProps } from './ProgressBar';

// Componente de overlay de processamento pós-captura
export {
  default as ProcessingOverlay,
  PROCESSING_OVERLAY_Z_INDEX,
  DEFAULT_PROCESSING_STEPS,
  PROCESSING_OVERLAY_COLORS,
} from './processing-overlay';
export type {
  ProcessingOverlayProps,
  ProcessingStep,
  ProcessingStepStatus,
  ProcessingError,
} from './processing-overlay';

// NOTA: VideoControls e VideoControlBar foram removidos como parte do redesign
// Os controles de vídeo agora ficam no Side Panel (fora da área capturada)

