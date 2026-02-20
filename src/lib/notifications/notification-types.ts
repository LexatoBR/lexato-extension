/**
 * @fileoverview Tipos TypeScript para o sistema de notificações na extensão Chrome
 *
 * Exporta tipos essenciais do backend e adiciona tipos específicos da extensão
 * para gerenciamento de notificações no contexto do Chrome Extension.
 *
 * @module NotificationTypes
 */

// Re-exporta tipos essenciais do backend
export {
  // Enums
  NOTIFICATION_CATEGORY,
  NOTIFICATION_TYPE,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_PRIORITY,

  // Types
  type NotificationCategory,
  type NotificationType,
  type NotificationChannel,
  type NotificationPriorityLevel,

  // Interfaces
  type NotificationPreferences,
  type NotificationHistory,

  // Utility functions
  isNotificationCritical,
  isNotificationBatchable,
  NOTIFICATION_TYPE_TO_CATEGORY,
} from '../../../../../backend/src/types/notification.types';

// =============================================================================
// TIPOS ESPECÍFICOS DA EXTENSÃO
// =============================================================================

/**
 * Payload simplificado para notificações na extensão
 *
 * Contém apenas os campos essenciais para exibição e ação
 */
export interface ExtensionNotificationPayload {
  /** ID único da notificação */
  notificationId: string;

  /** Tipo de notificação */
  type: import('../../../../../backend/src/types/notification.types').NotificationType;

  /** Categoria da notificação */
  category: import('../../../../../backend/src/types/notification.types').NotificationCategory;

  /** Prioridade da notificação */
  priority: import('../../../../../backend/src/types/notification.types').NotificationPriorityLevel;

  /** Conteúdo da notificação */
  content: {
    /** Título da notificação */
    title: string;
    /** Mensagem da notificação */
    message: string;
    /** URL de ação (opcional) */
    actionUrl?: string;
    /** Texto do botão de ação (opcional) */
    actionText?: string;
  };

  /** Metadados relacionados */
  metadata?: {
    /** ID da evidência relacionada */
    evidenceId?: string;
    /** ID do pagamento relacionado */
    paymentId?: string;
    /** UUID da evidência para verificação */
    evidenceUuid?: string;
  };

  /** Se a notificação foi lida */
  read: boolean;

  /** Timestamp de criação */
  createdAt: string;
}

/**
 * Estado do serviço de notificações
 */
export interface NotificationServiceState {
  /** Se o serviço está inicializado */
  initialized: boolean;

  /** Se está conectado para receber notificações real-time */
  connected: boolean;

  /** Contador de notificações não lidas */
  unreadCount: number;

  /** Última vez que sincronizou com o backend */
  lastSyncAt?: string;

  /** Se está em processo de sincronização */
  syncing: boolean;

  /** Erro da última tentativa de sincronização */
  lastSyncError?: string;
}

/**
 * Configurações de notificação da extensão
 */
export interface ExtensionNotificationSettings {
  /** Se as notificações estão habilitadas */
  enabled: boolean;

  /** Se deve mostrar notificações do sistema (chrome.notifications) */
  showSystemNotifications: boolean;

  /** Se deve mostrar badge no ícone da extensão */
  showBadge: boolean;

  /** Se deve tocar som para notificações críticas */
  playSoundForCritical: boolean;

  /** Tempo de vida das notificações do sistema em segundos */
  systemNotificationTTL: number;

  /** Limite de notificações a armazenar localmente */
  localStorageLimit: number;
}

/**
 * Evento de notificação para comunicação entre componentes
 */
export interface NotificationEvent {
  /** Tipo do evento */
  type: 'NEW' | 'READ' | 'CLEARED' | 'CLICKED';

  /** Payload da notificação */
  notification?: ExtensionNotificationPayload;

  /** IDs das notificações afetadas (para READ/CLEARED em lote) */
  notificationIds?: string[];

  /** Timestamp do evento */
  timestamp: string;
}

/**
 * Resposta da API de histórico de notificações
 */
export interface NotificationHistoryResponse {
  /** Lista de notificações */
  notifications: ExtensionNotificationPayload[];

  /** Total de notificações */
  total: number;

  /** Total de não lidas */
  unreadCount: number;

  /** Token para próxima página */
  nextPageToken?: string;
}

/**
 * Opções para buscar histórico de notificações
 */
export interface NotificationHistoryOptions {
  /** Limite de resultados */
  limit?: number;

  /** Token de paginação */
  pageToken?: string;

  /** Filtrar por categoria */
  category?: import('../../../../../backend/src/types/notification.types').NotificationCategory;

  /** Filtrar apenas não lidas */
  unreadOnly?: boolean;

  /** Data de início (ISO string) */
  startDate?: string;

  /** Data de fim (ISO string) */
  endDate?: string;
}

/**
 * Mapeia tipo de notificação para ícone da extensão
 */
export const NOTIFICATION_ICON_MAP: Record<
  import('../../../../../backend/src/types/notification.types').NotificationCategory,
  string
> = {
  EVIDENCE: 'camera',
  PAYMENT: 'credit-card',
  SECURITY: 'shield',
  SYSTEM: 'settings',
  MARKETING: 'megaphone',
  ACCOUNT: 'user',
};

/**
 * Mapeia prioridade para cor do badge
 */
export const NOTIFICATION_BADGE_COLOR: Record<
  import('../../../../../backend/src/types/notification.types').NotificationPriorityLevel,
  string
> = {
  CRITICAL: '#FF0000', // Vermelho
  HIGH: '#FFA500',     // Laranja
  NORMAL: '#0066CC',   // Azul
  LOW: '#808080',      // Cinza
};