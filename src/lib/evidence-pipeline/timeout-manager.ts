/**
 * Gerenciador de Timeouts para o Pipeline de Evidências
 *
 * Garante que nenhuma operação fique travada indefinidamente.
 * Cada fase do pipeline tem um timeout configurável.
 *
 * @module TimeoutManager
 */

import type { PipelineProgress } from './types';

/**
 * Configuração de timeout por fase do pipeline
 * Valores em milissegundos
 */
export const TIMEOUT_CONFIG: Record<PipelineProgress['phaseName'], number> = {
  capture: 5 * 60 * 1000,       // 5 minutos - captura pode demorar
  timestamp: 30 * 1000,          // 30 segundos - API externa
  upload: 10 * 60 * 1000,        // 10 minutos - vídeos grandes
  preview: 24 * 60 * 60 * 1000,       // 24 horas - aguardando usuário
  blockchain: 3 * 60 * 1000,     // 3 minutos - registro na rede
  certificate: 2 * 60 * 1000,    // 2 minutos - geração de PDF
};

/**
 * Timeout global máximo para qualquer operação (failsafe)
 * Se uma fase exceder isso, algo está muito errado
 */
export const GLOBAL_TIMEOUT = 15 * 60 * 1000; // 15 minutos

/**
 * Interface para registro de timeout ativo
 */
interface TimeoutEntry {
  /** ID do setTimeout */
  timeoutId: ReturnType<typeof setTimeout>;
  /** Nome da fase */
  phase: PipelineProgress['phaseName'];
  /** Timestamp de início */
  startedAt: number;
  /** Callback de erro */
  onTimeout: () => void;
  /** AbortController associado (se houver) */
  abortController?: AbortController;
}

/**
 * Callback chamado quando um timeout é atingido
 */
export type TimeoutCallback = (phase: PipelineProgress['phaseName'], elapsedMs: number) => void;

/**
 * Gerenciador de timeouts para operações do pipeline
 *
 * Funcionalidades:
 * - Registra timeouts por fase
 * - Cancela operações via AbortController
 * - Emite eventos de timeout
 * - Previne loops infinitos de carregamento
 *
 * @example
 * ```typescript
 * const manager = new TimeoutManager();
 *
 * // Registrar timeout para upload
 * const { abortController, cleanup } = manager.register('upload', () => {
 *   console.log('Upload timeout!');
 * });
 *
 * // Usar abortController na requisição
 * await fetch(url, { signal: abortController.signal });
 *
 * // Limpar timeout após sucesso
 * cleanup();
 * ```
 */
export class TimeoutManager {
  private activeTimeouts: Map<string, TimeoutEntry> = new Map();
  private onTimeoutCallback: TimeoutCallback | null = null;

  /**
   * Registra callback global para timeouts
   *
   * @param callback - Função chamada quando qualquer timeout é atingido
   */
  setTimeoutCallback(callback: TimeoutCallback): void {
    this.onTimeoutCallback = callback;
  }

  /**
   * Registra um novo timeout para uma fase do pipeline
   *
   * @param phase - Nome da fase (capture, upload, etc.)
   * @param onTimeout - Callback chamado quando timeout é atingido
   * @param customTimeoutMs - Timeout customizado (opcional, usa padrão da fase)
   * @returns Objeto com AbortController e função de cleanup
   */
  register(
    phase: PipelineProgress['phaseName'],
    onTimeout?: () => void,
    customTimeoutMs?: number
  ): {
    abortController: AbortController;
    cleanup: () => void;
  } {
    // Limpar timeout anterior da mesma fase (se existir)
    this.clear(phase);

    const abortController = new AbortController();
    const timeoutMs = customTimeoutMs ?? TIMEOUT_CONFIG[phase] ?? GLOBAL_TIMEOUT;
    const startedAt = Date.now();

    const timeoutId = setTimeout(() => {
      const elapsedMs = Date.now() - startedAt;

      console.error(`[TimeoutManager] Timeout atingido para fase "${phase}" após ${elapsedMs}ms`);

      // Abortar operações em andamento
      abortController.abort(new Error(`Timeout na fase ${phase} após ${Math.round(elapsedMs / 1000)}s`));

      // Chamar callback específico
      onTimeout?.();

      // Chamar callback global
      this.onTimeoutCallback?.(phase, elapsedMs);

      // Remover do mapa
      this.activeTimeouts.delete(phase);
    }, timeoutMs);

    // Registrar timeout
    this.activeTimeouts.set(phase, {
      timeoutId,
      phase,
      startedAt,
      onTimeout: onTimeout ?? (() => {}),
      abortController,
    });

    console.warn(`[TimeoutManager] Timeout registrado para "${phase}": ${timeoutMs}ms`);

    // Retornar controller e cleanup
    return {
      abortController,
      cleanup: () => this.clear(phase),
    };
  }

  /**
   * Limpa timeout de uma fase específica
   *
   * @param phase - Nome da fase
   */
  clear(phase: PipelineProgress['phaseName']): void {
    const entry = this.activeTimeouts.get(phase);
    if (entry) {
      clearTimeout(entry.timeoutId);
      this.activeTimeouts.delete(phase);

      console.warn(`[TimeoutManager] Timeout limpo para "${phase}"`);
    }
  }

  /**
   * Limpa todos os timeouts ativos
   *
   * Útil para reset completo após erro ou cancelamento
   */
  clearAll(): void {
    console.warn(`[TimeoutManager] Limpando ${this.activeTimeouts.size} timeouts ativos`);

    for (const [_phase, entry] of this.activeTimeouts) {
      clearTimeout(entry.timeoutId);

      // Abortar operações pendentes
      if (entry.abortController && !entry.abortController.signal.aborted) {
        entry.abortController.abort(new Error('Operação cancelada'));
      }
    }

    this.activeTimeouts.clear();
  }

  /**
   * Verifica se há timeout ativo para uma fase
   *
   * @param phase - Nome da fase
   * @returns true se há timeout ativo
   */
  isActive(phase: PipelineProgress['phaseName']): boolean {
    return this.activeTimeouts.has(phase);
  }

  /**
   * Obtém tempo decorrido desde o início do timeout
   *
   * @param phase - Nome da fase
   * @returns Tempo em ms ou null se não há timeout
   */
  getElapsedTime(phase: PipelineProgress['phaseName']): number | null {
    const entry = this.activeTimeouts.get(phase);
    if (!entry) {
      return null;
    }
    return Date.now() - entry.startedAt;
  }

  /**
   * Obtém tempo restante do timeout
   *
   * @param phase - Nome da fase
   * @returns Tempo restante em ms ou null se não há timeout
   */
  getRemainingTime(phase: PipelineProgress['phaseName']): number | null {
    const entry = this.activeTimeouts.get(phase);
    if (!entry) {
      return null;
    }

    const timeoutMs = TIMEOUT_CONFIG[phase] ?? GLOBAL_TIMEOUT;
    const elapsed = Date.now() - entry.startedAt;
    return Math.max(0, timeoutMs - elapsed);
  }

  /**
   * Obtém AbortController de uma fase (se ativo)
   *
   * @param phase - Nome da fase
   * @returns AbortController ou null
   */
  getAbortController(phase: PipelineProgress['phaseName']): AbortController | null {
    return this.activeTimeouts.get(phase)?.abortController ?? null;
  }

  /**
   * Obtém snapshot do estado atual (para debug)
   */
  getSnapshot(): Array<{
    phase: string;
    elapsedMs: number;
    remainingMs: number;
  }> {
    return Array.from(this.activeTimeouts.values()).map((entry) => ({
      phase: entry.phase,
      elapsedMs: Date.now() - entry.startedAt,
      remainingMs: this.getRemainingTime(entry.phase) ?? 0,
    }));
  }
}

/**
 * Instância singleton do TimeoutManager
 */
let timeoutManagerInstance: TimeoutManager | null = null;

/**
 * Obtém instância singleton do TimeoutManager
 */
export function getTimeoutManager(): TimeoutManager {
  timeoutManagerInstance ??= new TimeoutManager();
  return timeoutManagerInstance;
}

/**
 * Reseta instância singleton (para testes)
 */
export function resetTimeoutManager(): void {
  timeoutManagerInstance?.clearAll();
  timeoutManagerInstance = null;
}
