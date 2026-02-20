/**
 * Hook de Diagnóstico para a Extensão Lexato
 *
 * Gerencia estado e execução das verificações de integridade da extensão.
 *
 * @module useDiagnostic
 */

import { useState, useCallback, useRef } from 'react';
import {
  runDiagnostic,
  generateDiagnosticReport,
  exportReportAsText,
  exportReportAsJson,
  type DiagnosticResult,
  type DiagnosticCheckResult,
  type DiagnosticReport,
  type DiagnosticOverallStatus,
} from '../../lib/diagnostic';

/**
 * Estado do hook de diagnóstico
 */
interface UseDiagnosticState {
  /** Se o diagnóstico está em execução */
  isRunning: boolean;
  /** Progresso atual (0-100) */
  progress: number;
  /** Verificação atual sendo executada */
  currentCheck: DiagnosticCheckResult | null;
  /** Resultado completo do diagnóstico */
  result: DiagnosticResult | null;
  /** Relatório gerado */
  report: DiagnosticReport | null;
  /** Mensagem de erro */
  error: string | null;
}

/**
 * Retorno do hook useDiagnostic
 */
interface UseDiagnosticReturn extends UseDiagnosticState {
  /** Inicia o diagnóstico */
  startDiagnostic: () => Promise<void>;
  /** Cancela o diagnóstico em execução */
  cancelDiagnostic: () => void;
  /** Tenta corrigir um problema automaticamente */
  tryAutoFix: (checkId: string) => Promise<boolean>;
  /** Exporta relatório como texto */
  exportAsText: () => string | null;
  /** Exporta relatório como JSON */
  exportAsJson: () => string | null;
  /** Copia relatório para área de transferência */
  copyReportToClipboard: () => Promise<boolean>;
  /** Baixa relatório como arquivo */
  downloadReport: (format: 'text' | 'json') => void;
  /** Limpa resultado e reinicia */
  reset: () => void;
  /** Status geral do diagnóstico */
  overallStatus: DiagnosticOverallStatus;
  /** Contadores de status */
  statusCounts: {
    success: number;
    warnings: number;
    errors: number;
    total: number;
  };
}

/**
 * Hook para gerenciar diagnóstico da extensão
 *
 * Funcionalidades:
 * - Executa verificações de integridade
 * - Acompanha progresso em tempo real
 * - Gera relatórios exportáveis
 * - Suporta correção automática de problemas
 */
export function useDiagnostic(): UseDiagnosticReturn {
  const [state, setState] = useState<UseDiagnosticState>({
    isRunning: false,
    progress: 0,
    currentCheck: null,
    result: null,
    report: null,
    error: null,
  });

  // Ref para controle de cancelamento
  const cancelledRef = useRef(false);

  /**
   * Inicia o diagnóstico
   */
  const startDiagnostic = useCallback(async (): Promise<void> => {
    cancelledRef.current = false;

    setState((prev) => ({
      ...prev,
      isRunning: true,
      progress: 0,
      currentCheck: null,
      result: null,
      report: null,
      error: null,
    }));

    try {
      // Executa diagnóstico com auto-reparo ativado
      const result = await runDiagnostic({
        onProgress: (completed: number, total: number, currentCheck: DiagnosticCheckResult) => {
          if (cancelledRef.current) {
            return;
          }

          const progress = Math.round((completed / total) * 100);

          setState((prev) => ({
            ...prev,
            progress,
            currentCheck,
          }));
        },
        autoRepair: true,
        minDuration: 3000
      });

      // Verifica se foi cancelado durante execução
      if (cancelledRef.current) {
        setState((prev) => ({
          ...prev,
          isRunning: false,
          progress: 0,
          currentCheck: null,
        }));
        return;
      }

      // Gera relatório
      const report = generateDiagnosticReport(result);

      setState((prev) => ({
        ...prev,
        isRunning: false,
        progress: 100,
        currentCheck: null,
        result,
        report,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isRunning: false,
        progress: 0,
        currentCheck: null,
        error: `Erro ao executar diagnóstico: ${String(err)}`,
      }));
    }
  }, []);

  /**
   * Cancela o diagnóstico em execução
   */
  const cancelDiagnostic = useCallback((): void => {
    cancelledRef.current = true;
    setState((prev) => ({
      ...prev,
      isRunning: false,
      progress: 0,
      currentCheck: null,
    }));
  }, []);

  /**
   * Tenta corrigir um problema automaticamente
   */
  const tryAutoFix = useCallback(
    async (checkId: string): Promise<boolean> => {
      const check = state.result?.checks.find((c) => c.id === checkId);

      if (!check?.autoFixFn) {
        return false;
      }

      try {
        const success = await check.autoFixFn();

        if (success) {
          await startDiagnostic();
        }

        return success;
      } catch {
        return false;
      }
    },
    [state.result, startDiagnostic]
  );

  /**
   * Exporta relatório como texto
   */
  const exportAsText = useCallback((): string | null => {
    if (!state.report) {
      return null;
    }
    return exportReportAsText(state.report);
  }, [state.report]);

  /**
   * Exporta relatório como JSON
   */
  const exportAsJson = useCallback((): string | null => {
    if (!state.report) {
      return null;
    }
    return exportReportAsJson(state.report);
  }, [state.report]);

  /**
   * Copia relatório para área de transferência
   */
  const copyReportToClipboard = useCallback(async (): Promise<boolean> => {
    const text = exportAsText();
    if (!text) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }, [exportAsText]);

  /**
   * Baixa relatório como arquivo
   */
  const downloadReport = useCallback(
    (format: 'text' | 'json'): void => {
      const content = format === 'text' ? exportAsText() : exportAsJson();
      if (!content) {
        return;
      }

      const extension = format === 'text' ? 'txt' : 'json';
      const mimeType = format === 'text' ? 'text/plain' : 'application/json';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `lexato-diagnostico-${timestamp}.${extension}`;

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [exportAsText, exportAsJson]
  );

  /**
   * Limpa resultado e reinicia
   */
  const reset = useCallback((): void => {
    cancelledRef.current = false;
    setState({
      isRunning: false,
      progress: 0,
      currentCheck: null,
      result: null,
      report: null,
      error: null,
    });
  }, []);

  // Calcula status geral
  const overallStatus: DiagnosticOverallStatus = state.result?.overallStatus ?? 'idle';

  // Calcula contadores
  const statusCounts = {
    success: state.result?.checks.filter((c) => c.status === 'success').length ?? 0,
    warnings: state.result?.checks.filter((c) => c.status === 'warning').length ?? 0,
    errors: state.result?.checks.filter((c) => c.status === 'error').length ?? 0,
    total: state.result?.checks.length ?? 0,
  };

  return {
    ...state,
    startDiagnostic,
    cancelDiagnostic,
    tryAutoFix,
    exportAsText,
    exportAsJson,
    copyReportToClipboard,
    downloadReport,
    reset,
    overallStatus,
    statusCounts,
  };
}

export default useDiagnostic;
