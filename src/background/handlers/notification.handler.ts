/**
 * @fileoverview Handler de notificações no service worker
 *
 * Gerencia recebimento, processamento e exibição de notificações
 * através do service worker da extensão Chrome.
 *
 * @module NotificationHandler
 */

import { logger } from '../../lib/logger';
import { captureException } from '../../lib/sentry';
import { notificationService } from '../../lib/notifications/notification-service';
import type { ExtensionNotificationPayload } from '../../lib/notifications/notification-types';
import { LexatoError, ErrorCodes } from '../../lib/errors';

// =============================================================================
// TIPOS
// =============================================================================

/**
 * Mensagem de notificação recebida do backend
 */
interface NotificationMessage {
  type: 'NOTIFICATION_RECEIVED';
  payload: ExtensionNotificationPayload;
}

/**
 * Requisição de ação de notificação
 */
interface NotificationActionRequest {
  type: 'NOTIFICATION_ACTION';
  action: 'MARK_READ' | 'MARK_ALL_READ' | 'CLEAR_OLD' | 'SYNC';
  notificationId?: string;
  daysToKeep?: number;
}

/**
 * Requisição de dados de notificação
 */
interface NotificationDataRequest {
  type: 'GET_NOTIFICATIONS' | 'GET_NOTIFICATION_STATE' | 'GET_NOTIFICATION_COUNT';
  unreadOnly?: boolean;
  limit?: number;
  notificationId?: string;
}

// =============================================================================
// CLASSE DO HANDLER
// =============================================================================

/**
 * Handler de notificações para o service worker
 *
 * Processa mensagens relacionadas a notificações e gerencia
 * o ciclo de vida das notificações na extensão.
 */
export class NotificationHandler {
  private initialized = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectInterval = 5000; // 5 segundos

  /**
   * Inicializa o handler de notificacoes
   * Usa Supabase direto (sem apiClient legado)
   */
  public async initialize(): Promise<void> {
    try {
      logger.info('[NotificationHandler] Inicializando handler de notificacoes');

      // Inicializa o servico de notificacoes (Supabase direto)
      await notificationService.initialize();

      // Configura listeners
      this.setupListeners();

      // Configura WebSocket ou polling para notificações real-time
      await this.setupRealtimeConnection();

      this.initialized = true;

      logger.info('[NotificationHandler] Handler inicializado com sucesso');
    } catch (error) {
      logger.error('[NotificationHandler] Erro ao inicializar', error);
      captureException(error);
      throw new LexatoError(ErrorCodes.INITIALIZATION_ERROR, {
        originalError: error instanceof Error ? error : undefined,
        customMessage: 'Falha ao inicializar handler de notificações',
      });
    }
  }

  /**
   * Configura listeners para mensagens
   */
  private setupListeners(): void {
    // Tipos de mensagens que este handler processa
    const HANDLED_MESSAGE_TYPES = [
      'NOTIFICATION_RECEIVED',
      'NOTIFICATION_ACTION',
      'GET_NOTIFICATIONS',
      'GET_NOTIFICATION_STATE',
      'GET_NOTIFICATION_COUNT',
    ];

    // Listener para mensagens do runtime
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // Verifica se este handler deve processar esta mensagem
      // IMPORTANTE: Retornar false para mensagens não tratadas permite que
      // outros listeners (como o do service-worker.ts) processem a mensagem
      if (!message?.type || !HANDLED_MESSAGE_TYPES.includes(message.type)) {
        return false; // Não processa - deixa outros listeners responderem
      }

      // Processa mensagens de notificação de forma assíncrona
      this.handleMessage(message, sender)
        .then(response => sendResponse(response))
        .catch(error => {
          logger.error('[NotificationHandler] Erro ao processar mensagem', error);
          sendResponse({
            success: false,
            error: error instanceof Error ? error.message : 'Erro desconhecido',
          });
        });

      // Retorna true para indicar resposta assíncrona
      return true;
    });

    // Listener para cliques no ícone da extensão (abre popup com notificações)
    chrome.action.onClicked.addListener(async () => {
      try {
        // Se há notificações não lidas, abre o popup na aba de notificações
        const state = notificationService.getState();
        if (state.unreadCount > 0) {
          await chrome.action.openPopup();

          // Envia mensagem para o popup abrir na aba de notificações
          setTimeout(() => {
            chrome.runtime.sendMessage({
              type: 'OPEN_NOTIFICATIONS_TAB',
            }).catch(() => {
              // Ignora se não houver listener
            });
          }, 100);
        }
      } catch (error) {
        logger.error('[NotificationHandler] Erro ao abrir popup', error);
      }
    });

    // Listener para alarmes (verificação periódica)
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'notification-check') {
        this.checkForNewNotifications();
      }
    });

    // Cria alarme para verificação periódica (a cada 5 minutos)
    chrome.alarms.create('notification-check', {
      periodInMinutes: 5,
    });
  }

  /**
   * Processa mensagens recebidas
   */
  private async handleMessage(
    message: any,
    _sender: chrome.runtime.MessageSender
  ): Promise<any> {
    try {
      // Mensagens de notificação do backend
      if (message.type === 'NOTIFICATION_RECEIVED') {
        return await this.handleNotificationReceived(message as NotificationMessage);
      }

      // Ações de notificação
      if (message.type === 'NOTIFICATION_ACTION') {
        return await this.handleNotificationAction(message as NotificationActionRequest);
      }

      // Requisições de dados
      if (
        message.type === 'GET_NOTIFICATIONS' ||
        message.type === 'GET_NOTIFICATION_STATE' ||
        message.type === 'GET_NOTIFICATION_COUNT'
      ) {
        return await this.handleDataRequest(message as NotificationDataRequest);
      }

      // Mensagem não reconhecida
      return null;
    } catch (error) {
      logger.error('[NotificationHandler] Erro ao processar mensagem', { message, error });
      captureException(error);
      throw error;
    }
  }

  /**
   * Processa notificação recebida
   */
  private async handleNotificationReceived(
    message: NotificationMessage
  ): Promise<{ success: boolean }> {
    try {
      logger.info('[NotificationHandler] Nova notificação recebida', {
        type: message.payload.type,
        notificationId: message.payload.notificationId,
      });

      // Envia para o serviço processar
      await chrome.runtime.sendMessage({
        type: 'NOTIFICATION_RECEIVED',
        payload: message.payload,
      });

      return { success: true };
    } catch (error) {
      logger.error('[NotificationHandler] Erro ao processar notificação', error);
      captureException(error);
      return { success: false };
    }
  }

  /**
   * Processa ação de notificação
   */
  private async handleNotificationAction(
    request: NotificationActionRequest
  ): Promise<{ success: boolean; data?: any }> {
    try {
      switch (request.action) {
        case 'MARK_READ':
          if (!request.notificationId) {
            throw new Error('ID da notificação é obrigatório');
          }
          await notificationService.markAsRead(request.notificationId);
          break;

        case 'MARK_ALL_READ':
          await notificationService.markAllAsRead();
          break;

        case 'CLEAR_OLD':
          await notificationService.clearOldNotifications(request.daysToKeep);
          break;

        case 'SYNC':
          await notificationService.sync();
          break;

        default:
          throw new Error(`Ação desconhecida: ${request.action}`);
      }

      return { success: true };
    } catch (error) {
      logger.error('[NotificationHandler] Erro ao executar ação', { request, error });
      captureException(error);
      return {
        success: false,
        data: { error: error instanceof Error ? error.message : 'Erro desconhecido' },
      };
    }
  }

  /**
   * Processa requisição de dados
   */
  private async handleDataRequest(
    request: NotificationDataRequest
  ): Promise<{ success: boolean; data: any }> {
    try {
      let data: any;

      switch (request.type) {
        case 'GET_NOTIFICATIONS':
          data = notificationService.getNotifications({
            ...(request.unreadOnly !== undefined && { unreadOnly: request.unreadOnly }),
            ...(request.limit !== undefined && { limit: request.limit }),
          });
          break;

        case 'GET_NOTIFICATION_STATE':
          data = notificationService.getState();
          break;

        case 'GET_NOTIFICATION_COUNT': {
          const state = notificationService.getState();
          data = {
            total: notificationService.getNotifications().length,
            unread: state.unreadCount,
          };
          break;
        }

        default:
          throw new Error(`Tipo de requisição desconhecido: ${request.type}`);
      }

      return { success: true, data };
    } catch (error) {
      logger.error('[NotificationHandler] Erro ao obter dados', { request, error });
      captureException(error);
      return {
        success: false,
        data: { error: error instanceof Error ? error.message : 'Erro desconhecido' },
      };
    }
  }

  /**
   * Configura conexão real-time para notificações
   *
   * Tenta estabelecer WebSocket, se falhar usa polling
   */
  private async setupRealtimeConnection(): Promise<void> {
    try {
      // Por enquanto, usa apenas polling via alarmes
      // TODO: Implementar WebSocket quando backend suportar
      logger.info('[NotificationHandler] Usando polling para notificações');
    } catch (error) {
      logger.error('[NotificationHandler] Erro ao configurar conexão real-time', error);
      captureException(error);
    }
  }

  /**
   * Verifica por novas notificacoes (polling)
   */
  private async checkForNewNotifications(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    try {
      logger.debug('[NotificationHandler] Verificando novas notificações');

      // Sincroniza com o backend
      await notificationService.sync();
    } catch (error) {
      logger.error('[NotificationHandler] Erro ao verificar notificações', error);

      // Tenta reconectar se perdeu conexão
      this.handleConnectionError();
    }
  }

  /**
   * Trata erro de conexão e tenta reconectar
   */
  private handleConnectionError(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('[NotificationHandler] Máximo de tentativas de reconexão atingido');
      return;
    }

    this.reconnectAttempts++;

    setTimeout(() => {
      logger.info('[NotificationHandler] Tentando reconectar...', {
        attempt: this.reconnectAttempts,
      });

      this.checkForNewNotifications()
        .then(() => {
          this.reconnectAttempts = 0;
          logger.info('[NotificationHandler] Reconectado com sucesso');
        })
        .catch(error => {
          logger.error('[NotificationHandler] Falha na reconexão', error);
          this.handleConnectionError();
        });
    }, this.reconnectInterval * this.reconnectAttempts);
  }

  /**
   * Processa clique em botão de notificação
   *
   * @param notificationId - ID da notificação
   * @param buttonIndex - Índice do botão clicado
   */
  public async handleNotificationButtonClick(
    notificationId: string,
    buttonIndex: number
  ): Promise<void> {
    try {
      const notification = notificationService.getNotification(notificationId);
      if (!notification) {
        logger.warn('[NotificationHandler] Notificação não encontrada', { notificationId });
        return;
      }

      // Botão 0 é sempre a ação principal
      if (buttonIndex === 0 && notification.content.actionUrl) {
        await chrome.tabs.create({ url: notification.content.actionUrl });
      }

      // Marca como lida
      await notificationService.markAsRead(notificationId);

      // Remove notificação do sistema
      await chrome.notifications.clear(notificationId);
    } catch (error) {
      logger.error('[NotificationHandler] Erro ao processar clique em botão', error);
      captureException(error);
    }
  }

  /**
   * Desliga o handler
   */
  public async shutdown(): Promise<void> {
    try {
      logger.info('[NotificationHandler] Desligando handler de notificações');

      // Remove alarmes
      await chrome.alarms.clear('notification-check');

      // Desliga serviço
      await notificationService.shutdown();

      this.initialized = false;
    } catch (error) {
      logger.error('[NotificationHandler] Erro ao desligar handler', error);
      captureException(error);
    }
  }
}

// =============================================================================
// EXPORTAÇÃO
// =============================================================================

/**
 * Instância singleton do handler
 */
export const notificationHandler = new NotificationHandler();