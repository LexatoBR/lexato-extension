/**
 * @fileoverview Exports centralizados do módulo de notificações
 *
 * Facilita o uso do sistema de notificações em toda a extensão
 *
 * @module Notifications
 */

// Serviço principal
export { NotificationService, notificationService } from './notification-service';

// Tipos
export type {
  // Tipos do backend
  NotificationCategory,
  NotificationType,
  NotificationChannel,
  NotificationPriorityLevel,
  NotificationPreferences,
  NotificationHistory,

  // Tipos da extensão
  ExtensionNotificationPayload,
  NotificationServiceState,
  ExtensionNotificationSettings,
  NotificationEvent,
  NotificationHistoryResponse,
  NotificationHistoryOptions,
} from './notification-types';

// Enums e constantes
export {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_TYPE,
  NOTIFICATION_CHANNEL,
  NOTIFICATION_PRIORITY,
  NOTIFICATION_TYPE_TO_CATEGORY,
  NOTIFICATION_ICON_MAP,
  NOTIFICATION_BADGE_COLOR,
  isNotificationCritical,
  isNotificationBatchable,
} from './notification-types';