/**
 * Handler de Mensagens do Processing Overlay
 *
 * Gerencia a comunicação entre o background script e o ProcessingOverlay
 * injetado na aba capturada. Permite atualização em tempo real do progresso
 * e tratamento de erros com opção de retry.
 *
 * @module OverlayMessageHandler
 * @see Requirements 1: Processing Overlay Post-Capture
 */

import { AuditLogger } from '../../lib/audit-logger';
import type { PostCaptureState } from './post-capture-processor';
import type { ProcessingStep, ProcessingError } from '../../overlay/processing-overlay';

// ============================================================================
// Tipos de Mensagens
// ============================================================================

/**
 * Tipos de mensagens do overlay
 */
export type OverlayMessageType =
  | 'OVERLAY_SHOW'
  | 'OVERLAY_HIDE'
  | 'OVERLAY_UPDATE_STATE'
  | 'OVERLAY_ERROR'
  | 'OVERLAY_RETRY_REQUESTED'
  | 'OVERLAY_COMPLETE';

/**
 * Mensagem base do overlay
 */
export interface OverlayMessage {
  type: OverlayMessageType;
  target: 'overlay';
  evidenceId: string;
}

/**
 * Mensagem para mostrar o overlay
 */
export interface OverlayShowMessage extends OverlayMessage {
  type: 'OVERLAY_SHOW';
  data: {
    evidenceId: string;
    steps: ProcessingStep[];
    progress: number;
  };
}

/**
 * Mensagem para esconder o overlay
 */
export interface OverlayHideMessage extends OverlayMessage {
  type: 'OVERLAY_HIDE';
  data: {
    previewUrl?: string;
  };
}

/**
 * Mensagem para atualizar estado do overlay
 */
export interface OverlayUpdateStateMessage extends OverlayMessage {
  type: 'OVERLAY_UPDATE_STATE';
  data: {
    steps: ProcessingStep[];
    progress: number;
    error: ProcessingError | null;
  };
}

/**
 * Mensagem de erro do overlay
 */
export interface OverlayErrorMessage extends OverlayMessage {
  type: 'OVERLAY_ERROR';
  data: {
    error: ProcessingError;
  };
}

/**
 * Mensagem de retry solicitado pelo overlay
 */
export interface OverlayRetryMessage extends OverlayMessage {
  type: 'OVERLAY_RETRY_REQUESTED';
}

/**
 * Mensagem de processamento completo
 */
export interface OverlayCompleteMessage extends OverlayMessage {
  type: 'OVERLAY_COMPLETE';
  data: {
    previewUrl: string;
  };
}

/**
 * União de todos os tipos de mensagem
 */
export type AnyOverlayMessage =
  | OverlayShowMessage
  | OverlayHideMessage
  | OverlayUpdateStateMessage
  | OverlayErrorMessage
  | OverlayRetryMessage
  | OverlayCompleteMessage;

// ============================================================================
// Handler de Mensagens
// ============================================================================

/**
 * Handler de mensagens do Processing Overlay
 *
 * Responsável por:
 * - Injetar o overlay na aba capturada
 * - Enviar atualizações de estado para o overlay
 * - Receber solicitações de retry do overlay
 * - Remover o overlay quando processamento completa
 */
export class OverlayMessageHandler {
  private logger: AuditLogger;
  private activeTabId: number | null = null;
  private retryCallback: (() => Promise<void>) | null = null;

  constructor(logger: AuditLogger) {
    this.logger = logger;
  }

  /**
   * Mostra o overlay na aba especificada
   *
   * @param tabId - ID da aba onde mostrar o overlay
   * @param evidenceId - ID da evidência sendo processada
   * @param initialState - Estado inicial do processamento
   */
  async showOverlay(
    tabId: number,
    evidenceId: string,
    initialState: PostCaptureState
  ): Promise<void> {
    this.activeTabId = tabId;

    this.logger.info('OVERLAY', 'SHOW_REQUESTED', {
      tabId,
      evidenceId,
    });

    try {
      // Enviar mensagem para o content script mostrar o overlay
      await chrome.tabs.sendMessage(tabId, {
        type: 'OVERLAY_SHOW',
        target: 'overlay',
        evidenceId,
        data: {
          evidenceId,
          steps: initialState.steps,
          progress: initialState.progress,
        },
      } as OverlayShowMessage);

      this.logger.info('OVERLAY', 'SHOW_SUCCESS', {
        tabId,
        evidenceId,
      });
    } catch (error) {
      this.logger.error('OVERLAY', 'SHOW_FAILED', {
        tabId,
        evidenceId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Não lançar erro - overlay é opcional para feedback visual
    }
  }

  /**
   * Atualiza estado do overlay
   *
   * @param state - Novo estado do processamento
   */
  async updateState(state: PostCaptureState): Promise<void> {
    if (!this.activeTabId) {
      return;
    }

    try {
      await chrome.tabs.sendMessage(this.activeTabId, {
        type: 'OVERLAY_UPDATE_STATE',
        target: 'overlay',
        evidenceId: state.evidenceId,
        data: {
          steps: state.steps,
          progress: state.progress,
          error: state.error,
        },
      } as OverlayUpdateStateMessage);
    } catch (error) {
      // Tab pode ter sido fechada, ignorar silenciosamente
      this.logger.debug('OVERLAY', 'UPDATE_STATE_FAILED', {
        tabId: this.activeTabId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Mostra erro no overlay
   *
   * @param evidenceId - ID da evidência
   * @param error - Erro a ser exibido
   */
  async showError(evidenceId: string, error: ProcessingError): Promise<void> {
    if (!this.activeTabId) {
      return;
    }

    this.logger.info('OVERLAY', 'SHOW_ERROR', {
      tabId: this.activeTabId,
      evidenceId,
      error: error.message,
      retryable: error.retryable,
    });

    try {
      await chrome.tabs.sendMessage(this.activeTabId, {
        type: 'OVERLAY_ERROR',
        target: 'overlay',
        evidenceId,
        data: { error },
      } as OverlayErrorMessage);
    } catch (err) {
      this.logger.debug('OVERLAY', 'SHOW_ERROR_FAILED', {
        tabId: this.activeTabId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Esconde o overlay e abre página de preview
   *
   * @param evidenceId - ID da evidência
   * @param previewUrl - URL da página de preview
   */
  async hideAndOpenPreview(evidenceId: string, previewUrl: string): Promise<void> {
    if (!this.activeTabId) {
      return;
    }

    this.logger.info('OVERLAY', 'HIDE_AND_OPEN_PREVIEW', {
      tabId: this.activeTabId,
      evidenceId,
      previewUrl,
    });

    try {
      // Enviar mensagem para esconder overlay
      await chrome.tabs.sendMessage(this.activeTabId, {
        type: 'OVERLAY_COMPLETE',
        target: 'overlay',
        evidenceId,
        data: { previewUrl },
      } as OverlayCompleteMessage);
    } catch (error) {
      this.logger.debug('OVERLAY', 'HIDE_FAILED', {
        tabId: this.activeTabId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Limpar referência
    this.activeTabId = null;
  }

  /**
   * Registra callback para retry
   *
   * @param callback - Função a ser chamada quando usuário solicitar retry
   */
  onRetryRequested(callback: () => Promise<void>): void {
    this.retryCallback = callback;
  }

  /**
   * Processa mensagem de retry do overlay
   *
   * @param message - Mensagem de retry
   */
  async handleRetryRequest(message: OverlayRetryMessage): Promise<void> {
    this.logger.info('OVERLAY', 'RETRY_REQUESTED', {
      evidenceId: message.evidenceId,
    });

    if (this.retryCallback) {
      await this.retryCallback();
    }
  }

  /**
   * Processa mensagens recebidas do overlay
   *
   * @param message - Mensagem recebida
   * @returns Resposta para o overlay
   */
  async handleMessage(message: AnyOverlayMessage): Promise<{ success: boolean }> {
    if (message.target !== 'overlay') {
      return { success: false };
    }

    switch (message.type) {
      case 'OVERLAY_RETRY_REQUESTED':
        await this.handleRetryRequest(message as OverlayRetryMessage);
        return { success: true };

      default:
        this.logger.warn('OVERLAY', 'UNKNOWN_MESSAGE_TYPE', {
          type: message.type,
        });
        return { success: false };
    }
  }

  /**
   * Limpa estado do handler
   */
  cleanup(): void {
    this.activeTabId = null;
    this.retryCallback = null;
  }
}

/**
 * Cria instância do OverlayMessageHandler
 */
export function createOverlayMessageHandler(logger: AuditLogger): OverlayMessageHandler {
  return new OverlayMessageHandler(logger);
}

export default OverlayMessageHandler;
