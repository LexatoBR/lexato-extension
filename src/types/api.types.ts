/**
 * Tipos para comunicação com a API do backend
 *
 * Define interfaces para mensagens, respostas e estado de captura
 *
 * @module APITypes
 */

import type { CaptureType, StorageType, CaptureStatus, CaptureData } from './capture.types';

/**
 * Tipos de mensagens suportadas pelo Service Worker
 */
export type MessageType =
  // Mensagens de sistema
  | 'PING'
  | 'DIAGNOSTIC_PING'
  | 'GET_VERSION'
  // Mensagens de autenticação
  | 'GET_AUTH_STATUS'
  | 'LOGIN'
  | 'GOOGLE_LOGIN'
  | 'LOGOUT'
  | 'REFRESH_TOKEN'
  | 'AUTH_REFRESH_TOKEN'
  // Mensagens de captura
  | 'START_CAPTURE'
  | 'STOP_CAPTURE'
  | 'CANCEL_CAPTURE'
  | 'CAPTURE_CANCEL' // Alias usado pelo popup
  | 'GET_CAPTURE_STATUS'
  | 'CAPTURE_GET_RECENT'
  | 'CAPTURE_VIEWPORT'
  | 'CAPTURE_PROGRESS'
  | 'CAPTURE_COMPLETE'
  // Mensagens de créditos
  | 'GET_CREDITS'
  | 'CREDITS_REFRESH'
  // Mensagens de upload
  | 'GET_PRESIGNED_URL'
  | 'NOTIFY_UPLOAD_COMPLETE'
  // Mensagens de certificação
  | 'GET_CERTIFICATION_STATUS'
  // Mensagens de evidências pendentes
  | 'GET_PENDING_EVIDENCES'
  // Mensagens do content script
  | 'VERIFY_PAGE_LOADED'
  | 'ACTIVATE_LOCKDOWN'
  | 'DEACTIVATE_LOCKDOWN'
  | 'CAPTURE_SCREENSHOT'
  | 'START_VIDEO_RECORDING'
  | 'STOP_VIDEO_RECORDING'
  // Mensagens de isolamento de extensões
  | 'GET_ISOLATION_STATUS'
  | 'PREVIEW_ISOLATION'
  | 'ACTIVATE_ISOLATION'
  | 'DEACTIVATE_ISOLATION'
  | 'FORCE_RESTORE_EXTENSIONS'
  | 'CHECK_ISOLATION_VIOLATIONS'
  | 'RESET_ISOLATION'
  // Mensagens de preview (apenas visual, sem fins legais)
  | 'GET_TAB_THUMBNAIL'
  // Mensagens internas de vídeo
  | 'chunk-ready'
  | 'recording-stopped'
  | 'START_COUNTDOWN'
  | 'COUNTDOWN_COMPLETE'
  // Mensagens de preparação forense
  | 'FORENSIC_PREPARATION_STEP'
  | 'FORENSIC_PREPARATION_COMPLETE'
  | 'FORENSIC_PREPARATION_TIMEOUT'
  | 'FORENSIC_PREPARATION_ERROR'
  // Mensagens de preview e aprovação
  | 'GET_PREVIEW_DATA'
  | 'APPROVE_EVIDENCE'
  | 'DISCARD_EVIDENCE'
  // Mensagens do InteractionTracker (Requisitos 2.6, 2.7)
  | 'INTERACTION_STATS_UPDATE'
  | 'INTERACTION_EVENT'
  // Mensagens de auto-finalização (Requisitos 9.4, 9.5)
  | 'AUTO_FINALIZATION_NOTIFICATION'
  // Mensagens do Side Panel (Requisitos 6.1-6.5)
  | 'STOP_RECORDING'
  | 'CAPTURE_STOP_VIDEO'
  | 'RESTART_RECORDING'
  | 'CANCEL_RECORDING'
  | 'SIDEPANEL_CONNECTED'
  // Mensagens de sincronização content script
  | 'CONTENT_SCRIPT_READY_FOR_CAPTURE'
  // Mensagens da Capture Bridge (obtenção de streamId via janela intermediária)
  | 'CAPTURE_BRIDGE_STREAM_ID'
  | 'CAPTURE_BRIDGE_ERROR'
  // Mensagem do Popup para abrir Side Panel no modo vídeo
  | 'OPEN_SIDEPANEL_FOR_VIDEO'
  // Mensagem de concessão de permissões
  | 'PERMISSIONS_GRANTED';

/**
 * Estrutura de mensagem recebida
 */
export interface Message<T = unknown> {
  /** Tipo da mensagem */
  type: MessageType;
  /** Payload da mensagem */
  payload?: T;
  /** ID de correlação para rastreabilidade */
  correlationId?: string;
}

/**
 * Estrutura de resposta padrão
 * Permite propriedades extras para respostas específicas de cada handler
 */
export interface MessageResponse<T = unknown> {
  /** Se a operação foi bem-sucedida */
  success: boolean;
  /** Dados da resposta */
  data?: T;
  /** Mensagem de erro (se falha) */
  error?: string;
  /** Código de erro (se falha) */
  errorCode?: string;
  /** ID de correlação */
  correlationId?: string;
  /** Propriedades extras para respostas específicas */
  [key: string]: unknown;
}

/**
 * Payload para iniciar captura
 */
export interface StartCapturePayload {
  /** Tipo de captura */
  type: CaptureType;
  /** Tipo de armazenamento */
  storageType: StorageType;
  /** ID da aba para capturar */
  tabId?: number;
}

/**
 * Payload para login
 */
export interface LoginPayload {
  /** Email do usuário */
  email: string;
  /** Senha do usuário */
  password: string;
  /** Código MFA (se necessário) */
  mfaCode?: string;
  /** Sessão MFA (se continuando autenticação) */
  mfaSession?: string;
}

/**
 * Payload para presigned URL
 */
export interface PresignedUrlPayload {
  /** Tipo de arquivo */
  fileType: 'screenshot' | 'video' | 'html' | 'metadata' | 'hashes';
  /** Tamanho do arquivo em bytes */
  fileSize: number;
  /** Tipo de armazenamento */
  storageType: StorageType;
  /** ID da captura */
  captureId: string;
}

/**
 * Resposta de presigned URL
 */
export interface PresignedUrlResponse {
  /** URL para upload */
  uploadUrl: string;
  /** URL para download (após upload) */
  downloadUrl: string;
  /** Campos adicionais para o upload */
  fields?: Record<string, string>;
  /** Tempo de expiração da URL */
  expiresAt: number;
}

/**
 * Estado de captura em andamento
 */
export interface CaptureState {
  /** ID da captura */
  id: string;
  /** Tipo de captura */
  type: CaptureType;
  /** Tipo de armazenamento */
  storageType: StorageType;
  /** Status atual */
  status: CaptureStatus;
  /** ID da aba sendo capturada */
  tabId: number;
  /** ID da janela sendo capturada */
  windowId?: number;
  /** URL da página */
  url: string;
  /** Título da página */
  title: string;
  /** Timestamp de início */
  startedAt: number;
  /** Progresso percentual (0-100) */
  progress: number;
  /** Mensagem de progresso */
  progressMessage: string;
  /** Hash da cadeia PISA */
  pisaHashCadeia?: string;
  /** Hash do screenshot */
  screenshotHash?: string;
  /** Hash do vídeo */
  videoHash?: string;
  /** Hash do HTML */
  htmlHash?: string;
  /** Hash dos metadados */
  metadataHash?: string;
  /** URL do screenshot no S3 */
  screenshotUrl?: string;
  /** 
   * URL do HTML no S3 (compatibilidade)
   * Para vídeos, use htmlUrls para estrutura completa
   */
  htmlUrl?: string;
  /**
   * URLs dos HTMLs capturados (vídeos)
   * Estrutura completa com inicial, final e navegações
   */
  htmlUrls?: {
    initial: string;
    final: string;
    navigations: string[];
  };
  /** URL do vídeo no S3 */
  videoUrl?: string;
  /** URL dos metadados no S3 */
  metadataUrl?: string;
  /** Erro (se houver) */
  error?: string;
  /** Resultado do Timestamp ICP-Brasil */
  timestampResult?: import('../lib/evidence-pipeline/types').TimestampResult;
}

/**
 * Dados persistidos de captura para recuperação
 */
export interface PersistedCaptureState extends CaptureState {
  /** Dados parciais coletados */
  partialData?: {
    screenshotData?: string;
    htmlContent?: string;
    metadata?: Record<string, unknown>;
    hashes?: Record<string, string>;
  };
  /** Timestamp da última atualização */
  lastUpdatedAt: number;
}

/**
 * Resposta de status de autenticação
 */
export interface AuthStatusResponse {
  /** Se usuário está autenticado */
  isAuthenticated: boolean;
  /** Dados do usuário (se autenticado) */
  user?: {
    id: string;
    email: string;
    name?: string | undefined;
    accountType: 'individual' | 'enterprise';
    credits: number;
    mfaEnabled: boolean;
    /** Nome do plano atual */
    planName?: string | undefined;
    /** Créditos utilizados no mês atual */
    usedThisMonth?: number | undefined;
  };
}

/**
 * Resposta de créditos
 */
export interface CreditsResponse {
  /** Saldo atual de créditos */
  balance: number;
  /** Créditos usados no mês */
  usedThisMonth: number;
  /** Limite mensal (se aplicável) */
  monthlyLimit?: number;
}

/**
 * Resposta de capturas recentes
 */
export interface RecentCapturesResponse {
  /** Lista de capturas */
  captures: CaptureData[];
  /** Total de capturas */
  total: number;
  /** Se há mais capturas */
  hasMore: boolean;
}

/**
 * Status de certificação
 */
export interface CertificationStatusResponse {
  /** ID da captura */
  captureId: string;
  /** Status geral */
  status: 'pending' | 'processing' | 'completed' | 'failed';
  /** Status por nível */
  levels: {
    /** Nível 1 - Certificação local */
    level1: { status: 'pending' | 'completed' | 'failed'; hash?: string };
    /** Nível 2 - Certificação servidor */
    level2: { status: 'pending' | 'completed' | 'failed'; hash?: string; timestamp?: string };
    /** Nível 3 - ICP-Brasil */
    level3: { status: 'pending' | 'processing' | 'completed' | 'failed'; timestamp?: string };
    /** Nível 4 - Blockchain */
    level4: {
      status: 'pending' | 'processing' | 'completed' | 'partial' | 'failed';
      polygon?: { txHash?: string; blockNumber?: number };
      arbitrum?: { txHash?: string; blockNumber?: number };
    };
    /** Nível 5 - PDF */
    level5: { status: 'pending' | 'processing' | 'completed' | 'failed'; pdfUrl?: string };
  };
  /** Mensagem de erro (se falha) */
  error?: string;
}
