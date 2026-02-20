/**
 * Gerenciador de Estado da Gravação
 *
 * Gerencia o estado centralizado da gravação de vídeo, incluindo:
 * - Estatísticas de interação (cliques, teclas, scrolls, formulários)
 * - Histórico de navegação com timestamps
 * - Contexto forense (localização, conexão, dispositivo)
 * - Alertas de tempo
 * - Progresso de upload
 *
 * Broadcast para Side Panel e Content Script via chrome.runtime.sendMessage.
 *
 * @module RecordingStateManager
 * @requirements 3.1, 3.4, 3.6

 */

import { AuditLogger } from '../lib/audit-logger';
import type {
  RecordingState,
  RecordingStatus,
  InteractionStats,
  NavigationEntry,
  NavigationType,
  ForensicContext,
  Alert,
  AlertType,
  UploadProgress,
  UploadStatus,
} from '../sidepanel/types';

// ============================================================================
// Constantes
// ============================================================================

/** Duração máxima de gravação em ms (30 minutos) */
const MAX_DURATION_MS = 30 * 60 * 1000;

/**
 * Thresholds de alerta de tempo restante em ms
 * Requisitos 9.1, 9.2, 9.3
 */
export const TIME_WARNING_THRESHOLDS = {
  /** Alerta quando restam 5 minutos (300000ms) - Requisito 9.1 */
  FIVE_MINUTES: 5 * 60 * 1000,
  /** Alerta quando resta 1 minuto (60000ms) - Requisito 9.2 */
  ONE_MINUTE: 1 * 60 * 1000,
  /** Alerta quando restam 30 segundos (30000ms) - Requisito 9.3 */
  THIRTY_SECONDS: 30 * 1000,
} as const;

/**
 * Mensagens de alerta de tempo restante (PT-BR)
 */
export const TIME_WARNING_MESSAGES = {
  FIVE_MINUTES: 'Restam 5 minutos de gravação',
  ONE_MINUTE: 'Resta 1 minuto de gravação',
  THIRTY_SECONDS: 'Restam 30 segundos de gravação',
} as const;

/**
 * Mensagem de auto-finalização (PT-BR)
 * Requisitos 9.4, 9.5
 */
export const AUTO_FINALIZE_MESSAGE =
  'Tempo máximo de gravação atingido. Gravação finalizada automaticamente.' as const;

/**
 * Tipos de alerta correspondentes aos thresholds
 */
export const TIME_WARNING_ALERT_TYPES: Record<keyof typeof TIME_WARNING_THRESHOLDS, AlertType> = {
  FIVE_MINUTES: 'warning',
  ONE_MINUTE: 'warning',
  THIRTY_SECONDS: 'error',
} as const;

/** Tipo de mensagem para broadcast de estado */
const MESSAGE_TYPE_STATE_UPDATE = 'RECORDING_STATE_UPDATE';

/** Tipo de mensagem para broadcast de navegação */
const MESSAGE_TYPE_NAVIGATION_UPDATE = 'NAVIGATION_UPDATE';

/** Tipo de mensagem para broadcast de alerta */
const MESSAGE_TYPE_ALERT = 'ALERT';

/** Tipo de mensagem para broadcast de stats */
const MESSAGE_TYPE_STATS_UPDATE = 'STATS_UPDATE';

/** Tipo de mensagem para broadcast de upload progress */
const MESSAGE_TYPE_UPLOAD_PROGRESS = 'UPLOAD_PROGRESS';

// ============================================================================
// Tipos
// ============================================================================

/**
 * Configuração do RecordingStateManager
 */
export interface RecordingStateManagerConfig {
  /** Logger para auditoria */
  logger?: AuditLogger;
  /** Duração máxima em ms (padrão: 30 minutos) */
  maxDurationMs?: number;
  /** Se deve fazer broadcast automático (padrão: true) */
  autoBroadcast?: boolean;
}

/**
 * Identificadores dos alertas de tempo para rastreamento
 */
export type TimeWarningKey = keyof typeof TIME_WARNING_THRESHOLDS;

/**
 * Dados para criar uma entrada de navegação
 */
export interface NavigationEntryInput {
  /** URL de destino */
  url: string;
  /** Tipo de navegação */
  type: NavigationType;
  /** Hash SHA-256 do HTML capturado */
  htmlHash: string;
  /** Timestamp absoluto (ms desde epoch) - se não fornecido, usa Date.now() */
  timestamp?: number;
  /** Título da página (opcional) */
  title?: string;
}

// ============================================================================
// Funções Utilitárias
// ============================================================================

/**
 * Formata tempo em ms para MM:SS
 *
 * @param ms - Tempo em milissegundos
 * @returns String formatada MM:SS
 */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * Trunca URL para exibição
 *
 * @param url - URL completa
 * @param maxLength - Comprimento máximo (padrão: 50)
 * @returns URL truncada com ellipsis se necessário
 */
export function truncateUrl(url: string, maxLength: number = 50): string {
  if (url.length <= maxLength) {
    return url;
  }
  return url.substring(0, maxLength - 3) + '...';
}

/**
 * Cria estatísticas de interação iniciais
 */
function createInitialStats(): InteractionStats {
  return {
    pagesVisited: 1, // Página inicial conta como 1
    clickCount: 0,
    keystrokeCount: 0,
    scrollCount: 0,
    formsInteracted: 0,
  };
}

/**
 * Cria progresso de upload inicial
 */
function createInitialUploadProgress(): UploadProgress {
  return {
    chunksUploaded: 0,
    chunksTotal: 0,
    bytesUploaded: 0,
    bytesTotal: 0,
    status: 'idle',
  };
}

/**
 * Cria estado inicial da gravação
 */
function createInitialState(): RecordingState {
  return {
    status: 'idle',
    startTime: 0,
    elapsedMs: 0,
    maxDurationMs: MAX_DURATION_MS,
    stats: createInitialStats(),
    navigationHistory: [],
    forensicContext: null,
    alerts: [],
    uploadProgress: createInitialUploadProgress(),
  };
}

// ============================================================================
// Classe RecordingStateManager
// ============================================================================

/**
 * Gerencia estado centralizado da gravação
 *
 * Responsabilidades:
 * - Manter estado único da gravação
 * - Atualizar estatísticas de interação
 * - Registrar navegações com timestamps relativos
 * - Gerenciar contexto forense
 * - Emitir alertas de tempo
 * - Broadcast para Side Panel e Content Script
 *
 * @example
 * ```typescript
 * const manager = new RecordingStateManager();
 *
 * // Iniciar gravação
 * manager.startRecording();
 *
 * // Atualizar stats
 * manager.updateStats({ clickCount: 5 });
 *
 * // Adicionar navegação
 * manager.addNavigation({
 *   url: 'https://example.com',
 *   type: 'link-click',
 *   htmlHash: 'abc123...'
 * });
 *
 * // Obter estado
 * const state = manager.getState();
 * ```
 */
export class RecordingStateManager {
  /** Estado atual da gravação */
  private state: RecordingState;

  /** Logger para auditoria */
  private logger: AuditLogger;

  /** Duração máxima em ms */
  private maxDurationMs: number;

  /** Se deve fazer broadcast automático */
  private autoBroadcast: boolean;

  /** Contador de alertas para IDs únicos */
  private alertCounter: number;

  /**
   * Conjunto de alertas de tempo já exibidos
   * Evita duplicação de alertas durante a gravação
   * Requisitos 9.1, 9.2, 9.3
   */
  private shownTimeWarnings: Set<TimeWarningKey>;

  /**
   * Cria nova instância do RecordingStateManager
   *
   * @param config - Configuração opcional
   */
  constructor(config?: RecordingStateManagerConfig) {
    this.state = createInitialState();
    this.logger = config?.logger ?? new AuditLogger();
    this.maxDurationMs = config?.maxDurationMs ?? MAX_DURATION_MS;
    this.autoBroadcast = config?.autoBroadcast ?? true;
    this.alertCounter = 0;
    this.shownTimeWarnings = new Set();

    // Atualiza maxDurationMs no estado
    this.state.maxDurationMs = this.maxDurationMs;
  }

  // ============================================================================
  // Métodos de Leitura
  // ============================================================================

  /**
   * Obtém o estado atual da gravação
   *
   * @returns Cópia do estado atual
   */
  getState(): RecordingState {
    // Atualiza elapsedMs se estiver gravando
    if (this.state.status === 'recording' && this.state.startTime > 0) {
      this.state.elapsedMs = Date.now() - this.state.startTime;
    }

    return { ...this.state };
  }

  /**
   * Obtém o status atual da gravação
   *
   * @returns Status atual
   */
  getStatus(): RecordingStatus {
    return this.state.status;
  }

  /**
   * Verifica se está gravando
   *
   * @returns true se status é 'recording'
   */
  isRecording(): boolean {
    return this.state.status === 'recording';
  }

  /**
   * Obtém tempo decorrido em ms
   *
   * @returns Tempo decorrido desde o início da gravação
   */
  getElapsedMs(): number {
    if (this.state.status === 'recording' && this.state.startTime > 0) {
      return Date.now() - this.state.startTime;
    }
    return this.state.elapsedMs;
  }

  /**
   * Obtém tempo restante em ms
   *
   * @returns Tempo restante até o limite máximo
   */
  getRemainingMs(): number {
    return Math.max(0, this.maxDurationMs - this.getElapsedMs());
  }

  /**
   * Verifica e dispara alertas de tempo restante
   *
   * Deve ser chamado periodicamente durante a gravação (ex: a cada segundo).
   * Dispara alertas quando o tempo restante cruza os thresholds:
   * - 5 minutos restantes (warning) - Requisito 9.1
   * - 1 minuto restante (warning) - Requisito 9.2
   * - 30 segundos restantes (error/critical) - Requisito 9.3
   *
   * Cada alerta é disparado apenas uma vez por gravação.
   *
   * @returns Array de alertas disparados nesta verificação (vazio se nenhum)
   */
  checkTimeWarnings(): Alert[] {
    // Só verifica se estiver gravando
    if (this.state.status !== 'recording') {
      return [];
    }

    const remainingMs = this.getRemainingMs();
    const triggeredAlerts: Alert[] = [];

    // Verifica cada threshold em ordem decrescente de tempo
    // (5 min -> 1 min -> 30 seg)
    const thresholdKeys: TimeWarningKey[] = ['FIVE_MINUTES', 'ONE_MINUTE', 'THIRTY_SECONDS'];

    for (const key of thresholdKeys) {
      const threshold = TIME_WARNING_THRESHOLDS[key];

      // Se tempo restante cruzou o threshold e ainda não foi mostrado
      if (remainingMs <= threshold && !this.shownTimeWarnings.has(key)) {
        // Marca como mostrado para evitar duplicação
        this.shownTimeWarnings.add(key);

        // Cria e adiciona o alerta
        const alert = this.addAlert(
          TIME_WARNING_ALERT_TYPES[key],
          TIME_WARNING_MESSAGES[key]
        );

        triggeredAlerts.push(alert);

        this.logger.info('GENERAL', 'TIME_WARNING_TRIGGERED', {
          warningKey: key,
          remainingMs,
          threshold,
          alertId: alert.id,
        });
      }
    }

    return triggeredAlerts;
  }

  /**
   * Verifica se um alerta de tempo específico já foi mostrado
   *
   * @param key - Chave do alerta (FIVE_MINUTES, ONE_MINUTE, THIRTY_SECONDS)
   * @returns true se o alerta já foi mostrado
   */
  hasShownTimeWarning(key: TimeWarningKey): boolean {
    return this.shownTimeWarnings.has(key);
  }

  /**
   * Obtém conjunto de alertas de tempo já mostrados
   *
   * @returns Set com as chaves dos alertas já mostrados
   */
  getShownTimeWarnings(): Set<TimeWarningKey> {
    return new Set(this.shownTimeWarnings);
  }

  /**
   * Notifica o usuário sobre auto-finalização da gravação
   *
   * Chamado quando o tempo máximo de gravação (30 minutos) é atingido.
   * Adiciona um alerta informativo ao Side Panel notificando que a
   * gravação foi finalizada automaticamente.
   *
   * Requisitos 9.4, 9.5:
   * - 9.4: Auto-finalizar ao atingir 30 minutos
   * - 9.5: Notificar usuário via Side Panel
   *
   * @returns Alerta criado
   */
  notifyAutoFinalization(): Alert {
    const alert = this.addAlert('info', AUTO_FINALIZE_MESSAGE);

    this.logger.info('GENERAL', 'AUTO_FINALIZATION_NOTIFIED', {
      alertId: alert.id,
      elapsedMs: this.getElapsedMs(),
      maxDurationMs: this.maxDurationMs,
    });

    return alert;
  }

  /**
   * Verifica se o tempo máximo de gravação foi atingido
   *
   * @returns true se o tempo decorrido >= tempo máximo
   */
  hasReachedMaxDuration(): boolean {
    return this.getElapsedMs() >= this.maxDurationMs;
  }

  // ============================================================================
  // Métodos de Controle de Gravação
  // ============================================================================

  /**
   * Inicia a gravação
   *
   * @param startTime - Timestamp de início (padrão: Date.now())
   */
  startRecording(startTime?: number): void {
    const now = startTime ?? Date.now();

    // Limpa alertas de tempo mostrados para nova gravação
    this.shownTimeWarnings.clear();

    this.state = {
      ...createInitialState(),
      status: 'recording',
      startTime: now,
      elapsedMs: 0,
      maxDurationMs: this.maxDurationMs,
    };

    this.logger.info('GENERAL', 'RECORDING_STATE_STARTED', {
      startTime: now,
    });

    this.broadcastState();
  }

  /**
   * Para a gravação
   */
  stopRecording(): void {
    if (this.state.status !== 'recording') {
      return;
    }

    this.state.status = 'stopping';
    this.state.elapsedMs = Date.now() - this.state.startTime;

    this.logger.info('GENERAL', 'RECORDING_STATE_STOPPING', {
      elapsedMs: this.state.elapsedMs,
    });

    this.broadcastState();
  }

  /**
   * Marca gravação como finalizada
   */
  completeRecording(): void {
    this.state.status = 'stopped';
    this.state.elapsedMs = Date.now() - this.state.startTime;

    this.logger.info('GENERAL', 'RECORDING_STATE_STOPPED', {
      elapsedMs: this.state.elapsedMs,
      pagesVisited: this.state.stats.pagesVisited,
      navigationCount: this.state.navigationHistory.length,
    });

    this.broadcastState();
  }

  /**
   * Reseta o estado para valores iniciais
   */
  reset(): void {
    this.state = createInitialState();
    this.state.maxDurationMs = this.maxDurationMs;
    this.alertCounter = 0;
    this.shownTimeWarnings.clear();

    this.logger.info('GENERAL', 'RECORDING_STATE_RESET', {});

    this.broadcastState();
  }

  // ============================================================================
  // Métodos de Atualização de Stats
  // ============================================================================

  /**
   * Atualiza estatísticas de interação
   * Requisito 2.6: Incrementar contadores imediatamente
   *
   * @param stats - Estatísticas parciais a atualizar
   */
  updateStats(stats: Partial<InteractionStats>): void {
    this.state.stats = {
      ...this.state.stats,
      ...stats,
    };

    // Broadcast apenas stats (mais leve que estado completo)
    this.broadcastStats(stats);
  }

  /**
   * Incrementa contador de cliques
   */
  incrementClicks(): void {
    this.state.stats.clickCount++;
    this.broadcastStats({ clickCount: this.state.stats.clickCount });
  }

  /**
   * Incrementa contador de teclas
   */
  incrementKeystrokes(): void {
    this.state.stats.keystrokeCount++;
    this.broadcastStats({ keystrokeCount: this.state.stats.keystrokeCount });
  }

  /**
   * Incrementa contador de scrolls
   */
  incrementScrolls(): void {
    this.state.stats.scrollCount++;
    this.broadcastStats({ scrollCount: this.state.stats.scrollCount });
  }

  /**
   * Incrementa contador de formulários
   */
  incrementForms(): void {
    this.state.stats.formsInteracted++;
    this.broadcastStats({ formsInteracted: this.state.stats.formsInteracted });
  }

  /**
   * Incrementa contador de páginas visitadas
   */
  incrementPagesVisited(): void {
    this.state.stats.pagesVisited++;
    this.broadcastStats({ pagesVisited: this.state.stats.pagesVisited });
  }

  // ============================================================================
  // Métodos de Navegação
  // ============================================================================

  /**
   * Adiciona entrada de navegação ao histórico
   * Requisito 3.1: Registrar URL com timestamp relativo ao início do vídeo
   * Requisito 3.4: Classificar tipo de navegação
   * Requisito 3.6: Armazenar hash SHA-256 do HTML
   *
   * @param input - Dados da navegação
   * @returns Entrada de navegação criada
   */
  addNavigation(input: NavigationEntryInput): NavigationEntry {
    const timestamp = input.timestamp ?? Date.now();
    const videoTimestamp = this.state.startTime > 0 ? timestamp - this.state.startTime : 0;

    // Extrair título da URL se não fornecido
    const title = input.title || (() => {
      try {
        return new URL(input.url).hostname;
      } catch {
        return input.url.substring(0, 30);
      }
    })();

    const entry: NavigationEntry = {
      videoTimestamp,
      formattedTime: formatTime(videoTimestamp),
      url: truncateUrl(input.url),
      fullUrl: input.url,
      title,
      type: input.type,
      htmlHash: input.htmlHash,
    };

    this.state.navigationHistory.push(entry);

    // Incrementa páginas visitadas (exceto para navegação inicial)
    if (input.type !== 'initial') {
      this.state.stats.pagesVisited++;
      // Broadcast stats para atualizar contador de páginas no Side Panel
      this.broadcastStats({ pagesVisited: this.state.stats.pagesVisited });
    }

    this.logger.info('GENERAL', 'NAVIGATION_ADDED', {
      url: truncateUrl(input.url, 100),
      title: title?.substring(0, 50),
      type: input.type,
      videoTimestamp,
    });

    // Broadcast navegação
    this.broadcastNavigation(entry);

    return entry;
  }

  /**
   * Obtém histórico de navegação
   *
   * @returns Cópia do histórico de navegação
   */
  getNavigationHistory(): NavigationEntry[] {
    return [...this.state.navigationHistory];
  }

  // ============================================================================
  // Métodos de Contexto Forense
  // ============================================================================

  /**
   * Define o contexto forense
   * Requisitos 8.1-8.5
   *
   * @param context - Contexto forense
   */
  setForensicContext(context: ForensicContext): void {
    this.state.forensicContext = { ...context };

    this.logger.info('GENERAL', 'FORENSIC_CONTEXT_SET', {
      hasLocation: !!context.location,
      connectionType: context.connectionType,
    });

    this.broadcastState();
  }

  /**
   * Obtém o contexto forense atual
   *
   * @returns Contexto forense ou null
   */
  getForensicContext(): ForensicContext | null {
    return this.state.forensicContext ? { ...this.state.forensicContext } : null;
  }

  // ============================================================================
  // Métodos de Alertas
  // ============================================================================

  /**
   * Adiciona um alerta
   * Requisitos 9.1-9.3
   *
   * @param type - Tipo do alerta
   * @param message - Mensagem do alerta
   * @returns Alerta criado
   */
  addAlert(type: AlertType, message: string): Alert {
    this.alertCounter++;

    const alert: Alert = {
      id: `alert-${this.alertCounter}-${Date.now()}`,
      type,
      message,
      timestamp: Date.now(),
    };

    this.state.alerts.push(alert);

    this.logger.info('GENERAL', 'ALERT_ADDED', {
      id: alert.id,
      type,
      message,
    });

    // Broadcast alerta
    this.broadcastAlert(alert);

    return alert;
  }

  /**
   * Remove um alerta pelo ID
   *
   * @param alertId - ID do alerta a remover
   */
  removeAlert(alertId: string): void {
    this.state.alerts = this.state.alerts.filter((a) => a.id !== alertId);
    this.broadcastState();
  }

  /**
   * Limpa todos os alertas
   */
  clearAlerts(): void {
    this.state.alerts = [];
    this.broadcastState();
  }

  // ============================================================================
  // Métodos de Upload Progress
  // ============================================================================

  /**
   * Atualiza progresso de upload
   * Requisito 7.8
   *
   * @param progress - Progresso parcial a atualizar
   */
  updateUploadProgress(progress: Partial<UploadProgress>): void {
    this.state.uploadProgress = {
      ...this.state.uploadProgress,
      ...progress,
    };

    this.broadcastUploadProgress(this.state.uploadProgress);
  }

  /**
   * Define status do upload
   *
   * @param status - Novo status
   */
  setUploadStatus(status: UploadStatus): void {
    this.state.uploadProgress.status = status;
    this.broadcastUploadProgress(this.state.uploadProgress);
  }

  // ============================================================================
  // Métodos de Broadcast
  // ============================================================================

  /**
   * Faz broadcast do estado completo para Side Panel e Content Script
   */
  broadcastState(): void {
    if (!this.autoBroadcast) {
      return;
    }

    this.sendMessage({
      type: MESSAGE_TYPE_STATE_UPDATE,
      payload: this.getState(),
    });
  }

  /**
   * Faz broadcast de atualização de stats
   */
  private broadcastStats(stats: Partial<InteractionStats>): void {
    if (!this.autoBroadcast) {
      return;
    }

    this.sendMessage({
      type: MESSAGE_TYPE_STATS_UPDATE,
      payload: stats,
    });
  }

  /**
   * Faz broadcast de nova navegação
   */
  private broadcastNavigation(entry: NavigationEntry): void {
    if (!this.autoBroadcast) {
      return;
    }

    this.sendMessage({
      type: MESSAGE_TYPE_NAVIGATION_UPDATE,
      payload: entry,
    });
  }

  /**
   * Faz broadcast de alerta
   */
  private broadcastAlert(alert: Alert): void {
    if (!this.autoBroadcast) {
      return;
    }

    this.sendMessage({
      type: MESSAGE_TYPE_ALERT,
      payload: alert,
    });
  }

  /**
   * Faz broadcast de progresso de upload
   */
  private broadcastUploadProgress(progress: UploadProgress): void {
    if (!this.autoBroadcast) {
      return;
    }

    this.sendMessage({
      type: MESSAGE_TYPE_UPLOAD_PROGRESS,
      payload: progress,
    });
  }

  /**
   * Envia mensagem via chrome.runtime.sendMessage
   */
  private sendMessage(message: { type: string; payload: unknown }): void {
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.sendMessage(message).catch(() => {
        // Ignora erros de comunicação (Side Panel pode não estar conectado)
      });
    }
  }
}

// ============================================================================
// Instância Singleton
// ============================================================================

/** Instância singleton do RecordingStateManager */
let recordingStateManagerInstance: RecordingStateManager | null = null;

/**
 * Obtém instância singleton do RecordingStateManager
 *
 * @param config - Configuração opcional para nova instância
 * @returns Instância do RecordingStateManager
 */
export function getRecordingStateManager(
  config?: RecordingStateManagerConfig
): RecordingStateManager {
  recordingStateManagerInstance ??= new RecordingStateManager(config);
  return recordingStateManagerInstance;
}

/**
 * Reseta instância singleton (para testes)
 */
export function resetRecordingStateManager(): void {
  recordingStateManagerInstance = null;
}

export default RecordingStateManager;
