/**
 * Gerenciador de Progresso do Pipeline de Evidências
 *
 * Rastreia o estado de cada evidência no pipeline e emite eventos
 * de progresso para UI e persistência em chrome.storage.local.
 *
 * Fases do pipeline (RFC 3161):
 * 1. capture - Captura de mídia e metadados
 * 2. timestamp - Carimbo ICP-Brasil (ANTES do upload)
 * 3. upload - Upload para S3
 * 4. preview - Revisão e aprovação do usuário
 * 5. blockchain - Triplo registro (Polygon + Arbitrum + Optimism)
 * 6. certificate - Geração do PDF
 *
 * @module ProgressTracker
 */

import { captureException } from '../../lib/sentry';
import type {
  EvidenceStatus,
  PipelineProgress,
  PipelineProgressCallback,
} from './types';

/**
 * Chave usada para persistência no chrome.storage.local
 */
const STORAGE_KEY = 'lexato_pipeline_progress';

/**
 * Mapeamento de status para fase e nome da fase
 *
 * Cada status do pipeline corresponde a uma fase (1-6) e um nome descritivo.
 * Este mapeamento é usado para determinar automaticamente a fase atual
 * baseado no status da evidência.
 */
const PHASE_MAP: Record<EvidenceStatus, { phase: 1 | 2 | 3 | 4 | 5 | 6; phaseName: PipelineProgress['phaseName'] }> = {
  // Fase 1: Captura
  INITIALIZING: { phase: 1, phaseName: 'capture' },
  CAPTURING: { phase: 1, phaseName: 'capture' },
  CAPTURED: { phase: 1, phaseName: 'capture' },
  CAPTURE_FAILED: { phase: 1, phaseName: 'capture' },

  // Fase 2: Timestamp ICP-Brasil (ANTES do upload - RFC 3161)
  TIMESTAMPING: { phase: 2, phaseName: 'timestamp' },
  TIMESTAMPED: { phase: 2, phaseName: 'timestamp' },
  TIMESTAMP_FALLBACK: { phase: 2, phaseName: 'timestamp' },
  TIMESTAMP_FAILED: { phase: 2, phaseName: 'timestamp' },

  // Fase 3: Upload S3
  UPLOADING: { phase: 3, phaseName: 'upload' },
  UPLOADED: { phase: 3, phaseName: 'upload' },
  UPLOAD_FAILED: { phase: 3, phaseName: 'upload' },

  // Fase 4: Preview/Aprovação
  PENDING_REVIEW: { phase: 4, phaseName: 'preview' },
  APPROVED: { phase: 4, phaseName: 'preview' },
  DISCARDED: { phase: 4, phaseName: 'preview' },
  EXPIRED: { phase: 4, phaseName: 'preview' },

  // Fase 5: Blockchain
  REGISTERING_BLOCKCHAIN: { phase: 5, phaseName: 'blockchain' },
  BLOCKCHAIN_PARTIAL: { phase: 5, phaseName: 'blockchain' },
  BLOCKCHAIN_COMPLETE: { phase: 5, phaseName: 'blockchain' },
  BLOCKCHAIN_FAILED: { phase: 5, phaseName: 'blockchain' },

  // Fase 6: Certificado
  GENERATING_PDF: { phase: 6, phaseName: 'certificate' },
  CERTIFIED: { phase: 6, phaseName: 'certificate' },
  PDF_FAILED: { phase: 6, phaseName: 'certificate' },
};

/**
 * Mensagens padrão para cada status (em PT-BR)
 */
const DEFAULT_MESSAGES: Record<EvidenceStatus, string> = {
  // Fase 1: Captura
  INITIALIZING: 'Iniciando...',
  CAPTURING: 'Capturando evidência...',
  CAPTURED: 'Captura concluída',
  CAPTURE_FAILED: 'Falha na captura',

  // Fase 2: Timestamp
  TIMESTAMPING: 'Selo temporal ICP-Brasil...',
  TIMESTAMPED: 'Carimbo de tempo aplicado',
  TIMESTAMP_FALLBACK: 'Carimbo de tempo local aplicado (fallback)',
  TIMESTAMP_FAILED: 'Falha ao obter carimbo de tempo',

  // Fase 3: Upload
  UPLOADING: 'Enviando...',
  UPLOADED: 'Upload concluído',
  UPLOAD_FAILED: 'Falha no upload',

  // Fase 4: Preview
  PENDING_REVIEW: 'Aguardando sua aprovação',
  APPROVED: 'Evidência aprovada',
  DISCARDED: 'Evidência descartada',
  EXPIRED: 'Tempo de aprovação expirado',

  // Fase 5: Blockchain
  REGISTERING_BLOCKCHAIN: 'Registrando em blockchain...',
  BLOCKCHAIN_PARTIAL: 'Registro parcial em blockchain',
  BLOCKCHAIN_COMPLETE: 'Registro em blockchain concluído',
  BLOCKCHAIN_FAILED: 'Falha no registro blockchain',

  // Fase 6: Certificado
  GENERATING_PDF: 'Gerando certificado PDF...',
  CERTIFIED: 'Certificação concluída',
  PDF_FAILED: 'Falha na geração do certificado',
};

/**
 * Percentuais padrão para cada status
 *
 * NOTA: Estes são os valores "base" de cada status.
 * O progresso real será interpolado suavemente entre eles.
 * Algumas etapas (CAPTURING, UPLOADING) terão progresso dinâmico.
 */
const DEFAULT_PERCENTAGES: Record<EvidenceStatus, number> = {
  // Fase 1: Captura (0-30%) - mais espaço para progresso granular
  INITIALIZING: 2,      // 0-2% Início suave
  CAPTURING: 5,         // 2-25% Durante a captura (será incrementado dinamicamente)
  CAPTURED: 30,         // 25-30% Captura completa
  CAPTURE_FAILED: 30,

  // Fase 2: Timestamp (30-40%) - timestamp é rápido
  TIMESTAMPING: 32,     // 30-35% Início do timestamp
  TIMESTAMPED: 40,      // 35-40% Timestamp completo
  TIMESTAMP_FALLBACK: 40,
  TIMESTAMP_FAILED: 40,

  // Fase 3: Upload (40-85%) - maior parte do tempo
  UPLOADING: 42,        // 40-85% Durante upload (será incrementado dinamicamente)
  UPLOADED: 85,         // Upload completo
  UPLOAD_FAILED: 85,

  // Fase 4: Preview (85-95%) - abrindo preview
  PENDING_REVIEW: 95,   // 85-95% Aguardando preview
  APPROVED: 100,
  DISCARDED: 100,
  EXPIRED: 100,

  // Fase 5: Blockchain (95-100%)
  REGISTERING_BLOCKCHAIN: 96,
  BLOCKCHAIN_PARTIAL: 98,
  BLOCKCHAIN_COMPLETE: 100,
  BLOCKCHAIN_FAILED: 100,

  // Fase 6: Certificado (100%)
  GENERATING_PDF: 99,
  CERTIFIED: 100,
  PDF_FAILED: 100,
};

/**
 * Gerenciador de progresso do pipeline de evidências
 *
 * Responsável por:
 * - Rastrear estado de cada evidência
 * - Emitir eventos de progresso para listeners
 * - Persistir estado em chrome.storage.local
 * - Recuperar estado após refresh da extensão
 *
 * @example
 * ```typescript
 * const tracker = new ProgressTracker();
 *
 * // Registrar listener
 * const unsubscribe = tracker.subscribe((progress) => {
 *   console.log(`[${progress.evidenceId}] ${progress.status}: ${progress.percent}%`);
 * });
 *
 * // Atualizar progresso
 * tracker.update('evidence-123', {
 *   status: 'CAPTURING',
 *   percent: 10,
 *   message: 'Capturando viewport 2 de 5...',
 * });
 *
 * // Remover listener
 * unsubscribe();
 * ```
 */
export class ProgressTracker {
  /**
   * Set de listeners registrados para eventos de progresso
   */
  private readonly listeners: Set<PipelineProgressCallback> = new Set();

  /**
   * Mapa de progresso por evidenceId (cache em memória)
   */
  private readonly progressMap: Map<string, PipelineProgress> = new Map();

  /**
   * Flag indicando se o tracker foi inicializado (carregou dados do storage)
   */
  private initialized = false;

  /**
   * Cria uma nova instância do ProgressTracker
   *
   * O tracker carrega automaticamente dados persistidos do chrome.storage.local
   * na primeira operação que requer acesso ao estado.
   */
  constructor() {
    // Inicialização lazy - carrega do storage na primeira operação
  }

  /**
   * Inicializa o tracker carregando dados do chrome.storage.local
   *
   * Este método é chamado automaticamente na primeira operação que
   * requer acesso ao estado. Pode ser chamado manualmente para
   * pré-carregar os dados.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.loadFromStorage();
      this.initialized = true;
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { component: 'ProgressTracker', operation: 'initialize' },
      });
      // Continua mesmo com erro - usa cache vazio
      this.initialized = true;
    }
  }

  /**
   * Atualiza o progresso de uma evidência
   *
   * Mescla os dados fornecidos com o estado atual, atualiza o timestamp,
   * emite evento para listeners e persiste no storage.
   *
   * IMPORTANTE: Se o percentual não for fornecido mas o status mudar,
   * usa incremento suave em vez de saltar direto para o valor padrão.
   *
   * @param evidenceId - ID único da evidência (UUID v4)
   * @param update - Dados parciais para atualizar
   *
   * @example
   * ```typescript
   * // Atualizar apenas status
   * tracker.update('evidence-123', { status: 'UPLOADING' });
   *
   * // Atualizar com detalhes de upload
   * tracker.update('evidence-123', {
   *   status: 'UPLOADING',
   *   percent: 45,
   *   message: 'Enviando arquivo...',
   *   details: {
   *     bytesUploaded: 2500000,
   *     totalBytes: 5000000,
   *   },
   * });
   * ```
   */
  update(evidenceId: string, update: Partial<PipelineProgress>): void {
    // Validar evidenceId
    if (!evidenceId || typeof evidenceId !== 'string') {
      captureException(new Error(`evidenceId inválido: ${String(evidenceId)}`), {
        tags: { component: 'ProgressTracker', operation: 'update' },
      });
      return;
    }

    // Obter estado atual ou criar inicial
    const current = this.progressMap.get(evidenceId) ?? this.createInitial(evidenceId);

    // Determinar fase e nome baseado no status (se fornecido)
    let phaseInfo = { phase: current.phase, phaseName: current.phaseName };
    if (update.status) {
      phaseInfo = this.getPhaseInfo(update.status);
    }

    // Determinar mensagem padrão se não fornecida
    let message = update.message ?? current.message;
    if (update.status && !update.message) {
      message = DEFAULT_MESSAGES[update.status] ?? current.message;
    }

    // Determinar percentual - com lógica de incremento suave
    let percent = update.percent ?? current.percent;
    if (update.status && update.percent === undefined) {
      const targetPercent = DEFAULT_PERCENTAGES[update.status] ?? current.percent;

      // Para status dinâmicos (CAPTURING, UPLOADING), usar incremento suave
      // em vez de saltar direto para o valor padrão
      if (update.status === 'CAPTURING' || update.status === 'UPLOADING') {
        // Se está começando a etapa, incrementar gradualmente
        // Não saltar direto - isso causa o problema de "travamento"
        if (current.percent < targetPercent) {
          // Incrementar suavemente (máximo 2% por vez para evitar saltos)
          percent = Math.min(current.percent + 2, targetPercent);
        } else {
          percent = targetPercent;
        }
      } else {
        // Para outros status, usar o valor padrão mas com incremento suave
        // se a diferença for muito grande (mais de 5%)
        if (Math.abs(targetPercent - current.percent) > 5) {
          // Incrementar no máximo 5% por vez
          if (targetPercent > current.percent) {
            percent = Math.min(current.percent + 5, targetPercent);
          } else {
            percent = targetPercent; // Nunca regredir
          }
        } else {
          percent = targetPercent;
        }
      }
    }

    // Garantir que o progresso nunca regride
    percent = Math.max(current.percent, percent);

    // Criar objeto atualizado
    const updated: PipelineProgress = {
      ...current,
      ...update,
      evidenceId,
      phase: phaseInfo.phase,
      phaseName: phaseInfo.phaseName,
      message,
      percent,
      updatedAt: new Date().toISOString(),
    };

    // Atualizar cache em memória
    this.progressMap.set(evidenceId, updated);

    // Emitir evento para listeners
    this.emit(updated);

    // Persistir no storage (async, não bloqueia)
    this.persist(updated).catch((error) => {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { component: 'ProgressTracker', operation: 'persist' },
        evidenceId,
      });
    });
  }

  /**
   * Incrementa o progresso gradualmente
   *
   * Útil para operações longas onde queremos mostrar progresso contínuo.
   * O progresso nunca regride e respeita os limites máximos por fase.
   *
   * @param evidenceId - ID da evidência
   * @param increment - Valor a incrementar (padrão: 1)
   * @param maxPercent - Percentual máximo permitido (opcional)
   * @param message - Mensagem opcional para atualizar
   *
   * @example
   * ```typescript
   * // Durante upload, incrementar gradualmente
   * tracker.incrementProgress('evidence-123', 2, 85, 'Enviando dados...');
   * ```
   */
  incrementProgress(
    evidenceId: string,
    increment = 1,
    maxPercent?: number,
    message?: string
  ): void {
    const current = this.progressMap.get(evidenceId);
    if (!current) {
      console.warn('[ProgressTracker] Tentando incrementar progresso de evidência inexistente:', evidenceId);
      return;
    }

    // Calcular novo percentual
    let newPercent = current.percent + increment;

    // Respeitar limite máximo se fornecido
    if (maxPercent !== undefined) {
      newPercent = Math.min(newPercent, maxPercent);
    }

    // Respeitar limite máximo da fase atual
    const phaseMaxPercent = this.getPhaseMaxPercent(current.status);
    newPercent = Math.min(newPercent, phaseMaxPercent);

    // Garantir que está entre 0 e 100
    newPercent = Math.max(0, Math.min(100, newPercent));

    // Só atualizar se houve mudança real
    if (newPercent !== current.percent || message) {
      this.update(evidenceId, {
        percent: newPercent,
        message: message ?? current.message,
      });
    }
  }

  /**
   * Obtém o percentual máximo permitido para uma fase
   *
   * @param status - Status atual
   * @returns Percentual máximo da fase
   */
  private getPhaseMaxPercent(status?: EvidenceStatus): number {
    if (!status) {
      return 100;
    }

    // Mapear status para percentual máximo da fase
    const phaseMax: Partial<Record<EvidenceStatus, number>> = {
      // Fase de captura: máximo 30%
      INITIALIZING: 5,
      CAPTURING: 28,
      CAPTURED: 30,
      CAPTURE_FAILED: 30,

      // Fase de timestamp: máximo 40%
      TIMESTAMPING: 38,
      TIMESTAMPED: 40,
      TIMESTAMP_FALLBACK: 40,
      TIMESTAMP_FAILED: 40,

      // Fase de upload: máximo 85%
      UPLOADING: 83,
      UPLOADED: 85,
      UPLOAD_FAILED: 85,

      // Fase de preview: máximo 95%
      PENDING_REVIEW: 95,

      // Fases finais: 100%
      APPROVED: 100,
      DISCARDED: 100,
      EXPIRED: 100,
      REGISTERING_BLOCKCHAIN: 100,
      BLOCKCHAIN_PARTIAL: 100,
      BLOCKCHAIN_COMPLETE: 100,
      BLOCKCHAIN_FAILED: 100,
      GENERATING_PDF: 100,
      CERTIFIED: 100,
      PDF_FAILED: 100,
    };

    return phaseMax[status] ?? 100;
  }

  /**
   * Obtém o progresso atual de uma evidência
   *
   * @param evidenceId - ID da evidência
   * @returns Progresso atual ou null se não encontrado
   */
  get(evidenceId: string): PipelineProgress | null {
    return this.progressMap.get(evidenceId) ?? null;
  }

  /**
   * Obtém todos os progressos em cache
   *
   * @returns Array com todos os progressos
   */
  getAll(): PipelineProgress[] {
    return Array.from(this.progressMap.values());
  }

  /**
   * Remove o progresso de uma evidência
   *
   * @param evidenceId - ID da evidência para remover
   */
  async remove(evidenceId: string): Promise<void> {
    this.progressMap.delete(evidenceId);
    await this.removeFromStorage(evidenceId);
  }

  /**
   * Limpa todos os progressos
   */
  async clear(): Promise<void> {
    this.progressMap.clear();
    await this.clearStorage();
  }

  /**
   * Registra um listener para eventos de progresso
   *
   * @param callback - Função a ser chamada em cada atualização
   * @returns Função para remover o listener
   *
   * @example
   * ```typescript
   * const unsubscribe = tracker.subscribe((progress) => {
   *   updateUI(progress);
   * });
   *
   * // Mais tarde...
   * unsubscribe();
   * ```
   */
  subscribe(callback: PipelineProgressCallback): () => void {
    this.listeners.add(callback);

    // Retorna função para remover listener
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Remove todos os listeners
   */
  unsubscribeAll(): void {
    this.listeners.clear();
  }

  /**
   * Obtém informações de fase baseado no status
   *
   * @param status - Status da evidência
   * @returns Objeto com fase (1-6) e nome da fase
   */
  getPhaseInfo(status: EvidenceStatus): { phase: 1 | 2 | 3 | 4 | 5 | 6; phaseName: PipelineProgress['phaseName'] } {
    const info = PHASE_MAP[status];
    if (info) {
      return info;
    }

    // Fallback para status desconhecido
    console.warn(`[ProgressTracker] Status desconhecido: ${status}`);
    return { phase: 1, phaseName: 'capture' };
  }

  /**
   * Cria objeto de progresso inicial para uma evidência
   *
   * @param evidenceId - ID da evidência
   * @returns Objeto PipelineProgress inicial
   */
  private createInitial(evidenceId: string): PipelineProgress {
    return {
      evidenceId,
      status: 'INITIALIZING',
      phase: 1,
      phaseName: 'capture',
      percent: 0,
      message: DEFAULT_MESSAGES.INITIALIZING,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Emite evento de progresso para todos os listeners
   *
   * @param progress - Progresso atualizado
   */
  private emit(progress: PipelineProgress): void {
    for (const listener of this.listeners) {
      try {
        listener(progress);
      } catch (error) {
        captureException(error instanceof Error ? error : new Error(String(error)), {
          tags: { component: 'ProgressTracker', operation: 'emit-listener' },
        });
      }
    }
  }

  /**
   * Persiste progresso no chrome.storage.local
   *
   * @param progress - Progresso para persistir
   */
  private async persist(progress: PipelineProgress): Promise<void> {
    try {
      // Verificar se chrome.storage está disponível
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        console.warn('[ProgressTracker] chrome.storage.local não disponível');
        return;
      }

      // Carregar dados existentes
      const result = await chrome.storage.local.get(STORAGE_KEY);
      const stored: Record<string, PipelineProgress> = result[STORAGE_KEY] ?? {};

      // Atualizar com novo progresso
      stored[progress.evidenceId] = progress;

      // Salvar de volta
      await chrome.storage.local.set({ [STORAGE_KEY]: stored });
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { component: 'ProgressTracker', operation: 'persistToStorage' },
      });
      throw error;
    }
  }

  /**
   * Carrega progressos do chrome.storage.local
   */
  private async loadFromStorage(): Promise<void> {
    try {
      // Verificar se chrome.storage está disponível
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        console.warn('[ProgressTracker] chrome.storage.local não disponível');
        return;
      }

      const result = await chrome.storage.local.get(STORAGE_KEY);
      const stored: Record<string, PipelineProgress> = result[STORAGE_KEY] ?? {};

      // Carregar para o cache em memória
      for (const [evidenceId, progress] of Object.entries(stored)) {
        this.progressMap.set(evidenceId, progress);
      }
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { component: 'ProgressTracker', operation: 'loadFromStorage' },
      });
      throw error;
    }
  }

  /**
   * Remove um progresso do chrome.storage.local
   *
   * @param evidenceId - ID da evidência para remover
   */
  private async removeFromStorage(evidenceId: string): Promise<void> {
    try {
      // Verificar se chrome.storage está disponível
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        return;
      }

      const result = await chrome.storage.local.get(STORAGE_KEY);
      const stored: Record<string, PipelineProgress> = result[STORAGE_KEY] ?? {};

      delete stored[evidenceId];

      await chrome.storage.local.set({ [STORAGE_KEY]: stored });
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { component: 'ProgressTracker', operation: 'removeFromStorage' },
      });
    }
  }

  /**
   * Limpa todos os progressos do chrome.storage.local
   */
  private async clearStorage(): Promise<void> {
    try {
      // Verificar se chrome.storage está disponível
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        return;
      }

      await chrome.storage.local.remove(STORAGE_KEY);
    } catch (error) {
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { component: 'ProgressTracker', operation: 'clearStorage' },
      });
    }
  }
}

/**
 * Instância singleton do ProgressTracker
 *
 * Use esta instância para compartilhar o tracker entre módulos.
 *
 * @example
 * ```typescript
 * import { progressTracker } from './progress-tracker';
 *
 * progressTracker.update('evidence-123', { status: 'CAPTURING' });
 * ```
 */
export const progressTracker = new ProgressTracker();
