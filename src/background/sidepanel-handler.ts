/**
 * Gerenciador do Side Panel da Extensão Lexato
 *
 * Gerencia abertura, fechamento e comunicação com o Side Panel
 * para controles de gravação de vídeo.
 *
 * Requisitos atendidos:
 * - 1.1: Abrir Side Panel automaticamente ao iniciar gravação
 * - 10.1: Usar chrome.sidePanel API
 *
 * @module SidePanelHandler
 * @see https://developer.chrome.com/docs/extensions/reference/api/sidePanel
 */

import { AuditLogger } from '../lib/audit-logger';
import type { SidePanelMessage, RecordingState } from '../sidepanel/types';

/**
 * Configuração do SidePanelHandler
 */
export interface SidePanelHandlerConfig {
  /** Logger para auditoria */
  logger?: AuditLogger;
}

/**
 * SidePanelHandler - Gerencia o Side Panel de gravação
 *
 * Funcionalidades:
 * - Abre Side Panel ao iniciar gravação (Requisito 1.1)
 * - Fecha Side Panel ao finalizar gravação
 * - Envia mensagens para o Side Panel (stats, navegação, alertas)
 * - Verifica se Side Panel está aberto
 */
export class SidePanelHandler {
  private logger: AuditLogger;
  private isOpen: boolean = false;
  private currentWindowId: number | null = null;

  /**
   * Cria nova instância do SidePanelHandler
   *
   * @param config - Configuração opcional
   */
  constructor(config?: SidePanelHandlerConfig) {
    this.logger = config?.logger ?? new AuditLogger();
  }

  /**
   * Abre o Side Panel para a janela especificada
   * Requisito 1.1: Side Panel abre automaticamente ao iniciar gravação
   *
   * @param windowId - ID da janela onde abrir o Side Panel
   * @returns Promise que resolve quando o Side Panel é aberto
   * @throws Error se falhar ao abrir
   */
  async open(windowId: number): Promise<void> {
    try {
      this.logger.info('GENERAL', 'SIDEPANEL_OPENING', { windowId });

      // Verificar se API está disponível
      if (!chrome.sidePanel) {
        throw new Error('chrome.sidePanel API não disponível');
      }

      // Abrir o Side Panel para a janela
      await chrome.sidePanel.open({ windowId });

      this.isOpen = true;
      this.currentWindowId = windowId;

      this.logger.info('GENERAL', 'SIDEPANEL_OPENED', { windowId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.error('GENERAL', 'SIDEPANEL_OPEN_FAILED', {
        windowId,
        error: errorMessage,
      });
      throw new Error(`Falha ao abrir Side Panel: ${errorMessage}`);
    }
  }

  /**
   * Fecha o Side Panel de forma confiável
   *
   * Estratégia em camadas:
   * 1. Tenta chrome.sidePanel.close() (Chrome 129+)
   * 2. Fallback: desabilita e reabilita via setOptions (Chrome 116+)
   * 3. Envia CLOSE_SIDEPANEL para window.close() como último recurso
   *
   * @param windowId - ID da janela (opcional, usa currentWindowId se não fornecido)
   * @returns Promise que resolve quando o Side Panel é fechado
   */
  async close(windowId?: number): Promise<void> {
    const targetWindowId = windowId ?? this.currentWindowId;

    try {
      this.logger.info('GENERAL', 'SIDEPANEL_CLOSING', {
        windowId: targetWindowId,
      });

      if (!chrome.sidePanel) {
        this.logger.warn('GENERAL', 'SIDEPANEL_API_NOT_AVAILABLE_FOR_CLOSE', {});
        // Fallback: enviar mensagem para window.close()
        await this.sendCloseMessage();
        return;
      }

      let closed = false;

      // Estratégia 1: chrome.sidePanel.close() (Chrome 129+)
      if (typeof (chrome.sidePanel as Record<string, unknown>)['close'] === 'function' && targetWindowId) {
        try {
          await (chrome.sidePanel as unknown as { close: (opts: { windowId: number }) => Promise<void> }).close({ windowId: targetWindowId });
          closed = true;
          this.logger.info('GENERAL', 'SIDEPANEL_CLOSED_VIA_API', { windowId: targetWindowId });
        } catch (closeError) {
          this.logger.warn('GENERAL', 'SIDEPANEL_CLOSE_API_FAILED', {
            error: closeError instanceof Error ? closeError.message : String(closeError),
          });
        }
      }

      // Estratégia 2: Desabilitar e reabilitar via setOptions (Chrome 116+)
      if (!closed) {
        try {
          // Desabilitar fecha o side panel
          await chrome.sidePanel.setOptions({ enabled: false });
          // Pequeno delay para garantir que o Chrome processou o fechamento
          await new Promise(r => setTimeout(r, 50));
          // Reabilitar para permitir abertura futura
          await chrome.sidePanel.setOptions({ enabled: true });
          closed = true;
          this.logger.info('GENERAL', 'SIDEPANEL_CLOSED_VIA_SET_OPTIONS', {});
        } catch (optionsError) {
          this.logger.warn('GENERAL', 'SIDEPANEL_SET_OPTIONS_CLOSE_FAILED', {
            error: optionsError instanceof Error ? optionsError.message : String(optionsError),
          });
        }
      }

      // Estratégia 3: Enviar mensagem para window.close() como fallback
      if (!closed) {
        await this.sendCloseMessage();
      }

      this.isOpen = false;
      this.currentWindowId = null;

      this.logger.info('GENERAL', 'SIDEPANEL_CLOSED', {});
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.error('GENERAL', 'SIDEPANEL_CLOSE_FAILED', {
        error: errorMessage,
      });
      // Não lançar exceção - fechamento do side panel não deve bloquear o fluxo
    }
  }

  /**
   * Envia mensagem CLOSE_SIDEPANEL para o side panel executar window.close()
   * Usado como fallback quando a API do Chrome não está disponível
   */
  private async sendCloseMessage(): Promise<void> {
    try {
      await chrome.runtime.sendMessage({ type: 'CLOSE_SIDEPANEL' });
    } catch {
      // Ignorar erro se Side Panel não estiver aberto
    }
  }

  /**
   * Verifica se o Side Panel está aberto
   *
   * @returns true se o Side Panel está aberto
   */
  getIsOpen(): boolean {
    return this.isOpen;
  }

  /**
   * Obtém o ID da janela atual do Side Panel
   *
   * @returns ID da janela ou null se não estiver aberto
   */
  getCurrentWindowId(): number | null {
    return this.currentWindowId;
  }

  /**
   * Envia mensagem para o Side Panel
   *
   * @param message - Mensagem a ser enviada
   * @returns Promise que resolve quando a mensagem é enviada
   */
  async sendMessage(message: SidePanelMessage): Promise<void> {
    try {
      // Enviar mensagem via chrome.runtime.sendMessage
      // O Side Panel escuta mensagens do runtime
      await chrome.runtime.sendMessage(message);

      // Log apenas em desenvolvimento para não poluir logs de produção
      // this.logger.info('GENERAL', 'SIDEPANEL_MESSAGE_SENT', { type: message.type });
    } catch (error) {
      // Ignorar erro se Side Panel não estiver conectado
      // Isso é esperado quando o panel está fechado
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

      // Não logar como erro se for "Could not establish connection"
      // pois isso é esperado quando o panel está fechado
      if (!errorMessage.includes('Could not establish connection')) {
        this.logger.warn('GENERAL', 'SIDEPANEL_MESSAGE_FAILED', {
          type: message.type,
          error: errorMessage,
        });
      }
    }
  }

  /**
   * Envia atualização de estado da gravação para o Side Panel
   *
   * @param state - Estado atual da gravação
   */
  async sendRecordingStateUpdate(state: RecordingState): Promise<void> {
    await this.sendMessage({
      type: 'RECORDING_STATE_UPDATE',
      payload: state,
    });
  }

  /**
   * Envia atualização de estatísticas para o Side Panel
   *
   * @param stats - Estatísticas parciais a atualizar
   */
  async sendStatsUpdate(stats: Partial<RecordingState['stats']>): Promise<void> {
    await this.sendMessage({
      type: 'STATS_UPDATE',
      payload: stats,
    });
  }

  /**
   * Envia nova entrada de navegação para o Side Panel
   *
   * @param entry - Entrada de navegação
   */
  async sendNavigationUpdate(entry: RecordingState['navigationHistory'][0]): Promise<void> {
    await this.sendMessage({
      type: 'NAVIGATION_UPDATE',
      payload: entry,
    });
  }

  /**
   * Envia alerta para o Side Panel
   *
   * @param alert - Alerta a exibir
   */
  async sendAlert(alert: RecordingState['alerts'][0]): Promise<void> {
    await this.sendMessage({
      type: 'ALERT',
      payload: alert,
    });
  }

  /**
   * Envia progresso de upload para o Side Panel
   *
   * @param progress - Progresso do upload
   */
  async sendUploadProgress(progress: RecordingState['uploadProgress']): Promise<void> {
    await this.sendMessage({
      type: 'UPLOAD_PROGRESS',
      payload: progress,
    });
  }

  /**
   * Configura o comportamento do Side Panel
   * Pode ser usado para abrir automaticamente ao clicar no ícone da extensão
   *
   * @param openOnActionClick - Se deve abrir ao clicar no ícone
   */
  async setPanelBehavior(openOnActionClick: boolean): Promise<void> {
    try {
      if (!chrome.sidePanel) {
        this.logger.warn('GENERAL', 'SIDEPANEL_API_NOT_AVAILABLE', {});
        return;
      }

      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: openOnActionClick });

      this.logger.info('GENERAL', 'SIDEPANEL_BEHAVIOR_SET', {
        openOnActionClick,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.error('GENERAL', 'SIDEPANEL_BEHAVIOR_SET_FAILED', {
        error: errorMessage,
      });
    }
  }

  /**
   * Habilita ou desabilita o Side Panel para uma aba específica
   *
   * @param tabId - ID da aba
   * @param enabled - Se o Side Panel deve estar habilitado
   */
  async setEnabledForTab(tabId: number, enabled: boolean): Promise<void> {
    try {
      if (!chrome.sidePanel) {
        return;
      }

      await chrome.sidePanel.setOptions({
        tabId,
        enabled,
      });

      // Log apenas em desenvolvimento para não poluir logs de produção
      // this.logger.info('GENERAL', 'SIDEPANEL_TAB_ENABLED_SET', { tabId, enabled });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.warn('GENERAL', 'SIDEPANEL_TAB_ENABLED_SET_FAILED', {
        tabId,
        enabled,
        error: errorMessage,
      });
    }
  }
}

/** Instância singleton do SidePanelHandler */
let sidePanelHandlerInstance: SidePanelHandler | null = null;

/**
 * Obtém instância singleton do SidePanelHandler
 *
 * @param config - Configuração opcional para nova instância
 * @returns Instância do SidePanelHandler
 */
export function getSidePanelHandler(config?: SidePanelHandlerConfig): SidePanelHandler {
  sidePanelHandlerInstance ??= new SidePanelHandler(config);
  return sidePanelHandlerInstance;
}

/**
 * Reseta instância singleton (para testes)
 */
export function resetSidePanelHandler(): void {
  sidePanelHandlerInstance = null;
}

export default SidePanelHandler;
