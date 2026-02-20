/**
 * Serviço de Diagnóstico da Extensão Lexato
 *
 * Orquestra a execução de todas as verificações de integridade
 * e gera relatórios exportáveis para suporte técnico.
 *
 * @module DiagnosticService
 */

import type {
  DiagnosticResult,
  DiagnosticCheckResult,
  DiagnosticOverallStatus,
  DiagnosticReport,
} from './diagnostic.types';
import { allDiagnosticChecks } from './checks';

/**
 * Callback para progresso do diagnóstico
 */
export type DiagnosticProgressCallback = (
  completed: number,
  total: number,
  currentCheck: DiagnosticCheckResult
) => void;

/**
 * Opções para execução do diagnóstico
 */
interface RunDiagnosticOptions {
  /** Callback para acompanhar progresso */
  onProgress?: DiagnosticProgressCallback;
  /** Se deve tentar reparar problemas automaticamente */
  autoRepair?: boolean;
  /** Duração mínima em ms (para UX) */
  minDuration?: number;
}

/**
 * Executa todas as verificações de diagnóstico
 *
 * @param optionsOrCallback - Opções de execução ou callback de progresso
 * @returns Resultado completo do diagnóstico
 */
export async function runDiagnostic(
  optionsOrCallback?: RunDiagnosticOptions | DiagnosticProgressCallback
): Promise<DiagnosticResult> {
  // Suporta tanto callback direto quanto objeto de opções
  const options: RunDiagnosticOptions = typeof optionsOrCallback === 'function'
    ? { onProgress: optionsOrCallback }
    : optionsOrCallback ?? {};

  const { onProgress, minDuration } = options;
  const startedAt = new Date().toISOString();
  const startTime = performance.now();

  const manifest = chrome.runtime.getManifest();
  const chromeVersion = navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] ?? 'unknown';

  const checks: DiagnosticCheckResult[] = [];
  const total = allDiagnosticChecks.length;

  // Executa cada verificação sequencialmente
  for (let i = 0; i < allDiagnosticChecks.length; i++) {
    const config = allDiagnosticChecks[i];
    if (!config) {
      continue;
    }

    // Marca como em execução
    const runningCheck: DiagnosticCheckResult = {
      id: config.id,
      name: config.name,
      description: config.description,
      ...(config.tooltip !== undefined && { tooltip: config.tooltip }),
      category: config.category,
      status: 'running',
      timestamp: new Date().toISOString(),
    };

    // Executa a verificação
    try {
      const result = await config.check();

      const completedCheck: DiagnosticCheckResult = {
        ...runningCheck,
        ...result,
        timestamp: new Date().toISOString(),
      };

      checks.push(completedCheck);

      // Notifica progresso
      if (onProgress) {
        onProgress(i + 1, total, completedCheck);
      }
    } catch (err) {
      // Erro inesperado na verificação
      const errorCheck: DiagnosticCheckResult = {
        ...runningCheck,
        status: 'error',
        message: 'Erro inesperado na verificação',
        details: { error: String(err) },
        timestamp: new Date().toISOString(),
      };

      checks.push(errorCheck);

      if (onProgress) {
        onProgress(i + 1, total, errorCheck);
      }
    }
  }

  // Calcula status geral
  const overallStatus = calculateOverallStatus(checks);

  // Garantir duração mínima para UX (evita flash)
  if (minDuration) {
    const elapsed = performance.now() - startTime;
    if (elapsed < minDuration) {
      await new Promise((r) => setTimeout(r, minDuration - elapsed));
    }
  }

  return {
    overallStatus,
    checks,
    startedAt,
    completedAt: new Date().toISOString(),
    totalDurationMs: Math.round(performance.now() - startTime),
    extensionVersion: manifest.version,
    chromeVersion,
    platform: navigator.platform,
  };
}

/**
 * Calcula o status geral baseado nos resultados das verificações
 */
function calculateOverallStatus(checks: DiagnosticCheckResult[]): DiagnosticOverallStatus {
  const hasError = checks.some((c) => c.status === 'error');
  const hasWarning = checks.some((c) => c.status === 'warning');

  if (hasError) {
    return 'critical';
  }

  if (hasWarning) {
    return 'warning';
  }

  return 'healthy';
}

/**
 * Gera relatório exportável do diagnóstico
 *
 * @param result - Resultado do diagnóstico
 * @returns Relatório formatado para exportação
 */
export function generateDiagnosticReport(result: DiagnosticResult): DiagnosticReport {
  const summary = {
    total: result.checks.length,
    success: result.checks.filter((c) => c.status === 'success').length,
    warnings: result.checks.filter((c) => c.status === 'warning').length,
    errors: result.checks.filter((c) => c.status === 'error').length,
  };

  // Mascara informações sensíveis
  const sanitizedChecks: DiagnosticCheckResult[] = result.checks.map((check) => {
    const sanitized: DiagnosticCheckResult = {
      id: check.id,
      name: check.name,
      description: check.description,
      category: check.category,
      status: check.status,
    };

    // Adiciona propriedades opcionais apenas se existirem
    if (check.tooltip !== undefined) {
      sanitized.tooltip = check.tooltip;
    }
    if (check.message !== undefined) {
      sanitized.message = check.message;
    }
    if (check.durationMs !== undefined) {
      sanitized.durationMs = check.durationMs;
    }
    if (check.canAutoFix !== undefined) {
      sanitized.canAutoFix = check.canAutoFix;
    }
    if (check.timestamp !== undefined) {
      sanitized.timestamp = check.timestamp;
    }

    // Adiciona details apenas se existir
    const sanitizedDetails = sanitizeDetails(check.details);
    if (sanitizedDetails) {
      sanitized.details = sanitizedDetails;
    }

    return sanitized;
  });

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      extensionVersion: result.extensionVersion,
      chromeVersion: result.chromeVersion,
      platform: result.platform,
      userAgent: maskUserAgent(navigator.userAgent),
    },
    result: {
      ...result,
      checks: sanitizedChecks,
    },
    summary,
  };
}

/**
 * Exporta relatório como texto formatado
 *
 * @param report - Relatório do diagnóstico
 * @returns Texto formatado para cópia/download
 */
export function exportReportAsText(report: DiagnosticReport): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════',
    '           RELATÓRIO DE DIAGNÓSTICO - LEXATO EXTENSÃO          ',
    '═══════════════════════════════════════════════════════════════',
    '',
    `📅 Gerado em: ${formatDate(report.meta.generatedAt)}`,
    `📦 Versão da Extensão: ${report.meta.extensionVersion}`,
    `🌐 Chrome: ${report.meta.chromeVersion}`,
    `💻 Plataforma: ${report.meta.platform}`,
    '',
    '───────────────────────────────────────────────────────────────',
    '                          RESUMO                               ',
    '───────────────────────────────────────────────────────────────',
    '',
    `   ✅ Sucesso:  ${report.summary.success}`,
    `   ⚠️  Avisos:   ${report.summary.warnings}`,
    `   ❌ Erros:    ${report.summary.errors}`,
    `   📊 Total:    ${report.summary.total}`,
    '',
    `   Status Geral: ${getStatusEmoji(report.result.overallStatus)} ${getStatusLabel(report.result.overallStatus)}`,
    '',
    '───────────────────────────────────────────────────────────────',
    '                    VERIFICAÇÕES DETALHADAS                    ',
    '───────────────────────────────────────────────────────────────',
    '',
  ];

  for (const check of report.result.checks) {
    const emoji = getCheckStatusEmoji(check.status);
    lines.push(`${emoji} ${check.name}`);
    lines.push(`   └─ ${check.message ?? 'Sem mensagem'}`);
    if (check.durationMs) {
      lines.push(`   └─ Tempo: ${check.durationMs}ms`);
    }
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('                    FIM DO RELATÓRIO                           ');
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Exporta relatório como JSON
 *
 * @param report - Relatório do diagnóstico
 * @returns JSON formatado
 */
export function exportReportAsJson(report: DiagnosticReport): string {
  return JSON.stringify(report, null, 2);
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Sanitiza detalhes removendo informações sensíveis
 */
function sanitizeDetails(details?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!details) {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    // Remove tokens, senhas, etc.
    if (key.toLowerCase().includes('token') || key.toLowerCase().includes('password')) {
      sanitized[key] = '[REDACTED]';
    } else if (key === 'userEmail' && typeof value === 'string') {
      sanitized[key] = value; // Já está mascarado
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Mascara User Agent para privacidade
 */
function maskUserAgent(ua: string): string {
  // Mantém apenas informações relevantes
  const chromeMatch = ua.match(/Chrome\/[\d.]+/);
  const osMatch = ua.match(/\(([^)]+)\)/);

  return `${osMatch?.[1] ?? 'Unknown OS'} - ${chromeMatch?.[0] ?? 'Chrome'}`;
}

/**
 * Formata data para exibição
 */
function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Retorna emoji para status geral
 */
function getStatusEmoji(status: DiagnosticOverallStatus): string {
  switch (status) {
    case 'healthy':
      return '✅';
    case 'warning':
      return '⚠️';
    case 'critical':
      return '❌';
    default:
      return '⏳';
  }
}

/**
 * Retorna label para status geral
 */
function getStatusLabel(status: DiagnosticOverallStatus): string {
  switch (status) {
    case 'healthy':
      return 'AMBIENTE ÍNTEGRO';
    case 'warning':
      return 'AVISOS DETECTADOS';
    case 'critical':
      return 'PROBLEMAS CRÍTICOS';
    case 'running':
      return 'EM EXECUÇÃO';
    default:
      return 'AGUARDANDO';
  }
}

/**
 * Retorna emoji para status de verificação
 */
function getCheckStatusEmoji(status: string): string {
  switch (status) {
    case 'success':
      return '✅';
    case 'warning':
      return '⚠️';
    case 'error':
      return '❌';
    case 'running':
      return '🔄';
    default:
      return '⏳';
  }
}
