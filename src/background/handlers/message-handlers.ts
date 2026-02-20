/**
 * Mapa de handlers de mensagens do Service Worker
 *
 * Substitui o switch case longo por um mapa de handlers tipado.
 * Cada handler é uma função assíncrona que processa um tipo específico de mensagem.
 *
 * Requisito 3.5: Gerenciamento de mensagens entre popup e content scripts
 *
 * @module MessageHandlers
 */

import type { AuditLogger } from '../../lib/audit-logger';
import type {
  Message,
  MessageResponse,
  MessageType,
  StartCapturePayload,
  LoginPayload,
  CaptureState,
} from '../../types/api.types';
import type { StorageType } from '../../types/capture.types';
import { getSupabaseClient } from '../../lib/supabase/client';

// ============================================================================
// Tipos
// ============================================================================

/**
 * Contexto passado para cada handler de mensagem
 */
export interface MessageHandlerContext {
  /** Logger para auditoria */
  logger: AuditLogger;
  /** ID de correlação para rastreabilidade */
  correlationId: string;
  /** Informações do remetente */
  sender: chrome.runtime.MessageSender;
}

/**
 * Assinatura de um handler de mensagem
 */
export type MessageHandler<TPayload = unknown, TResponse = unknown> = (
  payload: TPayload,
  context: MessageHandlerContext
) => Promise<MessageResponse<TResponse>>;

/**
 * Mapa de handlers por tipo de mensagem
 */
export type MessageHandlerMap = Partial<Record<MessageType, MessageHandler>>;

// ============================================================================
// Payloads tipados
// ============================================================================

export interface CaptureCompletePayload {
  success: boolean;
  error?: string;
}

export interface CaptureProgressPayload {
  stage?: string;
  percent?: number;
  message?: string;
  currentViewport?: number;
  totalViewports?: number;
}

export interface CaptureViewportPayload {
  format?: 'png' | 'jpeg';
  quality?: number;
}

export interface PresignedUrlPayload {
  fileType: string;
  fileSize: number;
  storageType: StorageType;
  captureId: string;
  contentType: string;
  fileName?: string;
}

export interface UploadCompletePayload {
  captureId: string;
  storageType: StorageType;
  files: Array<{
    type: string;
    objectKey: string;
    downloadUrl: string;
    contentType: string;
    sizeBytes: number;
  }>;
  combinedHash?: string;
}

// ============================================================================
// Factory de Handlers
// ============================================================================

/**
 * Cria o mapa de handlers de mensagens
 *
 * @param deps - Dependências injetadas (funções do service worker)
 * @returns Mapa de handlers por tipo de mensagem
 */
export function createMessageHandlers(deps: {
  getAuthStatus: () => Promise<MessageResponse>;
  handleLogin: (payload: LoginPayload, logger: AuditLogger) => Promise<MessageResponse>;
  handleLogout: (logger: AuditLogger) => Promise<MessageResponse>;
  refreshAccessToken: (logger: AuditLogger) => Promise<boolean>;
  getStoredTokens: () => Promise<{ accessToken: string; refreshToken: string; expiresAt: number } | null>;
  startCapture: (payload: StartCapturePayload, logger: AuditLogger) => Promise<MessageResponse<CaptureState>>;
  stopCapture: (logger: AuditLogger) => Promise<MessageResponse>;
  cancelCapture: (logger: AuditLogger) => Promise<MessageResponse>;
  getCaptureStatus: () => Promise<MessageResponse<CaptureState | null>>;
  handleCaptureComplete: (success: boolean, error: string | undefined, logger: AuditLogger) => Promise<MessageResponse>;
  handleCaptureViewport: (payload: CaptureViewportPayload | undefined, context: MessageHandlerContext) => Promise<MessageResponse>;
  handleCaptureProgress: (payload: CaptureProgressPayload | undefined, context: MessageHandlerContext) => Promise<MessageResponse>;
  handlePresignedUrl: (payload: PresignedUrlPayload | undefined, context: MessageHandlerContext) => Promise<MessageResponse>;
  handleUploadComplete: (payload: UploadCompletePayload | undefined, context: MessageHandlerContext) => Promise<MessageResponse>;
  forceResetIsolation: (logger: AuditLogger) => Promise<MessageResponse>;
  getIsolationManager: (logger: AuditLogger) => {
    getIsolationStatus: () => unknown;
    previewIsolation: () => Promise<unknown>;
    activateIsolation: (correlationId: string) => Promise<{ success: boolean; error?: string; errorCode?: string }>;
    deactivateIsolation: () => Promise<{ success: boolean; error?: string; errorCode?: string }>;
    forceRestore: () => Promise<{ success: boolean; error?: string; errorCode?: string; restoredExtensions: unknown[]; failedExtensions: unknown[] }>;
    checkForViolations: () => Promise<unknown[]>;
  };
  getStoredUser: () => Promise<{ credits?: number } | null>;
  generateCorrelationId: () => string;
}): MessageHandlerMap {
  return {
    // ========================================================================
    // Mensagens de Sistema
    // ========================================================================

    PING: async () => ({
      success: true,
      data: 'PONG',
    }),

    GET_VERSION: async () => ({
      success: true,
      data: {
        version: chrome.runtime.getManifest().version,
        name: chrome.runtime.getManifest().name,
      },
    }),

    // ========================================================================
    // Mensagens de Autenticação
    // ========================================================================

    GET_AUTH_STATUS: async () => deps.getAuthStatus(),

    LOGIN: async (payload, { logger }) =>
      deps.handleLogin(payload as LoginPayload, logger),

    LOGOUT: async (_, { logger }) => deps.handleLogout(logger),

    REFRESH_TOKEN: async (_, { logger }) => {
      const refreshed = await deps.refreshAccessToken(logger);
      if (refreshed) {
        return { success: true };
      }
      return {
        success: false,
        error: 'Falha ao renovar token',
      };
    },

    AUTH_REFRESH_TOKEN: async (_, { logger, correlationId }) => {
      logger.info('AUTH', 'REFRESH_TOKEN_REQUESTED', { correlationId });

      const success = await deps.refreshAccessToken(logger);

      if (success) {
        const tokens = await deps.getStoredTokens();
        logger.info('AUTH', 'REFRESH_TOKEN_RESPONSE_SUCCESS', {
          correlationId,
          hasTokens: !!tokens,
        });
        return {
          success: true,
          data: { tokens },
        };
      }

      logger.warn('AUTH', 'REFRESH_TOKEN_RESPONSE_FAILED', { correlationId });
      return {
        success: false,
        error: 'Falha ao renovar sessão. Faça login novamente.',
      };
    },

    // ========================================================================
    // Mensagens de Captura
    // ========================================================================

    START_CAPTURE: async (payload, { logger }) =>
      deps.startCapture(payload as StartCapturePayload, logger),

    STOP_CAPTURE: async (_, { logger }) => deps.stopCapture(logger),

    CANCEL_CAPTURE: async (_, { logger }) => deps.cancelCapture(logger),

    GET_CAPTURE_STATUS: async () => deps.getCaptureStatus(),

    CAPTURE_GET_RECENT: async () => ({
      success: true,
      data: { captures: [], total: 0, hasMore: false },
    }),

    CAPTURE_COMPLETE: async (payload, { logger }) => {
      const completePayload = payload as CaptureCompletePayload | undefined;
      return deps.handleCaptureComplete(
        completePayload?.success ?? false,
        completePayload?.error,
        logger
      );
    },

    CAPTURE_VIEWPORT: async (payload, context) =>
      deps.handleCaptureViewport(payload as CaptureViewportPayload | undefined, context),

    CAPTURE_PROGRESS: async (payload, context) =>
      deps.handleCaptureProgress(payload as CaptureProgressPayload | undefined, context),

    // ========================================================================
    // Mensagens de Isolamento
    // ========================================================================

    RESET_ISOLATION: async (_, { logger }) => deps.forceResetIsolation(logger),

    GET_ISOLATION_STATUS: async (_, { logger }) => {
      const manager = deps.getIsolationManager(logger);
      const status = manager.getIsolationStatus();
      return {
        success: true,
        data: status,
      };
    },

    PREVIEW_ISOLATION: async (_, { logger }) => {
      const manager = deps.getIsolationManager(logger);
      const preview = await manager.previewIsolation();
      return {
        success: true,
        data: preview,
      };
    },

    ACTIVATE_ISOLATION: async (_, { logger, correlationId }) => {
      const manager = deps.getIsolationManager(logger);
      const result = await manager.activateIsolation(correlationId);
      const response: MessageResponse = {
        success: result.success,
        data: result,
      };
      if (result.error) {
        response.error = result.error;
      }
      if (result.errorCode) {
        response.errorCode = result.errorCode;
      }
      return response;
    },

    DEACTIVATE_ISOLATION: async (_, { logger }) => {
      const manager = deps.getIsolationManager(logger);
      const result = await manager.deactivateIsolation();
      const response: MessageResponse = {
        success: result.success,
        data: result,
      };
      if (result.error) {
        response.error = result.error;
      }
      if (result.errorCode) {
        response.errorCode = result.errorCode;
      }
      return response;
    },

    FORCE_RESTORE_EXTENSIONS: async (_, { logger }) => {
      const manager = deps.getIsolationManager(logger);
      const result = await manager.forceRestore();
      const response: MessageResponse = {
        success: result.success,
        data: result,
      };
      if (result.error) {
        response.error = result.error;
      }
      if (result.errorCode) {
        response.errorCode = result.errorCode;
      }
      return response;
    },

    CHECK_ISOLATION_VIOLATIONS: async (_, { logger }) => {
      const manager = deps.getIsolationManager(logger);
      const violations = await manager.checkForViolations();
      return {
        success: true,
        data: { violations },
      };
    },

    // ========================================================================
    // Mensagens de Créditos
    // ========================================================================

    GET_CREDITS: async () => {
      const user = await deps.getStoredUser();
      return {
        success: true,
        data: { balance: user?.credits ?? 0, usedThisMonth: 0 },
      };
    },

    /**
     * Atualiza saldo de creditos via Supabase RPC
     * Chama get_user_credit_balance e atualiza o storage local
     */
    CREDITS_REFRESH: async (_, { logger }) => {
      logger.info('CREDITS', 'CREDITS_REFRESH_REQUESTED', {});

      try {
        const supabase = getSupabaseClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
          logger.warn('CREDITS', 'CREDITS_REFRESH_NO_AUTH', {});
          return {
            success: false,
            error: 'Usuario nao autenticado',
          };
        }

        // Busca saldo via RPC do Supabase (mesmo metodo do auth-manager)
        const { data: creditBalance, error: creditError } = await supabase
          .rpc('get_user_credit_balance', { p_user_id: user.id });

        if (creditError) {
          logger.error('CREDITS', 'CREDITS_REFRESH_RPC_ERROR', {
            error: creditError.message,
          });
          return {
            success: false,
            error: `Erro ao atualizar creditos: ${creditError.message}`,
          };
        }

        const credits = creditBalance || 0;

        // Atualiza storage local com novos creditos
        const result = await chrome.storage.local.get(['lexato_user']);
        const storedUser = result['lexato_user'] as { credits?: number } | undefined ?? {};
        storedUser.credits = credits;
        await chrome.storage.local.set({ lexato_user: storedUser });

        logger.info('CREDITS', 'CREDITS_REFRESH_SUCCESS', { credits });

        // Notifica todos os listeners sobre atualizacao
        chrome.runtime.sendMessage({
          type: 'CREDITS_UPDATED',
          payload: { credits },
        }).catch(() => {
          // Ignora erro se nao houver listeners
        });

        return {
          success: true,
          data: { credits },
        };
      } catch (error) {
        logger.error('CREDITS', 'CREDITS_REFRESH_ERROR', {
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
        return {
          success: false,
          error: 'Erro ao atualizar creditos',
        };
      }
    },

    // ========================================================================
    // Mensagens de Upload
    // ========================================================================

    GET_PRESIGNED_URL: async (payload, context) =>
      deps.handlePresignedUrl(payload as PresignedUrlPayload | undefined, context),

    NOTIFY_UPLOAD_COMPLETE: async (payload, context) =>
      deps.handleUploadComplete(payload as UploadCompletePayload | undefined, context),

    // ========================================================================
    // Mensagens de Certificação
    // ========================================================================

    GET_CERTIFICATION_STATUS: async () => ({
      success: false,
      error: 'Funcionalidade de certificação ainda não implementada',
    }),

    // ========================================================================
    // Mensagens de Evidências Pendentes
    // ========================================================================

    GET_PENDING_EVIDENCES: async (_, { logger }) => {
      logger.info('PENDING', 'GET_PENDING_EVIDENCES_REQUESTED', {});
      
      try {
        const supabase = getSupabaseClient();
        const { data: { user: authUser } } = await supabase.auth.getUser();
        
        if (!authUser) {
          logger.warn('PENDING', 'GET_PENDING_EVIDENCES_NO_AUTH', {});
          return {
            success: false,
            error: 'Usuario nao autenticado',
          };
        }

        // Busca evidencias pendentes via Supabase direto
        const { data, error, count } = await supabase
          .from('evidences')
          .select('*', { count: 'exact' })
          .eq('user_id', authUser.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) {
          logger.error('PENDING', 'GET_PENDING_EVIDENCES_QUERY_ERROR', {
            error: error.message,
          });
          return {
            success: false,
            error: `Erro ao buscar evidencias pendentes: ${error.message}`,
          };
        }
        
        logger.info('PENDING', 'GET_PENDING_EVIDENCES_SUCCESS', {
          total: count ?? 0,
        });

        return {
          success: true,
          data: {
            evidences: data || [],
            total: count ?? 0,
            maxPending: 10,
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
        logger.error('GENERAL', 'GET_PENDING_EVIDENCES_EXCEPTION', {
          error: errorMessage,
        });
        return {
          success: false,
          error: `Falha ao buscar evidencias pendentes: ${errorMessage}`,
        };
      }
    },
  };
}

/**
 * Processa mensagem usando o mapa de handlers
 *
 * @param message - Mensagem recebida
 * @param handlers - Mapa de handlers
 * @param context - Contexto da mensagem
 * @returns Resposta da mensagem
 */
export async function processMessage(
  message: Message,
  handlers: MessageHandlerMap,
  context: MessageHandlerContext
): Promise<MessageResponse> {
  const handler = handlers[message.type];

  if (!handler) {
    context.logger.warn('GENERAL', 'UNKNOWN_MESSAGE_TYPE', {
      type: message.type,
    });
    return {
      success: false,
      error: `Tipo de mensagem desconhecido: ${message.type}`,
    };
  }

  return handler(message.payload, context);
}
