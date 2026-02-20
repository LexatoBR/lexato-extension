/**
 * Gerenciador de Notificações da Extensão Lexato
 *
 * Gerencia notificações do sistema usando chrome.notifications API.
 * Respeita configurações do usuário e fornece ações interativas.
 *
 * Requisitos atendidos:
 * - 17.1: Notificar conclusão de captura
 * - 17.2: Notificar conclusão de upload
 * - 17.3: Notificar erros
 * - 17.4: Notificar certificação pronta (via WebSocket)
 * - 17.5: Usar chrome.notifications API
 * - 17.6: Ação para abrir app ao clicar
 * - 17.7: Respeitar configuração de notificações do usuário
 *
 * @module NotificationManager
 */

import { AuditLogger } from '../lib/audit-logger';
import { permissionHelper } from '../lib/permissions/permission-helper';

/** Tipos de notificação suportados */
export type NotificationType =
  | 'capture_complete'
  | 'upload_complete'
  | 'certification_ready'
  | 'error'
  | 'warning'
  | 'info'
  | 'extensions_restored'
  | 'extensions_restore_failed'
  | 'preview_reminder'
  | 'preview_urgent'
  | 'preview_expired';

/** Dados de uma notificação */
export interface NotificationData {
  /** Tipo da notificação */
  type: NotificationType;
  /** Título da notificação */
  title: string;
  /** Mensagem da notificação */
  message: string;
  /** ID da captura relacionada (opcional) */
  captureId?: string;
  /** URL para abrir ao clicar (opcional) */
  actionUrl?: string;
  /** Dados adicionais (opcional) */
  metadata?: Record<string, unknown>;
}

/** Opções de criação de notificação */
export interface NotificationOptions {
  /** Se deve forçar exibição mesmo com notificações desabilitadas */
  force?: boolean;
  /** Tempo em ms para auto-fechar (0 = não fecha) */
  autoCloseMs?: number;
  /** Se deve tocar som */
  silent?: boolean;
}

/** Callback para clique em notificação */
export type NotificationClickCallback = (notificationId: string, data: NotificationData) => void;

/** Chave de armazenamento para configurações */
const SETTINGS_KEY = 'lexato_settings';

/** URL base do app */
const DASHBOARD_BASE_URL = 'https://app.lexato.com.br';

/**
 * NotificationManager - Gerencia notificações do sistema
 *
 * Funcionalidades:
 * - Cria notificações usando chrome.notifications API
 * - Respeita configurações do usuário
 * - Suporta ações ao clicar (abrir app)
 * - Registra notificações no AuditLogger
 */
export class NotificationManager {
  private logger: AuditLogger;
  private notificationData: Map<string, NotificationData> = new Map();
  private clickCallback: NotificationClickCallback | null = null;
  private isListenerRegistered = false;

  /**
   * Cria nova instância do NotificationManager
   *
   * @param logger - Instância do AuditLogger para registro
   */
  constructor(logger?: AuditLogger) {
    this.logger = logger ?? new AuditLogger();
  }

  /**
   * Inicializa o gerenciador de notificações
   * Registra listener para cliques em notificações
   */
  initialize(): void {
    if (this.isListenerRegistered) {
      return;
    }

    chrome.notifications.onClicked.addListener(this.handleNotificationClick.bind(this));
    this.isListenerRegistered = true;

    this.logger.info('GENERAL', 'NOTIFICATION_MANAGER_INITIALIZED', {});
  }

  /**
   * Define callback para cliques em notificações
   *
   * @param callback - Função a ser chamada quando notificação for clicada
   */
  setClickCallback(callback: NotificationClickCallback): void {
    this.clickCallback = callback;
  }

  /**
   * Verifica se notificações estão habilitadas nas configurações
   */
  async areNotificationsEnabled(): Promise<boolean> {
    try {
      const result = await chrome.storage.local.get(SETTINGS_KEY);
      const settings = result[SETTINGS_KEY] as { notificationsEnabled?: boolean } | undefined;
      return settings?.notificationsEnabled !== false; // Padrão é true
    } catch (err) {
      this.logger.warn('GENERAL', 'NOTIFICATION_SETTINGS_CHECK_FAILED', {
        error: err instanceof Error ? err.message : 'Erro desconhecido',
      });
      return true; // Em caso de erro, assume habilitado
    }
  }

  /**
   * Cria uma notificação
   *
   * @param data - Dados da notificação
   * @param options - Opções adicionais
   * @returns ID da notificação criada ou null se não foi criada
   */
  async notify(data: NotificationData, options: NotificationOptions = {}): Promise<string | null> {
    // Verificar se notificações estão habilitadas
    if (!options.force) {
      const enabled = await this.areNotificationsEnabled();
      if (!enabled) {
        this.logger.info('GENERAL', 'NOTIFICATION_SKIPPED_DISABLED', {
          type: data.type,
          title: data.title,
        });
        return null;
      }
    }

    const notificationId = `lexato_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // Verificar permissão 'notifications' antes de criar notificação
    const hasNotifications = await permissionHelper.hasPermission('notifications');
    if (!hasNotifications) {
      this.logger.warn('GENERAL', 'NOTIFICATION_PERMISSION_NOT_GRANTED', {
        type: data.type,
        title: data.title,
        degradation: 'Notificação não exibida - permissão não concedida',
      });
      return null;
    }

    const notificationOptions: chrome.notifications.NotificationOptions<true> = {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('src/assets/branding/icon-128.png'),
      title: data.title,
      message: data.message,
      priority: this.getPriority(data.type),
      silent: options.silent ?? false,
      requireInteraction: this.requiresInteraction(data.type),
    };

    try {
      await new Promise<string>((resolve, reject) => {
        try {
          chrome.notifications.create(notificationId, notificationOptions, (id) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(id);
            }
          });
        } catch (err) {
          reject(err);
        }
      });

      // Armazenar dados para uso no callback de clique
      this.notificationData.set(notificationId, data);

      this.logger.info('GENERAL', 'NOTIFICATION_CREATED', {
        notificationId,
        type: data.type,
        title: data.title,
        captureId: data.captureId,
      });

      // Auto-fechar se configurado
      if (options.autoCloseMs && options.autoCloseMs > 0) {
        setTimeout(() => {
          this.clear(notificationId);
        }, options.autoCloseMs);
      }

      return notificationId;
    } catch (err) {
      this.logger.error('GENERAL', 'NOTIFICATION_CREATE_FAILED', {
        type: data.type,
        error: err instanceof Error ? err.message : 'Erro desconhecido',
      });
      return null;
    }
  }

  /**
   * Notifica conclusão de captura
   *
   * @param captureId - ID da captura
   * @param captureType - Tipo de captura (screenshot ou video)
   */
  async notifyCaptureComplete(
    captureId: string,
    captureType: 'screenshot' | 'video'
  ): Promise<string | null> {
    const typeLabel = captureType === 'screenshot' ? 'Screenshot' : 'Vídeo';

    return this.notify({
      type: 'capture_complete',
      title: 'Captura Concluída',
      message: `${typeLabel} capturado com sucesso. Iniciando upload...`,
      captureId,
      actionUrl: `${DASHBOARD_BASE_URL}/evidencias/${captureId}`,
    });
  }

  /**
   * Notifica conclusão de upload
   *
   * @param captureId - ID da captura
   */
  async notifyUploadComplete(captureId: string): Promise<string | null> {
    return this.notify({
      type: 'upload_complete',
      title: 'Upload Concluído',
      message: 'Arquivos enviados com sucesso. Processando certificação...',
      captureId,
      actionUrl: `${DASHBOARD_BASE_URL}/evidencias/${captureId}`,
    });
  }

  /**
   * Notifica que certificação está pronta
   *
   * @param captureId - ID da captura
   * @param certificateUrl - URL do certificado PDF
   */
  async notifyCertificationReady(
    captureId: string,
    certificateUrl?: string
  ): Promise<string | null> {
    return this.notify(
      {
        type: 'certification_ready',
        title: 'Certificação Pronta!',
        message: 'Sua prova digital foi certificada e está disponível para download.',
        captureId,
        actionUrl: certificateUrl ?? `${DASHBOARD_BASE_URL}/evidencias/${captureId}`,
        metadata: { certificateUrl },
      },
      { autoCloseMs: 0 } // Não fecha automaticamente
    );
  }

  /**
   * Notifica erro
   *
   * @param title - Título do erro
   * @param message - Mensagem de erro
   * @param captureId - ID da captura relacionada (opcional)
   */
  async notifyError(
    title: string,
    message: string,
    captureId?: string
  ): Promise<string | null> {
    const notificationData: NotificationData = {
      type: 'error',
      title,
      message,
    };

    if (captureId) {
      notificationData.captureId = captureId;
      notificationData.actionUrl = `${DASHBOARD_BASE_URL}/evidencias/${captureId}`;
    }

    return this.notify(
      notificationData,
      { autoCloseMs: 0 } // Erros não fecham automaticamente
    );
  }

  /**
   * Notifica aviso
   *
   * @param title - Título do aviso
   * @param message - Mensagem de aviso
   */
  async notifyWarning(title: string, message: string): Promise<string | null> {
    return this.notify(
      {
        type: 'warning',
        title,
        message,
      },
      { autoCloseMs: 10000 } // Fecha após 10 segundos
    );
  }

  /**
   * Notifica informação
   *
   * @param title - Título da informação
   * @param message - Mensagem informativa
   */
  async notifyInfo(title: string, message: string): Promise<string | null> {
    return this.notify(
      {
        type: 'info',
        title,
        message,
      },
      { autoCloseMs: 5000 } // Fecha após 5 segundos
    );
  }

  /**
   * Notifica lembrete de preview (15 minutos antes de expirar)
   * Requisito 12.1: Enviar lembrete quando faltar 15 minutos para expirar
   *
   * @param evidenceId - ID da evidência
   * @returns ID da notificação ou null se não foi criada
   */
  async notifyPreviewReminder(evidenceId: string): Promise<string | null> {
    return this.notify(
      {
        type: 'preview_reminder',
        title: 'Captura Pendente',
        message: 'Você tem 15 minutos para confirmar sua captura antes que ela expire.',
        captureId: evidenceId,
        actionUrl: `${DASHBOARD_BASE_URL}/preview/${evidenceId}`,
      },
      { autoCloseMs: 30000 } // Fecha após 30 segundos
    );
  }

  /**
   * Notifica urgência de preview (5 minutos antes de expirar)
   * Requisito 12.2: Enviar lembrete quando faltar 5 minutos para expirar
   *
   * @param evidenceId - ID da evidência
   * @returns ID da notificação ou null se não foi criada
   */
  async notifyPreviewUrgent(evidenceId: string): Promise<string | null> {
    return this.notify(
      {
        type: 'preview_urgent',
        title: '[AVISO] Captura Expirando!',
        message: 'Sua captura expira em 5 minutos! Confirme agora para não perder.',
        captureId: evidenceId,
        actionUrl: `${DASHBOARD_BASE_URL}/preview/${evidenceId}`,
      },
      { autoCloseMs: 0 } // Não fecha automaticamente - requer ação
    );
  }

  /**
   * Notifica expiração de preview
   * Requisito 12.3: Enviar notificação quando prova expirar
   *
   * @param evidenceId - ID da evidência
   * @returns ID da notificação ou null se não foi criada
   */
  async notifyPreviewExpired(evidenceId: string): Promise<string | null> {
    return this.notify(
      {
        type: 'preview_expired',
        title: 'Captura Expirada',
        message: 'Sua captura expirou e foi descartada automaticamente. Realize uma nova captura se necessário.',
        captureId: evidenceId,
        actionUrl: `${DASHBOARD_BASE_URL}/evidencias`,
      },
      { autoCloseMs: 0 } // Não fecha automaticamente
    );
  }

  /**
   * Notifica restauração de extensões bem-sucedida
   * Requisito 7.7: Notificar quando extensões forem restauradas
   *
   * @param restoredCount - Quantidade de extensões restauradas
   */
  async notifyExtensionsRestored(restoredCount: number): Promise<string | null> {
    return this.notify(
      {
        type: 'extensions_restored',
        title: 'Extensões Restauradas',
        message: `${restoredCount} extensão(ões) foi(ram) restaurada(s) ao estado original.`,
        metadata: { restoredCount },
      },
      { autoCloseMs: 5000 } // Fecha após 5 segundos
    );
  }

  /**
   * Notifica falha na restauração de extensões
   * Requisito 8.7: Notificar usuário com instruções de retry manual
   *
   * @param failedCount - Quantidade de extensões que falharam
   * @param failedNames - Nomes das extensões que falharam
   */
  async notifyExtensionsRestoreFailed(
    failedCount: number,
    failedNames: string[]
  ): Promise<string | null> {
    const namesPreview = failedNames.slice(0, 3).join(', ');
    const moreCount = failedNames.length > 3 ? ` e mais ${failedNames.length - 3}` : '';

    return this.notify(
      {
        type: 'extensions_restore_failed',
        title: 'Falha ao Restaurar Extensões',
        message: `${failedCount} extensão(ões) não pôde(ram) ser restaurada(s): ${namesPreview}${moreCount}. Clique para tentar novamente.`,
        metadata: { failedCount, failedNames },
      },
      { autoCloseMs: 0 } // Não fecha automaticamente
    );
  }

  /**
   * Limpa uma notificação
   *
   * @param notificationId - ID da notificação a limpar
   */
  async clear(notificationId: string): Promise<boolean> {
    try {
      const wasCleared = await new Promise<boolean>((resolve) => {
        chrome.notifications.clear(notificationId, (cleared) => {
          resolve(cleared);
        });
      });
      if (wasCleared) {
        this.notificationData.delete(notificationId);
      }
      return wasCleared;
    } catch (err) {
      this.logger.warn('GENERAL', 'NOTIFICATION_CLEAR_FAILED', {
        notificationId,
        error: err instanceof Error ? err.message : 'Erro desconhecido',
      });
      return false;
    }
  }

  /**
   * Limpa todas as notificações
   */
  async clearAll(): Promise<void> {
    const notificationIds = Array.from(this.notificationData.keys());
    await Promise.all(notificationIds.map((id) => this.clear(id)));
  }

  /**
   * Handler para clique em notificação
   */
  private handleNotificationClick(notificationId: string): void {
    const data = this.notificationData.get(notificationId);

    if (!data) {
      this.logger.warn('GENERAL', 'NOTIFICATION_CLICK_NO_DATA', { notificationId });
      return;
    }

    this.logger.info('GENERAL', 'NOTIFICATION_CLICKED', {
      notificationId,
      type: data.type,
      captureId: data.captureId,
    });

    // Abrir URL de ação se definida
    if (data.actionUrl) {
      chrome.tabs.create({ url: data.actionUrl });
    }

    // Chamar callback se definido
    if (this.clickCallback) {
      this.clickCallback(notificationId, data);
    }

    // Limpar notificação após clique
    this.clear(notificationId);
  }

  /**
   * Obtém prioridade da notificação baseado no tipo
   */
  private getPriority(type: NotificationType): 0 | 1 | 2 {
    switch (type) {
      case 'error':
        return 2; // Alta
      case 'certification_ready':
        return 2; // Alta
      case 'extensions_restore_failed':
        return 2; // Alta - requer ação do usuário
      case 'preview_urgent':
        return 2; // Alta - urgente, 5 min para expirar
      case 'preview_expired':
        return 2; // Alta - expirou
      case 'warning':
        return 1; // Média
      case 'capture_complete':
      case 'upload_complete':
      case 'extensions_restored':
      case 'preview_reminder':
        return 1; // Média
      case 'info':
      default:
        return 0; // Baixa
    }
  }

  /**
   * Verifica se notificação requer interação do usuário (não fecha automaticamente)
   */
  private requiresInteraction(type: NotificationType): boolean {
    switch (type) {
      case 'error':
      case 'certification_ready':
      case 'extensions_restore_failed':
      case 'preview_urgent':
      case 'preview_expired':
        return true;
      default:
        return false;
    }
  }

  /**
   * Obtém dados de uma notificação pelo ID
   *
   * @param notificationId - ID da notificação
   */
  getNotificationData(notificationId: string): NotificationData | undefined {
    return this.notificationData.get(notificationId);
  }

  /**
   * Obtém contagem de notificações ativas
   */
  getActiveCount(): number {
    return this.notificationData.size;
  }
}

/** Instância singleton do NotificationManager */
let notificationManagerInstance: NotificationManager | null = null;

/**
 * Obtém instância singleton do NotificationManager
 *
 * @param logger - Logger opcional para nova instância
 */
export function getNotificationManager(logger?: AuditLogger): NotificationManager {
  if (!notificationManagerInstance) {
    notificationManagerInstance = new NotificationManager(logger);
    notificationManagerInstance.initialize();
  }
  return notificationManagerInstance;
}

/**
 * Reseta instância singleton (para testes)
 */
export function resetNotificationManager(): void {
  notificationManagerInstance = null;
}

export default NotificationManager;
