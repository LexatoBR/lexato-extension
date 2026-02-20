/**
 * Módulo de Diagnóstico da Extensão Lexato
 *
 * Exporta tipos, serviços e verificações para análise de integridade.
 *
 * @module Diagnostic
 */

// Tipos
export type {
  DiagnosticCheckStatus,
  DiagnosticCategory,
  DiagnosticCheckResult,
  DiagnosticOverallStatus,
  DiagnosticResult,
  DiagnosticCheckConfig,
  DiagnosticReport,
} from './diagnostic.types';

// Serviço principal
export {
  runDiagnostic,
  generateDiagnosticReport,
  exportReportAsText,
  exportReportAsJson,
  type DiagnosticProgressCallback,
} from './diagnostic.service';

// Verificações individuais (para uso avançado)
export { allDiagnosticChecks } from './checks';
