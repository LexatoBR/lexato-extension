/**
 * Exportações do módulo CaptureWizard (Side Panel)
 *
 * Wizard de captura de provas digitais em tela única:
 * - CaptureTypeCompact: Seletor compacto de tipo com descrição contextual
 * - InstructionsScrollable: Instruções em área scrollável com detecção de leitura
 *
 * Fluxos condicionais mantidos como telas separadas:
 * - StepGeolocationConsent: Consentimento de geolocalização
 * - StepNoCredits: Créditos insuficientes
 * - BlockedUrlWarning: URL bloqueada
 *
 * @module CaptureWizard
 */

export { CaptureWizard, default } from './CaptureWizard';
export { BlockedUrlWarning } from './BlockedUrlWarning';
export { CaptureTypeCompact } from './CaptureTypeCompact';
export { InstructionsScrollable } from './InstructionsScrollable';
export { StepGeolocationConsent } from './StepGeolocationConsent';
export { StepNoCredits } from './StepNoCredits';

// Re-export de tipos para consumidores externos
export type { BlockedUrlWarningProps } from './BlockedUrlWarning';
