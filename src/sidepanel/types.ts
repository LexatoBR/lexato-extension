/**
 * Tipos para o Side Panel de gravação de vídeo
 *
 * Define interfaces para estado da gravação, mensagens e comunicação
 * entre Side Panel e Service Worker.
 *
 * @module SidePanelTypes

 */

// ============================================================================
// Chunks de Vídeo e Integridade
// ============================================================================

/**
 * Status de um chunk de vídeo
 */
export type ChunkStatus = 'pending' | 'hashing' | 'completed' | 'error';

/**
 * Representa um chunk de vídeo com seu hash de integridade
 * Conformidade ISO 27037: Cada chunk possui hash SHA-256 verificável
 */
export interface VideoChunk {
  /** Número sequencial do chunk */
  index: number;
  /** Hash SHA-256 do chunk (null se ainda calculando) */
  hash: string | null;
  /** Tamanho do chunk em bytes */
  sizeBytes: number;
  /** Timestamp de criação do chunk */
  timestamp: number;
  /** Status do chunk */
  status: ChunkStatus;
}

// ============================================================================
// Qualidade de Conexão
// ============================================================================

/**
 * Nível de qualidade da conexão
 */
export type QualityLevel = 'excellent' | 'good' | 'fair' | 'poor' | 'offline';

/**
 * Tipo de conexão de rede
 */
export type ConnectionType = 'wifi' | '4g' | '3g' | '2g' | 'ethernet' | 'unknown';

/**
 * Estado da qualidade de conexão
 * Conformidade ISO 27037: Monitoramento contínuo da qualidade da evidência
 */
export interface ConnectionQualityState {
  /** Nível de qualidade atual */
  level: QualityLevel;
  /** Tipo de conexão */
  type: ConnectionType;
  /** Latência em ms (se disponível) */
  latencyMs?: number;
  /** Velocidade de upload em Mbps (se disponível) */
  uploadSpeedMbps?: number;
  /** Se há perda de pacotes */
  hasPacketLoss?: boolean;
  /** Timestamp da última verificação */
  lastChecked: number;
}

// ============================================================================
// Contexto Forense Aprimorado
// ============================================================================

/**
 * Contexto forense completo da gravação
 * Conformidade ISO 27037: Registro completo de metadados da evidência
 */
export interface EnhancedForensicContext {
  /** URL atual sendo capturada */
  currentUrl: string;
  /** Título da página atual */
  pageTitle?: string;
  /** Timestamp de início (ISO 8601) */
  startedAt: string;
  /** Timezone do usuário (ex: "America/Sao_Paulo") */
  timezone: string;
  /** Offset do timezone (ex: "-03:00") */
  timezoneOffset: string;
  /** Resolução da captura */
  resolution: {
    width: number;
    height: number;
  };
  /** Frame rate da gravação */
  frameRate?: number;
  /** Tipo de conexão */
  connectionType?: string;
  /** Localização (se disponível) */
  location?: string;
  /** User Agent do navegador */
  userAgent?: string;
}

// ============================================================================
// Estatísticas de Interação
// ============================================================================

/**
 * Estatísticas de interação do usuário durante gravação
 * Requisitos 2.1-2.5
 */
export interface InteractionStats {
  /** Número de páginas visitadas */
  pagesVisited: number;
  /** Número de cliques */
  clickCount: number;
  /** Número de teclas pressionadas */
  keystrokeCount: number;
  /** Número de scrolls */
  scrollCount: number;
  /** Número de formulários interagidos */
  formsInteracted: number;
}

// ============================================================================
// Navegação
// ============================================================================

/**
 * Tipo de navegação
 * Requisito 3.4
 */
export type NavigationType =
  | 'initial'
  | 'link-click'
  | 'form-submit'
  | 'history-back'
  | 'history-forward'
  | 'redirect';

/**
 * Entrada no histórico de navegação
 * Requisitos 3.1-3.6
 */
export interface NavigationEntry {
  /** Timestamp relativo ao início do vídeo (ms) */
  videoTimestamp: number;
  /** Timestamp formatado (MM:SS) */
  formattedTime: string;
  /** URL de destino (truncada para exibição) */
  url: string;
  /** URL completa (para tooltip) */
  fullUrl: string;
  /** Título da página (opcional, para exibição no Side Panel) */
  title?: string;
  /** Tipo de navegação */
  type: NavigationType;
  /** Hash SHA-256 do HTML capturado */
  htmlHash: string;
}

// ============================================================================
// Contexto Forense
// ============================================================================

/**
 * Contexto forense exibido no Side Panel
 * Requisitos 8.1-8.5
 */
export interface ForensicContext {
  /** Localização (se disponível) */
  location?: string;
  /** Tipo de conexão (Wi-Fi, 4G, etc.) */
  connectionType?: string;
  /** Dispositivo/browser */
  device?: string;
  /** Timestamp de início (ISO 8601) */
  startedAt: string;
}

// ============================================================================
// Alertas
// ============================================================================

/**
 * Tipo de alerta
 */
export type AlertType = 'warning' | 'info' | 'error';

/**
 * Alerta exibido no Side Panel
 * Requisitos 9.1-9.3
 */
export interface Alert {
  /** ID único do alerta */
  id: string;
  /** Tipo do alerta */
  type: AlertType;
  /** Mensagem do alerta */
  message: string;
  /** Timestamp do alerta */
  timestamp: number;
}

// ============================================================================
// Progresso de Upload
// ============================================================================

/**
 * Status do upload
 */
export type UploadStatus = 'idle' | 'uploading' | 'completing' | 'completed' | 'failed';

/**
 * Progresso do upload de chunks
 * Requisito 7.8
 */
export interface UploadProgress {
  /** Chunks já enviados */
  chunksUploaded: number;
  /** Total de chunks */
  chunksTotal: number;
  /** Bytes já enviados */
  bytesUploaded: number;
  /** Total de bytes */
  bytesTotal: number;
  /** Status atual */
  status: UploadStatus;
}

// ============================================================================
// Estado da Gravação
// ============================================================================

/**
 * Status da gravação
 * Requisito 5.3: Estados simplificados (sem 'paused')
 * - idle: Aguardando início
 * - preparing: Preparação forense em andamento (countdown)
 * - recording: Gravação ativa
 * - stopping: Finalizando gravação
 * - stopped: Gravação finalizada
 */
export type RecordingStatus = 'idle' | 'preparing' | 'recording' | 'stopping' | 'stopped';

/**
 * Estado completo da gravação
 * Usado pelo Side Panel para exibir informações
 */
export interface RecordingState {
  /** Status atual da gravação */
  status: RecordingStatus;
  /** Timestamp de início (ms desde epoch) */
  startTime: number;
  /** Tempo decorrido em ms */
  elapsedMs: number;
  /** Duração máxima em ms (30 minutos) */
  maxDurationMs: number;
  /** Estatísticas de interação */
  stats: InteractionStats;
  /** Histórico de navegação */
  navigationHistory: NavigationEntry[];
  /** Contexto forense */
  forensicContext: ForensicContext | null;
  /** Alertas ativos */
  alerts: Alert[];
  /** Progresso de upload */
  uploadProgress: UploadProgress;
}

// ============================================================================
// Mensagens Side Panel ↔ Service Worker
// ============================================================================

/**
 * Mensagem de atualização de estado
 */
export interface RecordingStateUpdateMessage {
  type: 'RECORDING_STATE_UPDATE';
  payload: RecordingState;
}

/**
 * Mensagem de atualização de estatísticas
 */
export interface StatsUpdateMessage {
  type: 'STATS_UPDATE';
  payload: Partial<InteractionStats>;
}

/**
 * Mensagem de atualização de navegação
 */
export interface NavigationUpdateMessage {
  type: 'NAVIGATION_UPDATE';
  payload: NavigationEntry;
}

/**
 * Mensagem de alerta
 */
export interface AlertMessage {
  type: 'ALERT';
  payload: Alert;
}

/**
 * Mensagem de progresso de upload
 */
export interface UploadProgressMessage {
  type: 'UPLOAD_PROGRESS';
  payload: UploadProgress;
}

/**
 * União de todas as mensagens do Service Worker para o Side Panel
 */
export type SidePanelMessage =
  | RecordingStateUpdateMessage
  | StatsUpdateMessage
  | NavigationUpdateMessage
  | AlertMessage
  | UploadProgressMessage;

// ============================================================================
// Mensagens Side Panel → Service Worker
// ============================================================================

/**
 * Mensagem de conexão do Side Panel
 */
export interface SidePanelConnectedMessage {
  type: 'SIDEPANEL_CONNECTED';
}

/**
 * Mensagem para parar gravação
 */
export interface StopRecordingMessage {
  type: 'STOP_RECORDING';
}

/**
 * Mensagem para reiniciar gravação
 */
export interface RestartRecordingMessage {
  type: 'RESTART_RECORDING';
}

/**
 * Mensagem para cancelar gravação
 */
export interface CancelRecordingMessage {
  type: 'CANCEL_RECORDING';
}

/**
 * União de todas as mensagens do Side Panel para o Service Worker
 */
export type SidePanelOutgoingMessage =
  | SidePanelConnectedMessage
  | StopRecordingMessage
  | RestartRecordingMessage
  | CancelRecordingMessage;
