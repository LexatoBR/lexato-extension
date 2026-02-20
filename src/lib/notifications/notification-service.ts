/**
 * @fileoverview Serviço de gerenciamento de notificações da extensão Chrome
 *
 * Responsável por sincronizar notificações com o backend, gerenciar cache local,
 * exibir notificações do sistema e manter o badge do ícone atualizado.
 *
 * @module NotificationService
 */

import { captureException } from '../sentry';
import { logger } from '../logger';
import { isDev } from '../../config/environment';
import { getSupabaseClient } from '../supabase/client';
import { permissionHelper } from '../permissions/permission-helper';
import type {
  ExtensionNotificationPayload,
  NotificationServiceState,
  ExtensionNotificationSettings,
  NotificationEvent,
} from './notification-types';
import {
  NOTIFICATION_TYPE_TO_CATEGORY,
  isNotificationCritical,
  NOTIFICATION_ICON_MAP,
  NOTIFICATION_BADGE_COLOR,
  NOTIFICATION_PRIORITY,
} from './notification-types';
import { SupabaseRealtimeClient, createSupabaseRealtimeClient } from './supabase-realtime-client';

// =============================================================================
// CONSTANTES
// =============================================================================

/** Chave para armazenar notificações no chrome.storage.local */
const STORAGE_KEY_NOTIFICATIONS = 'lexato:notifications';

/** Chave para armazenar estado do serviço */
const STORAGE_KEY_STATE = 'lexato:notification-state';

/** Chave para armazenar configurações */
const STORAGE_KEY_SETTINGS = 'lexato:notification-settings';

/** Intervalo de sincronização em milissegundos (5 minutos) */
const SYNC_INTERVAL_MS = 5 * 60 * 1000;

/** Limite padrão de notificações no cache local */
const DEFAULT_CACHE_LIMIT = 100;

/** TTL padrão para notificações do sistema (10 segundos) */
const DEFAULT_SYSTEM_NOTIFICATION_TTL = 10;

// =============================================================================
// CLASSE DO SERVIÇO
// =============================================================================

/**
 * Serviço de gerenciamento de notificações
 *
 * Singleton que gerencia todas as operações de notificação na extensão.
 */
export class NotificationService {
  private static instance: NotificationService | null = null;

  private wsClient: SupabaseRealtimeClient | null = null;
  private state: NotificationServiceState;
  private settings: ExtensionNotificationSettings;
  private syncInterval: ReturnType<typeof setInterval> | null = null;
  private notifications: Map<string, ExtensionNotificationPayload> = new Map();

  /**
   * Construtor privado (padrão singleton)
   */
  private constructor() {
    this.state = {
      initialized: false,
      connected: false,
      unreadCount: 0,
      syncing: false,
    };

    this.settings = {
      enabled: true,
      showSystemNotifications: true,
      showBadge: true,
      playSoundForCritical: true,
      systemNotificationTTL: DEFAULT_SYSTEM_NOTIFICATION_TTL,
      localStorageLimit: DEFAULT_CACHE_LIMIT,
    };
  }

  /**
   * Obtém a instância singleton do serviço
   */
  public static getInstance(): NotificationService {
    NotificationService.instance ??= new NotificationService();
    return NotificationService.instance;
  }

  /**
   * Inicializa o servico de notificacoes
   *
   * A inicializacao e resiliente: falhas em sync ou Realtime nao bloqueiam.
   * Notificacoes locais continuam funcionando.
   */
  public async initialize(): Promise<void> {
    try {
      logger.info('[NotificationService] Inicializando servico de notificacoes');

      // Carrega estado e configuracoes do storage
      await this.loadFromStorage();

      // Configura listeners
      this.setupListeners();

      // Tenta sincronizar com Supabase (nao bloqueante)
      try {
        await this.sync();
      } catch (syncError) {
        // Sync falhou, mas continuamos - pode ser que o endpoint não exista ainda
        logger.warn('[NotificationService] Sincronização inicial falhou (continuando)', {
          error: syncError instanceof Error ? syncError.message : String(syncError),
        });
        this.state.lastSyncError = syncError instanceof Error ? syncError.message : 'Erro de sincronização';
      }

      // Inicia sincronização periódica
      this.startPeriodicSync();

      // Inicializa Supabase Realtime para notificacoes em tempo real
      await this.initializeRealtime();

      this.state.initialized = true;
      await this.saveState();

      logger.info('[NotificationService] Serviço inicializado com sucesso');
    } catch (error) {
      // Mesmo com erro crítico, tentamos marcar como inicializado
      // para que a extensão continue funcionando
      logger.error('[NotificationService] Erro ao inicializar (modo degradado)', error);
      captureException(error);

      this.state.initialized = true;
      this.state.connected = false;
      this.state.lastSyncError = error instanceof Error ? error.message : 'Erro de inicialização';
      await this.saveState().catch(() => {});

      // Não lançamos erro - o serviço funciona em modo degradado
      logger.warn('[NotificationService] Funcionando em modo degradado (sem backend)');
    }
  }

  /**
   * Inicializa conexao Supabase Realtime para notificacoes em tempo real
   */
  private async initializeRealtime(): Promise<void> {
    try {
      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user?.id) {
        logger.warn('[NotificationService] Usuario nao autenticado, Realtime desabilitado');
        return;
      }

      if (isDev()) {
        logger.info('[NotificationService] Ambiente dev - Supabase Realtime habilitado');
      }

      logger.info('[NotificationService] Inicializando Supabase Realtime', { userId: user.id });

      // Cria cliente Supabase Realtime
      this.wsClient = createSupabaseRealtimeClient({
        userId: user.id,
        connectionTimeout: 10000,
      });

      // Registra callback para notificacoes recebidas via Realtime
      this.wsClient.onNotification((notification) => {
        this.handleIncomingNotification(notification);
      });

      // Registra callback para mudancas de estado
      this.wsClient.onStateChange((realtimeState) => {
        logger.debug('[NotificationService] Supabase Realtime estado alterado', { realtimeState });
        this.state.connected = realtimeState === 'CONNECTED';
        this.saveState();
      });

      // Conecta ao Supabase Realtime
      await this.wsClient.connect();

      logger.info('[NotificationService] Supabase Realtime inicializado com sucesso');
    } catch (error) {
      // Realtime e opcional, nao deve bloquear inicializacao
      logger.warn('[NotificationService] Erro ao inicializar Supabase Realtime (continuando sem)', {
        error: error instanceof Error ? error.message : String(error),
      });
      captureException(error);
    }
  }

  /**
   * Carrega dados do chrome.storage.local
   */
  private async loadFromStorage(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([
        STORAGE_KEY_NOTIFICATIONS,
        STORAGE_KEY_STATE,
        STORAGE_KEY_SETTINGS,
      ]);

      // Carrega notificações
      if (result[STORAGE_KEY_NOTIFICATIONS]) {
        const notifications = result[STORAGE_KEY_NOTIFICATIONS] as ExtensionNotificationPayload[];
        this.notifications.clear();
        notifications.forEach(n => this.notifications.set(n.notificationId, n));
      }

      // Carrega estado
      if (result[STORAGE_KEY_STATE]) {
        this.state = { ...this.state, ...result[STORAGE_KEY_STATE] };
      }

      // Carrega configurações
      if (result[STORAGE_KEY_SETTINGS]) {
        this.settings = { ...this.settings, ...result[STORAGE_KEY_SETTINGS] };
      }

      logger.debug('[NotificationService] Dados carregados do storage', {
        notificationCount: this.notifications.size,
        state: this.state,
        settings: this.settings,
      });
    } catch (error) {
      logger.error('[NotificationService] Erro ao carregar do storage', error);
      captureException(error);
    }
  }

  /**
   * Salva notificações no storage
   */
  private async saveNotifications(): Promise<void> {
    try {
      // Limita o número de notificações no cache
      const notifications = Array.from(this.notifications.values())
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, this.settings.localStorageLimit);

      await chrome.storage.local.set({
        [STORAGE_KEY_NOTIFICATIONS]: notifications,
      });
    } catch (error) {
      logger.error('[NotificationService] Erro ao salvar notificações', error);
      captureException(error);
    }
  }

  /**
   * Salva estado do serviço
   */
  private async saveState(): Promise<void> {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY_STATE]: this.state,
      });
    } catch (error) {
      logger.error('[NotificationService] Erro ao salvar estado', error);
      captureException(error);
    }
  }

  /**
   * Salva configurações
   */
  private async saveSettings(): Promise<void> {
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY_SETTINGS]: this.settings,
      });
    } catch (error) {
      logger.error('[NotificationService] Erro ao salvar configurações', error);
      captureException(error);
    }
  }

  /**
   * Configura listeners para eventos do Chrome
   */
  private setupListeners(): void {
    // Listener para cliques em notificações
    chrome.notifications.onClicked.addListener((notificationId) => {
      this.handleNotificationClick(notificationId);
    });

    // Listener para fechamento de notificações
    chrome.notifications.onClosed.addListener((notificationId, byUser) => {
      logger.debug('[NotificationService] Notificação fechada', { notificationId, byUser });
    });

    // Listener para mudanças no storage (sync entre abas)
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes[STORAGE_KEY_NOTIFICATIONS]) {
        this.handleStorageChange(changes[STORAGE_KEY_NOTIFICATIONS]);
      }
    });

    // Listener para mensagens do backend (via runtime.sendMessage)
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.type === 'NOTIFICATION_RECEIVED') {
        this.handleIncomingNotification(message.payload);
        sendResponse({ success: true });
      }
      return false;
    });
  }

  /**
   * Sincroniza notificações com o backend
   */
  public async sync(): Promise<void> {
    if (this.state.syncing) {
      logger.debug('[NotificationService] Sincronizacao ja em andamento');
      return;
    }

    try {
      this.state.syncing = true;
      await this.saveState();

      logger.info('[NotificationService] Iniciando sincronizacao com Supabase');

      const supabase = getSupabaseClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('Usuario nao autenticado');
      }

      // Busca notificacoes direto do Supabase
      const { data: notifications, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(this.settings.localStorageLimit);

      if (error) {
        throw new Error(`Erro ao buscar notificacoes: ${error.message}`);
      }

      // Transforma e atualiza cache local
      this.notifications.clear();
      (notifications ?? []).forEach((n: { id: string; type: string; title: string; message: string; read: boolean; created_at: string; metadata?: Record<string, unknown> }) => {
        const notificationType = n.type as import('./notification-types').NotificationType;
        const category = NOTIFICATION_TYPE_TO_CATEGORY[notificationType] ?? 'SYSTEM' as import('./notification-types').NotificationCategory;
        const priority = NOTIFICATION_PRIORITY[category as keyof typeof NOTIFICATION_PRIORITY] ?? 'NORMAL';

        const payload: ExtensionNotificationPayload = {
          notificationId: n.id,
          type: notificationType,
          category: category as import('./notification-types').NotificationCategory,
          priority: priority as import('./notification-types').NotificationPriorityLevel,
          content: {
            title: n.title,
            message: n.message,
          },
          read: n.read ?? false,
          createdAt: n.created_at,
        };

        // Adicionar metadata se existir
        if (n.metadata && typeof n.metadata === 'object') {
          const meta: NonNullable<ExtensionNotificationPayload['metadata']> = {};
          const md = n.metadata as Record<string, unknown>;
          if (md['evidence_id'] && typeof md['evidence_id'] === 'string') {
            meta.evidenceId = md['evidence_id'];
          }
          if (md['payment_id'] && typeof md['payment_id'] === 'string') {
            meta.paymentId = md['payment_id'];
          }
          if (Object.keys(meta).length > 0) {
            payload.metadata = meta;
          }
        }

        this.notifications.set(payload.notificationId, payload);
      });

      // Atualiza contador de nao lidas
      this.state.unreadCount = Array.from(this.notifications.values()).filter(n => !n.read).length;
      this.state.lastSyncAt = new Date().toISOString();
      this.state.connected = true;
      delete this.state.lastSyncError;

      // Atualiza badge
      await this.updateBadge();

      // Salva no storage
      await this.saveNotifications();
      await this.saveState();

      logger.info('[NotificationService] Sincronizacao concluida', {
        totalNotifications: this.notifications.size,
        unreadCount: this.state.unreadCount,
      });

      // Emite evento de sincronizacao
      this.emitEvent({
        type: 'NEW',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('[NotificationService] Erro na sincronizacao', error);
      captureException(error);

      this.state.connected = false;
      this.state.lastSyncError = error instanceof Error ? error.message : 'Erro desconhecido';
      await this.saveState();
    } finally {
      this.state.syncing = false;
      await this.saveState();
    }
  }

  /**
   * Inicia sincronização periódica
   */
  private startPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(() => {
      this.sync().catch(error => {
        logger.error('[NotificationService] Erro na sincronização periódica', error);
      });
    }, SYNC_INTERVAL_MS);

    logger.debug('[NotificationService] Sincronização periódica iniciada');
  }

  /**
   * Para sincronização periódica
   */
  public stopPeriodicSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.debug('[NotificationService] Sincronização periódica parada');
    }
  }

  /**
   * Processa notificação recebida em tempo real
   */
  private async handleIncomingNotification(
    payload: ExtensionNotificationPayload
  ): Promise<void> {
    try {
      logger.info('[NotificationService] Nova notificação recebida', {
        type: payload.type,
        notificationId: payload.notificationId,
      });

      // Adiciona ao cache
      this.notifications.set(payload.notificationId, payload);

      // Atualiza contador se não lida
      if (!payload.read) {
        this.state.unreadCount++;
        await this.updateBadge();
      }

      // Exibe notificação do sistema se habilitado
      if (this.settings.enabled && this.settings.showSystemNotifications) {
        await this.showSystemNotification(payload);
      }

      // Toca som para notificações críticas
      if (
        this.settings.playSoundForCritical &&
        payload.priority === NOTIFICATION_PRIORITY.CRITICAL
      ) {
        this.playNotificationSound();
      }

      // Salva no storage
      await this.saveNotifications();
      await this.saveState();

      // Emite evento
      this.emitEvent({
        type: 'NEW',
        notification: payload,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('[NotificationService] Erro ao processar notificação', error);
      captureException(error);
    }
  }

  /**
   * Exibe notificação do sistema (chrome.notifications)
   */
  private async showSystemNotification(
    notification: ExtensionNotificationPayload
  ): Promise<void> {
    try {
      // Verificar permissão 'notifications' antes de criar notificação do sistema
      const hasNotifications = await permissionHelper.hasPermission('notifications');
      if (!hasNotifications) {
        logger.warn('[NotificationService] Permissão de notificações não concedida - notificação não exibida', {
          notificationId: notification.notificationId,
          type: notification.type,
        });
        return;
      }

      const category = NOTIFICATION_TYPE_TO_CATEGORY[notification.type];
      const icon = NOTIFICATION_ICON_MAP[category];

      const options: chrome.notifications.NotificationOptions<true> = {
        type: 'basic',
        iconUrl: '/src/assets/branding/icon-128.png',
        title: `${icon} ${notification.content.title}`,
        message: notification.content.message,
        priority: this.mapPriorityToChrome(notification.priority),
        requireInteraction: isNotificationCritical(notification.type),
        buttons:
          notification.content.actionUrl && notification.content.actionText
            ? [{ title: notification.content.actionText }]
            : undefined,
      };

      await chrome.notifications.create(notification.notificationId, options);

      // Define timeout para remover notificação não crítica
      if (!isNotificationCritical(notification.type)) {
        setTimeout(() => {
          chrome.notifications.clear(notification.notificationId);
        }, this.settings.systemNotificationTTL * 1000);
      }
    } catch (error) {
      logger.error('[NotificationService] Erro ao exibir notificação do sistema', error);
      captureException(error);
    }
  }

  /**
   * Mapeia prioridade para valores do Chrome
   * @returns 0 (mínima), 1 (normal) ou 2 (máxima)
   */
  private mapPriorityToChrome(priority: string): 0 | 1 | 2 {
    switch (priority) {
      case NOTIFICATION_PRIORITY.CRITICAL:
      case NOTIFICATION_PRIORITY.HIGH:
        return 2; // Máxima
      case NOTIFICATION_PRIORITY.NORMAL:
        return 1; // Normal
      case NOTIFICATION_PRIORITY.LOW:
        return 0; // Mínima
      default:
        return 0;
    }
  }

  /**
   * Toca som de notificação
   * Usa a Web Audio API para gerar um som simples de notificação
   */
  private playNotificationSound(): void {
    try {
      // Usar Web Audio API para um som de notificação simples
      const audioContext = new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      // Configurar som de notificação (tom agradável)
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5
      oscillator.type = 'sine';

      // Volume moderado com fade out
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      // Tocar por 300ms
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);

      // Limpar após tocar
      setTimeout(() => {
        audioContext.close().catch(() => {
          // Ignorar erro de fechamento
        });
      }, 500);
    } catch (err) {
      // Falha silenciosa - som não é crítico
      logger.debug('[NotificationService] Erro ao tocar som de notificação', {
        error: String(err),
      });
    }
  }

  /**
   * Trata clique em notificação
   */
  private async handleNotificationClick(notificationId: string): Promise<void> {
    try {
      const notification = this.notifications.get(notificationId);
      if (!notification) {
        logger.warn('[NotificationService] Notificação não encontrada', { notificationId });
        return;
      }

      // Marca como lida
      await this.markAsRead(notificationId);

      // Abre URL de ação se houver
      if (notification.content.actionUrl) {
        await chrome.tabs.create({ url: notification.content.actionUrl });
      }

      // Remove notificação do sistema
      await chrome.notifications.clear(notificationId);

      // Emite evento
      this.emitEvent({
        type: 'CLICKED',
        notification,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('[NotificationService] Erro ao tratar clique', error);
      captureException(error);
    }
  }

  /**
   * Trata mudanças no storage (sync entre abas)
   */
  private handleStorageChange(
    change: chrome.storage.StorageChange
  ): void {
    try {
      if (change.newValue) {
        const notifications = change.newValue as ExtensionNotificationPayload[];
        this.notifications.clear();
        notifications.forEach(n => this.notifications.set(n.notificationId, n));

        // Recalcula contador de não lidas
        this.state.unreadCount = notifications.filter(n => !n.read).length;
        this.updateBadge();
      }
    } catch (error) {
      logger.error('[NotificationService] Erro ao tratar mudança no storage', error);
    }
  }

  /**
   * Atualiza badge do ícone da extensão
   */
  private async updateBadge(): Promise<void> {
    if (!this.settings.showBadge) {
      await chrome.action.setBadgeText({ text: '' });
      return;
    }

    try {
      const count = this.state.unreadCount;

      if (count === 0) {
        await chrome.action.setBadgeText({ text: '' });
      } else {
        const text = count > 99 ? '99+' : count.toString();
        await chrome.action.setBadgeText({ text });

        // Define cor do badge baseado na prioridade mais alta
        const unreadNotifications = Array.from(this.notifications.values()).filter(
          n => !n.read
        );

        let badgeColor = NOTIFICATION_BADGE_COLOR.NORMAL;
        if (unreadNotifications.some(n => n.priority === NOTIFICATION_PRIORITY.CRITICAL)) {
          badgeColor = NOTIFICATION_BADGE_COLOR.CRITICAL;
        } else if (unreadNotifications.some(n => n.priority === NOTIFICATION_PRIORITY.HIGH)) {
          badgeColor = NOTIFICATION_BADGE_COLOR.HIGH;
        }

        await chrome.action.setBadgeBackgroundColor({ color: badgeColor });
      }
    } catch (error) {
      logger.error('[NotificationService] Erro ao atualizar badge', error);
      captureException(error);
    }
  }

  /**
   * Emite evento para outros componentes
   */
  private emitEvent(event: NotificationEvent): void {
    // Usar .catch() para capturar rejeições da Promise
    // O try/catch síncrono não captura rejeições de Promise não-aguardadas
    chrome.runtime.sendMessage({
      type: 'NOTIFICATION_EVENT',
      payload: event,
    }).catch(() => {
      // Ignora erro se não houver listeners
      logger.debug('[NotificationService] Nenhum listener para evento', { eventType: event.type });
    });
  }

  // =============================================================================
  // MÉTODOS PÚBLICOS
  // =============================================================================

  /**
   * Obtém lista de notificações
   */
  public getNotifications(options?: {
    unreadOnly?: boolean;
    limit?: number;
  }): ExtensionNotificationPayload[] {
    let notifications = Array.from(this.notifications.values());

    if (options?.unreadOnly) {
      notifications = notifications.filter(n => !n.read);
    }

    notifications.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    if (options?.limit) {
      notifications = notifications.slice(0, options.limit);
    }

    return notifications;
  }

  /**
   * Obtém notificação por ID
   */
  public getNotification(notificationId: string): ExtensionNotificationPayload | undefined {
    return this.notifications.get(notificationId);
  }

  /**
   * Marca notificação como lida
   */
  public async markAsRead(notificationId: string): Promise<void> {
    try {
      const notification = this.notifications.get(notificationId);
      if (!notification || notification.read) {
        return;
      }

      // Atualiza localmente
      notification.read = true;
      this.state.unreadCount = Math.max(0, this.state.unreadCount - 1);

      // Salva no storage
      await this.saveNotifications();
      await this.saveState();

      // Atualiza badge
      await this.updateBadge();

      // Atualiza no Supabase direto
      try {
        const supabase = getSupabaseClient();
        await supabase
          .from('notifications')
          .update({ read: true })
          .eq('id', notificationId);
      } catch (error) {
        logger.error('[NotificationService] Erro ao marcar como lida no Supabase', error);
      }

      // Emite evento
      this.emitEvent({
        type: 'READ',
        notificationIds: [notificationId],
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('[NotificationService] Erro ao marcar como lida', error);
      captureException(error);
      throw error;
    }
  }

  /**
   * Marca todas as notificações como lidas
   */
  public async markAllAsRead(): Promise<void> {
    try {
      const unreadIds: string[] = [];

      // Atualiza localmente
      this.notifications.forEach(notification => {
        if (!notification.read) {
          notification.read = true;
          unreadIds.push(notification.notificationId);
        }
      });

      if (unreadIds.length === 0) {
        return;
      }

      this.state.unreadCount = 0;

      // Salva no storage
      await this.saveNotifications();
      await this.saveState();

      // Atualiza badge
      await this.updateBadge();

      // Atualiza no Supabase direto
      try {
        const supabase = getSupabaseClient();
        await supabase
          .from('notifications')
          .update({ read: true })
          .in('id', unreadIds);
      } catch (error) {
        logger.error('[NotificationService] Erro ao marcar todas como lidas no Supabase', error);
      }

      // Emite evento
      this.emitEvent({
        type: 'READ',
        notificationIds: unreadIds,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('[NotificationService] Erro ao marcar todas como lidas', error);
      captureException(error);
      throw error;
    }
  }

  /**
   * Limpa notificações antigas
   */
  public async clearOldNotifications(daysToKeep: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const clearedIds: string[] = [];

      this.notifications.forEach((notification, id) => {
        if (new Date(notification.createdAt) < cutoffDate) {
          this.notifications.delete(id);
          clearedIds.push(id);
          if (!notification.read) {
            this.state.unreadCount--;
          }
        }
      });

      if (clearedIds.length > 0) {
        await this.saveNotifications();
        await this.saveState();
        await this.updateBadge();

        // Emite evento
        this.emitEvent({
          type: 'CLEARED',
          notificationIds: clearedIds,
          timestamp: new Date().toISOString(),
        });

        logger.info('[NotificationService] Notificações antigas removidas', {
          count: clearedIds.length,
        });
      }
    } catch (error) {
      logger.error('[NotificationService] Erro ao limpar notificações antigas', error);
      captureException(error);
    }
  }

  /**
   * Obtém estado atual do serviço
   */
  public getState(): NotificationServiceState {
    return { ...this.state };
  }

  /**
   * Obtém configurações atuais
   */
  public getSettings(): ExtensionNotificationSettings {
    return { ...this.settings };
  }

  /**
   * Atualiza configurações
   */
  public async updateSettings(
    settings: Partial<ExtensionNotificationSettings>
  ): Promise<void> {
    this.settings = { ...this.settings, ...settings };
    await this.saveSettings();

    // Se desabilitou badge, limpa
    if (!this.settings.showBadge) {
      await chrome.action.setBadgeText({ text: '' });
    } else {
      await this.updateBadge();
    }

    logger.info('[NotificationService] Configurações atualizadas', { ...this.settings });
  }

  /**
   * Desliga o serviço
   */
  public async shutdown(): Promise<void> {
    try {
      logger.info('[NotificationService] Desligando serviço de notificações');

      this.stopPeriodicSync();

      // Desconecta Supabase Realtime
      if (this.wsClient) {
        await this.wsClient.disconnect();
        this.wsClient = null;
      }

      this.state.initialized = false;
      this.state.connected = false;
      await this.saveState();

      NotificationService.instance = null;
    } catch (error) {
      logger.error('[NotificationService] Erro ao desligar serviço', error);
      captureException(error);
    }
  }

  // =============================================================================
  // METODOS DE REALTIME
  // =============================================================================

  /**
   * Verifica se o Supabase Realtime esta conectado
   */
  public isRealtimeConnected(): boolean {
    return this.wsClient?.isConnected() ?? false;
  }

  /**
   * Reconecta o Supabase Realtime
   */
  public async reconnectRealtime(): Promise<void> {
    if (!this.wsClient) {
      logger.warn('[NotificationService] Realtime client nao disponivel');
      return;
    }

    logger.info('[NotificationService] Reconectando Supabase Realtime');
    await this.wsClient.disconnect();
    await this.wsClient.connect();
  }
}

/**
 * Exporta instancia singleton
 */
export const notificationService = NotificationService.getInstance();