/**
 * @fileoverview Cliente Supabase Realtime para notificações em tempo real
 *
 * Substitui o WebSocketClient nativo por Supabase Realtime Channels.
 * Mantém interface compatível com o código existente.
 *
 * @module SupabaseRealtimeClient
 * @author Equipe Lexato
 * @created 2026-02-02
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase/client';
import { logger } from '../logger';
import { captureException } from '../sentry';
import type { ExtensionNotificationPayload } from './notification-types';
import type { NotificationType } from './notification-types';

// =============================================================================
// TIPOS
// =============================================================================

/**
 * Estado da conexão Realtime
 * Compatível com WebSocketState para facilitar migração
 */
export type RealtimeState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'CLOSED';

/**
 * Mensagem recebida do Supabase Realtime (Broadcast)
 */
interface RealtimeNotificationMessage {
  notificationId: string;
  type: NotificationType;
  category: string;
  priority: 'normal' | 'high' | 'urgent';
  content: {
    title: string;
    message: string;
    actionUrl?: string;
    actionText?: string;
  };
  metadata?: {
    evidenceId?: string;
    paymentId?: string;
    evidenceUuid?: string;
  };
  createdAt: string;
}

/**
 * Opções de configuração do cliente Realtime
 */
export interface SupabaseRealtimeClientOptions {
  /** ID do usuário para subscrição personalizada */
  userId: string;
  /** Timeout para conexão em ms (padrão: 10000) */
  connectionTimeout?: number;
}

/**
 * Callback para quando uma notificação é recebida
 */
export type NotificationCallback = (notification: ExtensionNotificationPayload) => void;

/**
 * Callback para mudanças de estado
 */
export type StateChangeCallback = (state: RealtimeState) => void;

// =============================================================================
// CLASSE PRINCIPAL
// =============================================================================

/**
 * Cliente Supabase Realtime para notificações push
 *
 * Usa Broadcast Channel para envio de notificações em tempo real sem
 * necessidade de tabela no banco. Backend usa SDK do Supabase para broadcast.
 *
 * @example
 * ```typescript
 * const client = createSupabaseRealtimeClient({ userId: 'user-123' });
 * client.onNotification((notification) => {
 *   console.log('Nova notificação:', notification);
 * });
 * await client.connect();
 * ```
 */
export class SupabaseRealtimeClient {
  private channel: RealtimeChannel | null = null;
  private state: RealtimeState = 'DISCONNECTED';
  private notificationCallbacks: Set<NotificationCallback> = new Set();
  private stateChangeCallbacks: Set<StateChangeCallback> = new Set();
  private userId: string;
  private connectionTimeout: number;
  private connectionTimeoutId: NodeJS.Timeout | null = null;

  constructor(options: SupabaseRealtimeClientOptions) {
    this.userId = options.userId;
    this.connectionTimeout = options.connectionTimeout ?? 10000;
  }

  /**
   * Conecta ao Supabase Realtime Channel
   * Cria um canal específico para o usuário: `notifications:user-{userId}`
   */
  async connect(): Promise<void> {
    if (this.state === 'CONNECTED' || this.state === 'CONNECTING') {
      logger.warn('[REALTIME] Já conectado ou conectando');
      return;
    }

    this.setState('CONNECTING');

    try {
      const supabase = getSupabaseClient();
      const channelName = `notifications:user-${this.userId}`;

      logger.info('[REALTIME] Conectando ao canal', { channelName });

      // Criar canal Broadcast
      this.channel = supabase.channel(channelName, {
        config: {
          broadcast: { self: false }, // Não receber próprias mensagens
        },
      });

      // Subscrever ao evento 'notification' via Broadcast
      this.channel.on('broadcast', { event: 'notification' }, (payload: { payload: RealtimeNotificationMessage }) => {
        logger.info('[REALTIME] Notificação recebida via broadcast', { payload });
        this.handleBroadcastMessage(payload);
      });

      // Timeout de conexão
      this.connectionTimeoutId = setTimeout(() => {
        if (this.state === 'CONNECTING') {
          logger.error('[REALTIME] Timeout ao conectar');
          this.disconnect();
          this.setState('DISCONNECTED');
        }
      }, this.connectionTimeout);

      // Subscribe ao canal
      this.channel.subscribe((status) => {
        if (this.connectionTimeoutId) {
          clearTimeout(this.connectionTimeoutId);
          this.connectionTimeoutId = null;
        }

        logger.info('[REALTIME] Status de subscrição', { status });

        if (status === 'SUBSCRIBED') {
          this.setState('CONNECTED');
          logger.info('[REALTIME] Conectado com sucesso', { channelName });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          logger.error('[REALTIME] Erro ao conectar', { status });
          this.setState('DISCONNECTED');
          captureException(new Error(`Supabase Realtime error: ${status}`));
        } else if (status === 'CLOSED') {
          this.setState('CLOSED');
        }
      });
    } catch (error) {
      logger.error('[REALTIME] Erro ao conectar', error);
      this.setState('DISCONNECTED');
      captureException(error);
      throw error;
    }
  }

  /**
   * Desconecta do canal Realtime
   */
  async disconnect(): Promise<void> {
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }

    if (this.channel) {
      logger.info('[REALTIME] Desconectando do canal');
      await this.channel.unsubscribe();
      this.channel = null;
    }

    this.setState('DISCONNECTED');
  }

  /**
   * Registra callback para notificações recebidas
   */
  onNotification(callback: NotificationCallback): void {
    this.notificationCallbacks.add(callback);
  }

  /**
   * Remove callback de notificação
   */
  offNotification(callback: NotificationCallback): void {
    this.notificationCallbacks.delete(callback);
  }

  /**
   * Registra callback para mudanças de estado
   */
  onStateChange(callback: StateChangeCallback): void {
    this.stateChangeCallbacks.add(callback);
  }

  /**
   * Remove callback de mudança de estado
   */
  offStateChange(callback: StateChangeCallback): void {
    this.stateChangeCallbacks.delete(callback);
  }

  /**
   * Obtém estado atual da conexão
   */
  getState(): RealtimeState {
    return this.state;
  }

  /**
   * Verifica se está conectado
   */
  isConnected(): boolean {
    return this.state === 'CONNECTED';
  }

  // =============================================================================
  // MÉTODOS PRIVADOS
  // =============================================================================

  /**
   * Atualiza estado e notifica callbacks
   */
  private setState(newState: RealtimeState): void {
    if (this.state === newState) {return;}

    const oldState = this.state;
    this.state = newState;

    logger.info('[REALTIME] Mudança de estado', {
      from: oldState,
      to: newState,
    });

    // Notificar todos os callbacks
    this.stateChangeCallbacks.forEach((callback) => {
      try {
        callback(newState);
      } catch (error) {
        logger.error('[REALTIME] Erro em callback de estado', error);
      }
    });
  }

  /**
   * Processa mensagem recebida via Broadcast
   */
  private handleBroadcastMessage(payload: { payload: RealtimeNotificationMessage }): void {
    try {
      const message = payload.payload;

      logger.info('[REALTIME] Processando notificação', { message });

      // Mapear priority para o formato correto (uppercase)
      const priorityMap: Record<string, 'NORMAL' | 'HIGH' | 'CRITICAL'> = {
        normal: 'NORMAL',
        high: 'HIGH',
        urgent: 'CRITICAL',
        critical: 'CRITICAL',
      };

      // Transformar para formato ExtensionNotificationPayload
      const notification: ExtensionNotificationPayload = {
        notificationId: message.notificationId,
        type: message.type,
        category: message.category as ExtensionNotificationPayload['category'],
        priority: priorityMap[message.priority] || 'NORMAL',
        content: {
          title: message.content.title,
          message: message.content.message,
          ...(message.content.actionUrl && { actionUrl: message.content.actionUrl }),
          ...(message.content.actionText && { actionText: message.content.actionText }),
        },
        ...(message.metadata && { metadata: message.metadata }),
        read: false, // Nova notificação sempre não lida
        createdAt: message.createdAt,
      };

      // Notificar todos os callbacks
      this.notificationCallbacks.forEach((callback) => {
        try {
          callback(notification);
        } catch (error) {
          logger.error('[REALTIME] Erro em callback de notificação', error);
          captureException(error);
        }
      });
    } catch (error) {
      logger.error('[REALTIME] Erro ao processar mensagem', error);
      captureException(error);
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Cria instância do cliente Supabase Realtime
 *
 * @param options - Opções de configuração
 * @returns Instância do cliente
 *
 * @example
 * ```typescript
 * const client = createSupabaseRealtimeClient({ userId: 'user-123' });
 * await client.connect();
 * ```
 */
export function createSupabaseRealtimeClient(
  options: SupabaseRealtimeClientOptions
): SupabaseRealtimeClient {
  return new SupabaseRealtimeClient(options);
}

// =============================================================================
// COMPATIBILIDADE COM WEBSOCKETCLIENT (DEPRECATED)
// =============================================================================

/**
 * @deprecated Use SupabaseRealtimeClient diretamente
 * Mantido para compatibilidade com código legado
 */
export type WebSocketState = RealtimeState;

/**
 * @deprecated Use createSupabaseRealtimeClient
 * Mantido para compatibilidade com código legado
 */
export const createWebSocketClient = createSupabaseRealtimeClient;

/**
 * @deprecated Use SupabaseRealtimeClient
 * Mantido para compatibilidade com código legado
 */
export type WebSocketClient = SupabaseRealtimeClient;
