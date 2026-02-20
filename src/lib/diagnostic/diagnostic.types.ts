/**
 * Tipos para o sistema de diagnóstico da extensão Lexato
 *
 * Define interfaces para verificações de integridade, status e resultados.
 *
 * @module DiagnosticTypes
 */

/**
 * Status de uma verificação individual
 */
export type DiagnosticCheckStatus = 'pending' | 'running' | 'success' | 'warning' | 'error' | 'fixed';

/**
 * Categoria de verificação
 */
export type DiagnosticCategory =
  | 'permissions'
  | 'serviceWorker'
  | 'offscreen'
  | 'codecs'
  | 'crypto'
  | 'storage'
  | 'api'
  | 'auth'
  | 'blockchain';

/**
 * Resultado de uma verificação individual
 */
export interface DiagnosticCheckResult {
  /** Identificador único da verificação */
  id: string;
  /** Nome da verificação em PT-BR */
  name: string;
  /** Descrição da verificação */
  description: string;
  /** Tooltip explicativo detalhado */
  tooltip?: string;
  /** Categoria da verificação */
  category: DiagnosticCategory;
  /** Status atual */
  status: DiagnosticCheckStatus;
  /** Mensagem de resultado */
  message?: string;
  /** Detalhes técnicos (para suporte) */
  details?: Record<string, unknown>;
  /** Tempo de execução em ms */
  durationMs?: number;
  /** Se pode ser corrigido automaticamente */
  canAutoFix?: boolean;
  /** Função de correção automática */
  autoFixFn?: () => Promise<boolean>;
  /** Timestamp da verificação */
  timestamp?: string;
  /** Se foi reparado automaticamente nesta sessão */
  repaired?: boolean;
}

/**
 * Status geral do diagnóstico
 */
export type DiagnosticOverallStatus = 'idle' | 'running' | 'healthy' | 'warning' | 'critical';

/**
 * Resultado completo do diagnóstico
 */
export interface DiagnosticResult {
  /** Status geral */
  overallStatus: DiagnosticOverallStatus;
  /** Lista de verificações */
  checks: DiagnosticCheckResult[];
  /** Timestamp de início */
  startedAt: string;
  /** Timestamp de conclusão */
  completedAt?: string;
  /** Duração total em ms */
  totalDurationMs?: number;
  /** Versão da extensão */
  extensionVersion: string;
  /** Versão do Chrome */
  chromeVersion: string;
  /** Plataforma */
  platform: string;
}

/**
 * Configuração de uma verificação
 */
export interface DiagnosticCheckConfig {
  /** Identificador único */
  id: string;
  /** Nome em PT-BR */
  name: string;
  /** Descrição curta */
  description: string;
  /** Tooltip explicativo detalhado */
  tooltip?: string;
  /** Categoria */
  category: DiagnosticCategory;
  /** Função de verificação */
  check: () => Promise<Omit<DiagnosticCheckResult, 'id' | 'name' | 'description' | 'category' | 'tooltip'>>;
  /** Prioridade (menor = executa primeiro) */
  priority?: number;
  /** Se é crítico para funcionamento */
  critical?: boolean;
}

/**
 * Relatório exportável do diagnóstico
 */
export interface DiagnosticReport {
  /** Metadados */
  meta: {
    generatedAt: string;
    extensionVersion: string;
    chromeVersion: string;
    platform: string;
    userAgent: string;
  };
  /** Resultado do diagnóstico */
  result: DiagnosticResult;
  /** Resumo */
  summary: {
    total: number;
    success: number;
    warnings: number;
    errors: number;
  };
}
