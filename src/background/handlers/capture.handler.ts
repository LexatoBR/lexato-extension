/**
 * Handlers de Captura
 *
 * Funções extraídas de startCapture para melhor testabilidade e manutenção.
 * Cada função tem responsabilidade única seguindo SRP.
 *
 * MIGRAÇÃO PARA PIPELINE UNIFICADO:
 * Este módulo está em processo de migração para usar o EvidencePipeline.
 * As funções legadas estão marcadas como @deprecated e serão removidas
 * após 2 semanas de operação estável do novo pipeline.
 *
 * Requisitos:
 * - 3.4: Orquestração do fluxo de captura
 * - 6.1: Ativar isolamento ANTES de iniciar PISA
 * - 6.4, 6.5: Garantir restauração de extensões
 * - 6.6: Fallback para isolamento parcial
 * - 13.4, 13.5, 13.7: Migração incremental com compatibilidade
 *
 * @module CaptureHandler
 */

import type { AuditLogger } from '../../lib/audit-logger';
import { ErrorCodes } from '../../lib/errors';
import { verificarUrlBloqueada } from '../../lib/blocked-urls';
import type { StartCapturePayload, CaptureState } from '../../types/api.types';
import type { CaptureStatus } from '../../types/capture.types';
import { DELAYS } from '../utils/constants';
import { getErrorMessage } from '../utils/error-helpers';

// ============================================================================
// Tipos
// ============================================================================

/**
 * Resultado da validação de pré-requisitos
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  errorCode?: string;
  tab?: chrome.tabs.Tab;
  tokens?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  };
}

/**
 * Resultado do setup de isolamento
 */
export interface IsolationSetupResult {
  success: boolean;
  mode: 'full' | 'partial' | 'none';
  disabledExtensions: string[];
  nonDisabledExtensionNames: string[];
  snapshotHash: string | undefined;
  error: string | undefined;
}

/**
 * Dados da captura PISA
 */
export interface PisaCaptureData {
  status: CaptureStatus;
  imageData?: string;
  imageHash?: string;
  htmlContent?: string;
  htmlHash?: string;
  metadata?: Record<string, unknown>;
  metadataHash?: string;
  progressMessage?: string;
}

/**
 * Resultado da execução do PISA
 */
export interface PisaExecutionResult {
  success: boolean;
  data?: PisaCaptureData;
  error?: string;
  errorCode?: string;
}

// ============================================================================
// Validação de Pré-requisitos
// ============================================================================

/**
 * Valida pré-requisitos para iniciar captura
 *
 * Verifica:
 * - Se não há captura em andamento
 * - Se usuário está autenticado
 * - Se token não está expirado
 * - Se aba ativa é acessível
 * - Se URL não está bloqueada
 *
 * @deprecated Esta função será substituída por validação interna do EvidencePipeline.
 * Usar startCaptureWithPipeline() para novos fluxos.
 *
 * @param currentState - Estado atual de captura (se houver)
 * @param getStoredTokens - Função para obter tokens armazenados
 * @param isTokenExpiringSoon - Função para verificar expiração
 * @param refreshAccessToken - Função para renovar token
 * @param logger - Logger para auditoria
 * @returns Resultado da validação
 */
export async function validateCapturePrerequisites(
  currentState: CaptureState | null,
  getStoredTokens: () => Promise<{ accessToken: string; refreshToken: string; expiresAt: number } | null>,
  isTokenExpiringSoon: (expiresAt: number) => boolean,
  refreshAccessToken: (logger: AuditLogger) => Promise<boolean>,
  logger: AuditLogger
): Promise<ValidationResult> {
  // Verificar se já há captura em andamento
  if (currentState && currentState.status !== 'completed' && currentState.status !== 'failed') {
    logger.warn('CAPTURE', 'CAPTURE_ALREADY_IN_PROGRESS', {
      currentCaptureId: currentState.id,
      currentStatus: currentState.status,
    });
    return {
      valid: false,
      error: 'Já existe uma captura em andamento',
      errorCode: ErrorCodes.CAPTURE_FAILED,
    };
  }

  // Verificar autenticação
  logger.info('CAPTURE', 'CHECKING_AUTH', {});
  const tokens = await getStoredTokens();
  if (!tokens) {
    logger.error('CAPTURE', 'AUTH_REQUIRED', {});
    return {
      valid: false,
      error: 'Usuário não autenticado',
      errorCode: ErrorCodes.AUTH_TOKEN_INVALID,
    };
  }
  logger.info('CAPTURE', 'AUTH_VALID', {
    tokenExpiresAt: new Date(tokens.expiresAt).toISOString(),
  });

  // Verificar se token precisa de refresh
  if (isTokenExpiringSoon(tokens.expiresAt)) {
    logger.info('CAPTURE', 'TOKEN_REFRESH_NEEDED', {});
    await refreshAccessToken(logger);
  }

  // Obter aba ativa
  logger.info('CAPTURE', 'GETTING_ACTIVE_TAB', {});
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  logger.info('CAPTURE', 'ACTIVE_TAB_INFO', {
    tabId: activeTab?.id,
    url: activeTab?.url,
    title: activeTab?.title,
    status: activeTab?.status,
  });

  if (!activeTab?.id || !activeTab.url) {
    logger.error('CAPTURE', 'TAB_ACCESS_FAILED', {
      hasId: !!activeTab?.id,
      hasUrl: !!activeTab?.url,
    });
    return {
      valid: false,
      error: 'Não foi possível acessar a aba atual',
      errorCode: ErrorCodes.PERMISSION_TAB_ACCESS,
    };
  }

  // Verificar se URL está bloqueada para captura
  const verificacaoUrl = verificarUrlBloqueada(activeTab.url);
  if (verificacaoUrl.bloqueada) {
    logger.warn('CAPTURE', 'URL_BLOQUEADA', {
      url: activeTab.url,
      motivo: verificacaoUrl.motivo,
      categoria: verificacaoUrl.categoria,
    });
    return {
      valid: false,
      error: verificacaoUrl.motivo ?? 'Esta página não pode ser capturada',
      errorCode: ErrorCodes.CAPTURE_FAILED,
    };
  }

  return {
    valid: true,
    tab: activeTab,
    tokens,
  };
}

// ============================================================================
// Setup de Isolamento
// ============================================================================

/**
 * Configura isolamento de extensões para captura
 *
 * Requisitos:
 * - 6.1: Ativar isolamento ANTES de iniciar PISA
 * - 6.6: Fallback para isolamento parcial
 *
 * @deprecated Esta função será substituída por isolamento interno do EvidencePipeline.
 * Usar startCaptureWithPipeline() para novos fluxos.
 *
 * @param captureId - ID da captura
 * @param isolationManager - Gerenciador de isolamento
 * @param logger - Logger para auditoria
 * @returns Resultado do setup
 */
export async function setupCaptureIsolation(
  captureId: string,
  isolationManager: {
    activateIsolation: (correlationId: string) => Promise<{
      success: boolean;
      error?: string;
      disabledExtensions: string[];
      nonDisableableExtensions: Array<{ name: string }>;
      snapshot?: { hash: string };
    }>;
  },
  logger: AuditLogger
): Promise<IsolationSetupResult> {
  const isolationResult = await isolationManager.activateIsolation(captureId);

  let isolationMode: 'full' | 'partial' | 'none' = 'none';
  const nonDisabledExtensionNames = isolationResult.nonDisableableExtensions.map((ext) => ext.name);

  if (!isolationResult.success) {
    logger.warn('CAPTURE', 'ISOLATION_ACTIVATION_FAILED', {
      error: isolationResult.error,
      nonDisableableExtensions: nonDisabledExtensionNames,
    });

    // Verificar se houve isolamento parcial
    if (isolationResult.disabledExtensions.length > 0) {
      isolationMode = 'partial';
      logger.warn('CAPTURE', 'PARTIAL_ISOLATION_MODE', {
        disabledCount: isolationResult.disabledExtensions.length,
        nonDisableableCount: isolationResult.nonDisableableExtensions.length,
        nonDisableableExtensions: nonDisabledExtensionNames,
      });
    } else {
      logger.warn('CAPTURE', 'NO_ISOLATION_MODE', {
        reason: isolationResult.error,
      });
    }
  } else {
    isolationMode = 'full';
    logger.info('CAPTURE', 'ISOLATION_ACTIVATED', {
      disabledCount: isolationResult.disabledExtensions.length,
      snapshotHash: isolationResult.snapshot?.hash,
    });
  }

  return {
    success: isolationResult.success,
    mode: isolationMode,
    disabledExtensions: isolationResult.disabledExtensions,
    nonDisabledExtensionNames,
    snapshotHash: isolationResult.snapshot?.hash,
    error: isolationResult.error,
  };
}

// ============================================================================
// Verificação de Permissões
// ============================================================================

/**
 * Verifica e solicita permissões de host se necessário
 *
 * @deprecated Esta função será substituída por verificação interna do EvidencePipeline.
 * Usar startCaptureWithPipeline() para novos fluxos.
 *
 * @param url - URL da página a capturar
 * @param verificarPermissaoHost - Função para verificar permissão
 * @param solicitarPermissaoHost - Função para solicitar permissão
 * @param logger - Logger para auditoria
 * @returns true se permissão está disponível
 */
export async function ensureHostPermission(
  url: string,
  verificarPermissaoHost: (url: string, logger: AuditLogger) => Promise<{ temPermissao: boolean; origem?: string }>,
  solicitarPermissaoHost: (url: string, logger: AuditLogger) => Promise<boolean>,
  logger: AuditLogger
): Promise<{ hasPermission: boolean; error?: string }> {
  const verificacao = await verificarPermissaoHost(url, logger);

  if (!verificacao.temPermissao) {
    const permissaoConcedida = await solicitarPermissaoHost(url, logger);

    if (!permissaoConcedida) {
      logger.error('CAPTURE', 'HOST_PERMISSION_DENIED', {
        url,
        origem: verificacao.origem,
      });

      return {
        hasPermission: false,
        error: 'Permissão de captura necessária. Por favor, permita o acesso ao site quando solicitado, ou clique com botão direito no ícone da extensão → "Pode ler e alterar dados do site" → "Em todos os sites".',
      };
    }
  }

  return { hasPermission: true };
}

// ============================================================================
// Reload e Preparação da Página
// ============================================================================

/**
 * Recarrega página e aguarda estabilização
 *
 * @deprecated Esta função será substituída por reload interno do EvidencePipeline.
 * Usar startCaptureWithPipeline() para novos fluxos.
 *
 * @param tabId - ID da aba
 * @param reloadPageAndWaitForComplete - Função de reload
 * @param logger - Logger para auditoria
 * @returns Resultado do reload
 */
export async function reloadAndStabilizePage(
  tabId: number,
  reloadPageAndWaitForComplete: (tabId: number, logger: AuditLogger) => Promise<void>,
  logger: AuditLogger
): Promise<{ success: boolean; error?: string }> {
  try {
    await reloadPageAndWaitForComplete(tabId, logger);
    logger.info('CAPTURE', 'PAGE_RELOAD_SUCCESS', { tabId });

    // Aguardar estabilização pós-reload
    await new Promise((resolve) => setTimeout(resolve, DELAYS.POST_RELOAD_STABILIZATION_MS));

    return { success: true };
  } catch (error) {
    const errorMsg = getErrorMessage(error);
    logger.error('CAPTURE', 'PAGE_RELOAD_ERROR', {
      tabId,
      error: errorMsg,
    });

    return {
      success: false,
      error: `Falha ao recarregar página: ${errorMsg}`,
    };
  }
}

// ============================================================================
// Execução do PISA
// ============================================================================

/**
 * Executa captura PISA no content script
 *
 * @deprecated Esta função será substituída por captura via EvidencePipeline.
 * Usar startCaptureWithPipeline() para novos fluxos.
 *
 * @param tabId - ID da aba
 * @param captureId - ID da captura
 * @param payload - Payload da captura
 * @param isolationResult - Resultado do isolamento
 * @param logger - Logger para auditoria
 * @returns Resultado da execução
 */
export async function executePisaCapture(
  tabId: number,
  captureId: string,
  payload: StartCapturePayload,
  isolationResult: IsolationSetupResult,
  logger: AuditLogger
): Promise<PisaExecutionResult> {
  const pisaPayload = {
    captureId,
    captureType: payload.type,
    storageType: payload.storageType,
    isolationSnapshotHash: isolationResult.snapshotHash,
    disabledExtensionIds: isolationResult.disabledExtensions,
    isolationMetadata: {
      mode: isolationResult.mode,
      disabledCount: isolationResult.disabledExtensions.length,
      nonDisabledExtensions: isolationResult.nonDisabledExtensionNames,
      warning:
        isolationResult.mode === 'partial'
          ? 'Algumas extensões não puderam ser desativadas durante a captura'
          : isolationResult.mode === 'none'
            ? 'Isolamento de extensões não disponível durante a captura'
            : undefined,
    },
  };

  logger.info('CAPTURE', 'START_PISA_PAYLOAD', { payload: pisaPayload });

  const sendStartTime = Date.now();

  const pisaResponse = await chrome.tabs.sendMessage(tabId, {
    type: 'START_PISA',
    payload: pisaPayload,
  });

  const sendDuration = Date.now() - sendStartTime;

  logger.info('CAPTURE', 'START_PISA_RESPONSE', {
    response: pisaResponse,
    success: pisaResponse?.success,
    hasData: !!pisaResponse?.data,
    error: pisaResponse?.error,
    durationMs: sendDuration,
  });

  if (!pisaResponse?.success) {
    logger.error('CAPTURE', 'START_PISA_FAILED', {
      error: pisaResponse?.error,
      response: pisaResponse,
    });

    return {
      success: false,
      error: pisaResponse?.error ?? 'Falha ao iniciar captura PISA',
      errorCode: ErrorCodes.CAPTURE_FAILED,
    };
  }

  return {
    success: true,
    data: pisaResponse.data as PisaCaptureData,
  };
}

// ============================================================================
// Criação de Estado Inicial
// ============================================================================

/**
 * Cria estado inicial da captura
 *
 * @deprecated Esta função será substituída por criação de estado via EvidencePipeline.
 * Usar startCaptureWithPipeline() para novos fluxos.
 *
 * @param captureId - ID da captura
 * @param payload - Payload da captura
 * @param tab - Aba ativa
 * @returns Estado inicial
 */
export function createInitialCaptureState(
  captureId: string,
  payload: StartCapturePayload,
  tab: chrome.tabs.Tab
): CaptureState {
  // Tab.id e tab.url são garantidos pela validação prévia
  const tabId = payload.tabId ?? (tab.id as number);
  const url = tab.url as string;
  
  return {
    id: captureId,
    type: payload.type,
    storageType: payload.storageType,
    status: 'initializing',
    tabId,
    url,
    title: tab.title ?? '',
    startedAt: Date.now(),
    progress: 0,
    progressMessage: 'Inicializando captura...',
  };
}

// ============================================================================
// Orquestração com EvidencePipeline
// ============================================================================

import type { EvidencePipeline, CaptureConfig, PipelineError } from '../../lib/evidence-pipeline/types';
import { createEvidencePipeline, ensureAPIClientInitialized, isAPIClientInitialized } from '../../lib/evidence-pipeline';
import { getAPIClient } from '../api-client';
import { getApiUrl } from '../../config/environment';
import type { AuthTokens } from '../../types/auth.types';
import { PostCaptureProcessor } from './post-capture-processor';
import {
  getTabIsolationManager,
  getExtensionIsolationManager,
} from '../managers/isolation-managers';
import { setActivePipeline } from '../service-worker';

/**
 * Envia mensagem de erro do pipeline para todos os listeners (popup, sidepanel)
 *
 * @param error - Erro do pipeline estruturado
 */
function broadcastPipelineError(error: PipelineError): void {
  const errorMessage = {
    type: 'PIPELINE_ERROR',
    payload: {
      error: error.message,
      code: error.code,
      isRecoverable: error.recoverable,
      phase: error.phase,
      details: error.details ? JSON.stringify(error.details) : undefined,
    },
  };

  // Broadcast para todos os listeners (popup, sidepanel)
  chrome.runtime.sendMessage(errorMessage).catch(() => {
    // Ignorar erro se não há listeners ativos
  });

}

/**
 * Obtém tokens armazenados para inicialização do APIClient
 * Duplicado aqui para evitar dependência circular com service-worker.ts
 */
async function getStoredTokensForAPIClient(): Promise<AuthTokens | null> {
  const STORAGE_KEYS = {
    ACCESS_TOKEN: 'lexato_access_token',
    REFRESH_TOKEN: 'lexato_refresh_token',
    ID_TOKEN: 'lexato_id_token',
    EXPIRES_AT: 'lexato_expires_at',
    OBTAINED_AT: 'lexato_obtained_at',
  };

  const result = await chrome.storage.local.get([
    STORAGE_KEYS.ACCESS_TOKEN,
    STORAGE_KEYS.REFRESH_TOKEN,
    STORAGE_KEYS.ID_TOKEN,
    STORAGE_KEYS.EXPIRES_AT,
    STORAGE_KEYS.OBTAINED_AT,
  ]);

  if (!result[STORAGE_KEYS.ACCESS_TOKEN] || !result[STORAGE_KEYS.REFRESH_TOKEN]) {
    return null;
  }

  return {
    accessToken: result[STORAGE_KEYS.ACCESS_TOKEN],
    refreshToken: result[STORAGE_KEYS.REFRESH_TOKEN],
    idToken: result[STORAGE_KEYS.ID_TOKEN],
    expiresAt: result[STORAGE_KEYS.EXPIRES_AT],
    obtainedAt: result[STORAGE_KEYS.OBTAINED_AT],
  };
}

/**
 * Garante que o APIClient está inicializado antes de usar o pipeline
 * 
 * @param logger - Logger para auditoria
 * @returns true se inicializado com sucesso
 */
async function ensureAPIClientReadyForCapture(logger: AuditLogger): Promise<boolean> {
  if (isAPIClientInitialized()) {
    return true;
  }

  try {
    // Tentar obter cliente existente primeiro
    try {
      getAPIClient();
      return true;
    } catch {
      // Cliente não existe, precisamos inicializar
    }

    // Inicializar o APIClient com configuração padrão
    ensureAPIClientInitialized({
      baseURL: getApiUrl(),
      getTokens: getStoredTokensForAPIClient,
      refreshToken: async () => {
        logger.warn('AUTH', 'REFRESH_TOKEN_CALLED_FROM_CAPTURE_HANDLER', {});
        return false;
      },
      getCorrelationId: () => crypto.randomUUID(),
      logger: logger,
    });

    logger.info('CAPTURE', 'API_CLIENT_INITIALIZED', {});
    return true;
  } catch (error) {
    logger.error('CAPTURE', 'API_CLIENT_INIT_FAILED', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Dependências para o fluxo de captura
 * 
 * @deprecated Usar startCaptureWithPipeline() que não requer dependências externas
 */
export interface CaptureFlowDependencies {
  /** Pipeline de evidências */
  pipeline: EvidencePipeline;
  /** Estado atual de captura */
  currentState: CaptureState | null;
  /** Função para obter tokens armazenados */
  getStoredTokens: () => Promise<{ accessToken: string; refreshToken: string; expiresAt: number } | null>;
  /** Função para verificar expiração do token */
  isTokenExpiringSoon: (expiresAt: number) => boolean;
  /** Função para renovar token */
  refreshAccessToken: (logger: AuditLogger) => Promise<boolean>;
  /** Gerenciador de isolamento */
  isolationManager: {
    activateIsolation: (correlationId: string) => Promise<{
      success: boolean;
      error?: string;
      disabledExtensions: string[];
      nonDisableableExtensions: Array<{ name: string }>;
      snapshot?: { hash: string };
    }>;
  };
  /** Função para verificar permissão de host */
  verificarPermissaoHost: (url: string, logger: AuditLogger) => Promise<{ temPermissao: boolean; origem?: string }>;
  /** Função para solicitar permissão de host */
  solicitarPermissaoHost: (url: string, logger: AuditLogger) => Promise<boolean>;
  /** Função para recarregar página e aguardar */
  reloadPageAndWaitForComplete: (tabId: number, logger: AuditLogger) => Promise<void>;
  /** Função para garantir content script carregado */
  ensureContentScriptLoaded: (tabId: number, logger: AuditLogger) => Promise<boolean>;
  /** Função para persistir estado */
  persistCaptureState: (state: CaptureState) => Promise<void>;
  /** Função para gerar correlation ID */
  generateCorrelationId: () => string;
  /** Logger */
  logger: AuditLogger;
}

/**
 * Orquestra fluxo completo de captura de screenshot usando EvidencePipeline
 * 
 * Este handler centraliza toda a lógica de captura, delegando as fases
 * principais ao pipeline unificado:
 * 1. Validação e isolamento (helpers existentes)
 * 2. Captura via pipeline.startCapture()
 * 3. Timestamp via pipeline.applyTimestamp()
 * 4. Upload via pipeline.uploadToS3()
 * 5. Preview via pipeline.openPreview()
 * 
 * @param payload - Dados para iniciar a captura
 * @param deps - Dependências injetadas
 * @returns Estado final da captura
 * 
 * @deprecated Este handler será substituído por chamadas diretas ao EvidencePipeline
 * quando a migração completa estiver concluída
 */
export async function startCaptureFlow(
  payload: StartCapturePayload,
  deps: CaptureFlowDependencies
): Promise<{ success: boolean; data?: CaptureState; error?: string; errorCode?: string }> {
  const { pipeline, logger } = deps;
  
  logger.info('CAPTURE', 'START_CAPTURE_FLOW', { payload });

  // 1. Validar pré-requisitos
  const validation = await validateCapturePrerequisites(
    deps.currentState,
    deps.getStoredTokens,
    deps.isTokenExpiringSoon,
    deps.refreshAccessToken,
    logger
  );

  if (!validation.valid) {
    return {
      success: false,
      error: validation.error ?? 'Validação falhou',
      errorCode: validation.errorCode ?? ErrorCodes.CAPTURE_FAILED,
    };
  }

  const tab = validation.tab;
  if (!tab) {
    return {
      success: false,
      error: 'Aba não disponível',
      errorCode: ErrorCodes.CAPTURE_FAILED,
    };
  }
  const captureId = deps.generateCorrelationId();

  // 2. Criar estado inicial
  const captureState = createInitialCaptureState(captureId, payload, tab);
  await deps.persistCaptureState(captureState);

  // 3. CRÍTICO: Subscrever para atualizações de progresso do pipeline
  // Isso garante que todas as mensagens granulares sejam propagadas para o popup
  const unsubscribeProgress = pipeline.onProgress((progress) => {
    // Atualizar estado local com progresso do pipeline
    captureState.progress = progress.percent;
    captureState.progressMessage = progress.message ?? 'Processando...';

    // Persistir para que o popup possa ler via chrome.storage
    // NOTA: Não await aqui para não bloquear o fluxo do pipeline
    deps.persistCaptureState(captureState).catch((err) => {
      logger.warn('CAPTURE', 'PROGRESS_PERSIST_FAILED', { error: String(err) });
    });

    logger.debug('CAPTURE', 'PROGRESS_UPDATE', {
      evidenceId: progress.evidenceId,
      percent: progress.percent,
      message: progress.message,
      status: progress.status,
    });
  });

  // 3.1 Subscrever para erros do pipeline
  // Isso garante que erros sejam propagados para o popup imediatamente
  const unsubscribeError = pipeline.onError((error) => {
    logger.error('CAPTURE', 'PIPELINE_ERROR_EVENT', {
      code: error.code,
      message: error.message,
      phase: error.phase,
      recoverable: error.recoverable,
    });

    // Broadcast para popup/sidepanel
    broadcastPipelineError(error);
  });

  try {
    // 3. Setup de isolamento
    const isolationResult = await setupCaptureIsolation(
      captureId,
      deps.isolationManager,
      logger
    );

    // 4. Verificar permissões de host
    const tabUrl = tab.url;
    if (!tabUrl) {
      captureState.status = 'failed';
      captureState.error = 'URL da aba não disponível';
      await deps.persistCaptureState(captureState);
      return {
        success: false,
        error: 'URL da aba não disponível',
        errorCode: ErrorCodes.PERMISSION_TAB_ACCESS,
      };
    }

    const permissionCheck = await ensureHostPermission(
      tabUrl,
      deps.verificarPermissaoHost,
      deps.solicitarPermissaoHost,
      logger
    );

    if (!permissionCheck.hasPermission) {
      captureState.status = 'failed';
      captureState.error = permissionCheck.error ?? 'Permissão negada';
      await deps.persistCaptureState(captureState);
      return {
        success: false,
        error: permissionCheck.error ?? 'Permissão negada',
        errorCode: ErrorCodes.PERMISSION_TAB_ACCESS,
      };
    }

    // 5. Recarregar página
    captureState.progress = 5;
    captureState.progressMessage = 'Sincronizando conteúdo...';
    await deps.persistCaptureState(captureState);

    const tabId = tab.id;
    if (!tabId) {
      captureState.status = 'failed';
      captureState.error = 'ID da aba não disponível';
      await deps.persistCaptureState(captureState);
      return {
        success: false,
        error: 'ID da aba não disponível',
        errorCode: ErrorCodes.CAPTURE_FAILED,
      };
    }

    const reloadResult = await reloadAndStabilizePage(
      tabId,
      deps.reloadPageAndWaitForComplete,
      logger
    );

    if (!reloadResult.success) {
      captureState.status = 'failed';
      captureState.error = reloadResult.error ?? 'Falha no reload';
      await deps.persistCaptureState(captureState);
      return {
        success: false,
        error: reloadResult.error ?? 'Falha no reload',
        errorCode: ErrorCodes.CAPTURE_FAILED,
      };
    }

    // 6. Garantir content script carregado
    const contentScriptReady = await deps.ensureContentScriptLoaded(tabId, logger);
    if (!contentScriptReady) {
      captureState.status = 'failed';
      captureState.error = 'Não foi possível inicializar captura nesta página';
      await deps.persistCaptureState(captureState);
      return {
        success: false,
        error: 'Não foi possível inicializar a captura.',
        errorCode: ErrorCodes.CAPTURE_FAILED,
      };
    }

    // 7. Executar captura via EvidencePipeline
    // NOTA: Não definir progresso manualmente aqui - a subscription do pipeline
    // irá propagar todas as atualizações granulares automaticamente.

    const windowId = tab.windowId;
    if (windowId === undefined) {
      captureState.status = 'failed';
      captureState.error = 'WindowId da aba não disponível';
      await deps.persistCaptureState(captureState);
      return {
        success: false,
        error: 'WindowId da aba não disponível',
        errorCode: ErrorCodes.CAPTURE_FAILED,
      };
    }

    const captureConfig: CaptureConfig = {
      tabId,
      windowId,
      type: payload.type === 'video' ? 'video' : 'screenshot',
      storageConfig: {
        storageClass: 'STANDARD',
        retentionYears: 5,
      },
      correlationId: captureId,
      isolation: {
        snapshotHash: isolationResult.snapshotHash ?? '',
        disabledExtensions: isolationResult.disabledExtensions,
        nonDisabledExtensions: isolationResult.nonDisabledExtensionNames,
      },
    };

    const captureResult = await pipeline.startCapture(captureConfig);

    // Atualizar estado com hashes (progresso é atualizado via subscription)
    captureState.screenshotHash = captureResult.media.hash;
    captureState.htmlHash = captureResult.html.hash;
    captureState.metadataHash = captureResult.metadataHash;
    await deps.persistCaptureState(captureState);

    // 8. Aplicar timestamp via pipeline (progresso via subscription)
    const timestampResult = await pipeline.applyTimestamp(captureResult.merkleRoot);
    captureState.timestampResult = timestampResult;
    await deps.persistCaptureState(captureState);

    // 9. Upload via pipeline (progresso via subscription)
    const uploadResult = await pipeline.uploadToS3(captureResult, timestampResult);
    captureState.screenshotUrl = uploadResult.urls.media;
    // Compatibilidade: htmlUrl recebe o HTML inicial
    captureState.htmlUrl = uploadResult.urls.html.initial;
    // Nova estrutura: htmlUrls com todos os HTMLs
    captureState.htmlUrls = uploadResult.urls.html;
    captureState.metadataUrl = uploadResult.urls.metadata;
    await deps.persistCaptureState(captureState);

    // 10. Abrir preview
    await pipeline.openPreview(captureResult.evidenceId);

    captureState.status = 'completed';
    captureState.progress = 100;
    captureState.progressMessage = 'Captura concluída!';
    await deps.persistCaptureState(captureState);

    logger.info('CAPTURE', 'CAPTURE_FLOW_COMPLETED', {
      captureId,
      evidenceId: captureResult.evidenceId,
    });

    return {
      success: true,
      data: captureState,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

    logger.error('CAPTURE', 'CAPTURE_FLOW_FAILED', {
      captureId,
      error: errorMessage,
    });

    captureState.status = 'failed';
    captureState.error = errorMessage;
    await deps.persistCaptureState(captureState);

    return {
      success: false,
      error: `Falha na captura: ${errorMessage}`,
      errorCode: ErrorCodes.CAPTURE_FAILED,
    };
  } finally {
    // CRÍTICO: Sempre remover subscriptions para evitar memory leaks
    unsubscribeProgress();
    unsubscribeError();
  }
}


// ============================================================================
// Nova API Simplificada com EvidencePipeline
// ============================================================================

/**
 * Payload simplificado para captura via pipeline
 */
export interface PipelineCapturePayload {
  /** Tipo de captura */
  type: 'screenshot' | 'video';
  /** Classe de armazenamento */
  storageClass?: 'STANDARD' | 'GLACIER' | 'DEEP_ARCHIVE';
  /** Anos de retenção */
  retentionYears?: 5 | 10 | 20;
}

/**
 * Resultado da captura via pipeline
 */
export interface PipelineCaptureResult {
  /** Se a captura foi bem-sucedida */
  success: boolean;
  /** ID da evidência */
  evidenceId?: string;
  /** Status atual */
  status?: string;
  /** Mensagem de erro */
  error?: string;
  /** Código de erro */
  errorCode?: string;
}

/**
 * Callback para atualizações de progresso
 */
export type ProgressUpdateCallback = (percent: number, message: string) => void;

/**
 * Inicia captura de screenshot usando o EvidencePipeline unificado
 *
 * Esta é a nova API recomendada para iniciar capturas. Ela:
 * 1. Cria uma instância do EvidencePipeline
 * 2. Executa as fases 1-4 (Captura → Timestamp → Upload → Preview)
 * 3. Retorna o ID da evidência para acompanhamento
 *
 * As fases 5-6 (Blockchain → Certificado) são executadas após aprovação
 * do usuário na página de preview.
 *
 * @param payload - Configuração da captura
 * @param logger - Logger para auditoria
 * @param onProgress - Callback opcional para receber atualizações de progresso
 * @returns Resultado com evidenceId ou erro
 *
 * @example
 * ```typescript
 * const result = await startCaptureWithPipeline(
 *   { type: 'screenshot', retentionYears: 5 },
 *   logger,
 *   (percent, message) => {
 *     console.log(`Progresso: ${percent}% - ${message}`);
 *   }
 * );
 *
 * if (result.success) {
 *   console.log('Evidência criada:', result.evidenceId);
 * }
 * ```
 */
export async function startCaptureWithPipeline(
  payload: PipelineCapturePayload,
  logger: AuditLogger,
  onProgress?: ProgressUpdateCallback
): Promise<PipelineCaptureResult> {
  logger.info('CAPTURE', 'START_CAPTURE_WITH_PIPELINE', { payload });

  // Declarar fora do try para poder usar no catch
  let unsubscribeProgress: (() => void) | null = null;
  let unsubscribeError: (() => void) | null = null;

  try {
    // 0. CRÍTICO: Garantir que APIClient está inicializado ANTES de criar o pipeline
    const apiClientReady = await ensureAPIClientReadyForCapture(logger);
    if (!apiClientReady) {
      logger.error('CAPTURE', 'API_CLIENT_INIT_FAILED_BEFORE_PIPELINE', {});
      return {
        success: false,
        error: 'Falha ao inicializar cliente de API. Verifique se você está autenticado.',
        errorCode: ErrorCodes.AUTH_TOKEN_INVALID,
      };
    }

    // 1. Obter aba ativa
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!activeTab?.id || !activeTab.url) {
      logger.error('CAPTURE', 'TAB_ACCESS_FAILED', {
        hasId: !!activeTab?.id,
        hasUrl: !!activeTab?.url,
      });
      return {
        success: false,
        error: 'Não foi possível acessar a aba atual',
        errorCode: ErrorCodes.PERMISSION_TAB_ACCESS,
      };
    }

    // 2. Verificar URL bloqueada
    const verificacaoUrl = verificarUrlBloqueada(activeTab.url);
    if (verificacaoUrl.bloqueada) {
      logger.warn('CAPTURE', 'URL_BLOQUEADA', {
        url: activeTab.url,
        motivo: verificacaoUrl.motivo,
      });
      return {
        success: false,
        error: verificacaoUrl.motivo ?? 'Esta página não pode ser capturada',
        errorCode: ErrorCodes.CAPTURE_FAILED,
      };
    }

    // 3. Criar pipeline (APIClient já garantido no passo 0)
    const pipeline = createEvidencePipeline();

    // CRÍTICO: Armazenar pipeline ativo para permitir cancelamento
    setActivePipeline(pipeline);

    // 3.1 Registrar listener de progresso para propagar atualizações
    if (onProgress) {
      unsubscribeProgress = pipeline.onProgress((progress) => {
        onProgress(progress.percent, progress.message ?? 'Processando...');
      });
    }

    // 3.2 Registrar listener de erro para propagar erros para popup/sidepanel
    unsubscribeError = pipeline.onError((error) => {
      logger.error('CAPTURE', 'PIPELINE_ERROR_EVENT', {
        code: error.code,
        message: error.message,
        phase: error.phase,
        recoverable: error.recoverable,
      });

      // Broadcast para popup/sidepanel
      broadcastPipelineError(error);
    });

    // Garantir que windowId existe
    const windowId = activeTab.windowId;
    if (windowId === undefined) {
      logger.error('CAPTURE', 'WINDOW_ID_MISSING', {
        tabId: activeTab.id,
      });
      return {
        success: false,
        error: 'Não foi possível obter windowId da aba',
        errorCode: ErrorCodes.CAPTURE_FAILED,
      };
    }

    // 4. Configurar captura
    const captureConfig: CaptureConfig = {
      tabId: activeTab.id,
      windowId,
      type: payload.type,
      storageConfig: {
        storageClass: payload.storageClass ?? 'STANDARD',
        retentionYears: payload.retentionYears ?? 5,
      },
    };

    // 5. Executar Fase 1: Captura
    logger.info('CAPTURE', 'PIPELINE_PHASE_1_START', { type: payload.type });
    const captureResult = await pipeline.startCapture(captureConfig);
    logger.info('CAPTURE', 'PIPELINE_PHASE_1_COMPLETE', { 
      evidenceId: captureResult.evidenceId,
      merkleRoot: captureResult.merkleRoot,
    });

    // 6. Executar Fase 2: Timestamp ICP-Brasil
    logger.info('CAPTURE', 'PIPELINE_PHASE_2_START', { merkleRoot: captureResult.merkleRoot });
    const timestampResult = await pipeline.applyTimestamp(captureResult.merkleRoot);
    logger.info('CAPTURE', 'PIPELINE_PHASE_2_COMPLETE', { 
      type: timestampResult.type,
      tsa: timestampResult.tsa,
    });

    // 7. Executar Fase 3: Upload S3
    logger.info('CAPTURE', 'PIPELINE_PHASE_3_START', { evidenceId: captureResult.evidenceId });
    const uploadResult = await pipeline.uploadToS3(captureResult, timestampResult);
    logger.info('CAPTURE', 'PIPELINE_PHASE_3_COMPLETE', {
      method: uploadResult.uploadMethod,
      totalBytes: uploadResult.stats.totalBytes,
    });

    // 8. Processar pós-captura (desbloqueios e preview)
    logger.info('CAPTURE', 'POST_CAPTURE_PROCESSING_START', { evidenceId: captureResult.evidenceId });

    // IMPORTANTE: Usar singletons dos managers de isolamento
    // Não criar novas instâncias! O isolamento foi ativado no singleton.
    const tabIsolationManager = getTabIsolationManager(logger);
    const extensionIsolationManager = getExtensionIsolationManager(logger);

    // Criar e executar o PostCaptureProcessor
    const postProcessor = new PostCaptureProcessor({
      tabId: activeTab.id,
      windowId,
      storageConfig: {
        storageClass: payload.storageClass ?? 'STANDARD',
        retentionYears: payload.retentionYears ?? 5,
      },
      logger,
      tabIsolationManager,
      extensionIsolationManager,
    });

    // O PostCaptureProcessor vai:
    // 1. Desbloquear lockdown no content script (teclado, menu contexto, etc.)
    // 2. Desbloquear isolamento no background (DevTools, extensões)
    // 3. Abrir página de preview automaticamente
    // Passamos skipUpload=true pois o pipeline já fez timestamp e upload
    await postProcessor.process(captureResult, true);

    logger.info('CAPTURE', 'POST_CAPTURE_PROCESSING_COMPLETE', { evidenceId: captureResult.evidenceId });

    // Limpar listeners
    if (unsubscribeProgress) {
      unsubscribeProgress();
    }
    if (unsubscribeError) {
      unsubscribeError();
    }

    // Limpar pipeline ativo após sucesso
    setActivePipeline(null);

    return {
      success: true,
      evidenceId: captureResult.evidenceId,
      status: 'PENDING_REVIEW',
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

    logger.error('CAPTURE', 'PIPELINE_CAPTURE_FAILED', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Broadcast erro para popup/sidepanel (caso o pipeline.onError não tenha disparado)
    broadcastPipelineError({
      code: 'UNKNOWN_ERROR',
      message: errorMessage,
      phase: 'capture',
      recoverable: false,
      details: {
        originalError: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      },
    });

    // Limpar listeners
    if (unsubscribeProgress) {
      unsubscribeProgress();
    }
    if (unsubscribeError) {
      unsubscribeError();
    }

    // Limpar pipeline ativo após erro
    setActivePipeline(null);

    return {
      success: false,
      error: `Falha na captura: ${errorMessage}`,
      errorCode: ErrorCodes.CAPTURE_FAILED,
    };
  }
}

/**
 * Aprova evidência e inicia certificação blockchain
 * 
 * Executa as fases 5-6 do pipeline:
 * - Fase 5: Registro triplo em blockchain (Polygon + Arbitrum + Optimism)
 * - Fase 6: Geração do certificado PDF
 * 
 * @param evidenceId - ID da evidência a aprovar
 * @param storageConfig - Configuração de armazenamento escolhida
 * @param logger - Logger para auditoria
 * @returns Resultado da certificação
 */
export async function approveEvidenceWithPipeline(
  evidenceId: string,
  storageConfig: {
    storageClass?: 'STANDARD' | 'GLACIER' | 'DEEP_ARCHIVE';
    retentionYears?: 5 | 10 | 20;
  },
  logger: AuditLogger
): Promise<{ success: boolean; certificateUrl?: string; error?: string }> {
  logger.info('CAPTURE', 'APPROVE_EVIDENCE_WITH_PIPELINE', { evidenceId, storageConfig });

  try {
    // CRÍTICO: Garantir que APIClient está inicializado ANTES de criar o pipeline
    const apiClientReady = await ensureAPIClientReadyForCapture(logger);
    if (!apiClientReady) {
      logger.error('CAPTURE', 'API_CLIENT_INIT_FAILED_BEFORE_APPROVE', { evidenceId });
      return {
        success: false,
        error: 'Falha ao inicializar cliente de API. Verifique se você está autenticado.',
      };
    }

    const pipeline = createEvidencePipeline();
    
    const result = await pipeline.approve(evidenceId, {
      storageClass: storageConfig.storageClass ?? 'STANDARD',
      retentionYears: storageConfig.retentionYears ?? 5,
    });

    logger.info('CAPTURE', 'EVIDENCE_APPROVED', {
      evidenceId,
      status: result.status,
      certificateUrl: result.certificateUrl,
    });

    // Construir retorno condicionalmente para compatibilidade com exactOptionalPropertyTypes
    const response: { success: boolean; certificateUrl?: string; error?: string } = {
      success: result.status === 'CERTIFIED',
    };
    
    if (result.certificateUrl) {
      response.certificateUrl = result.certificateUrl;
    }
    
    if (result.error) {
      response.error = result.error;
    }

    return response;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    
    logger.error('CAPTURE', 'APPROVE_EVIDENCE_FAILED', {
      evidenceId,
      error: errorMessage,
    });

    return {
      success: false,
      error: `Falha na aprovação: ${errorMessage}`,
    };
  }
}

/**
 * Descarta evidência pendente
 * 
 * @param evidenceId - ID da evidência a descartar
 * @param logger - Logger para auditoria
 */
export async function discardEvidenceWithPipeline(
  evidenceId: string,
  logger: AuditLogger
): Promise<{ success: boolean; error?: string }> {
  logger.info('CAPTURE', 'DISCARD_EVIDENCE_WITH_PIPELINE', { evidenceId });

  try {
    // CRÍTICO: Garantir que APIClient está inicializado ANTES de criar o pipeline
    const apiClientReady = await ensureAPIClientReadyForCapture(logger);
    if (!apiClientReady) {
      logger.error('CAPTURE', 'API_CLIENT_INIT_FAILED_BEFORE_DISCARD', { evidenceId });
      return {
        success: false,
        error: 'Falha ao inicializar cliente de API. Verifique se você está autenticado.',
      };
    }

    const pipeline = createEvidencePipeline();
    await pipeline.discard(evidenceId);

    logger.info('CAPTURE', 'EVIDENCE_DISCARDED', { evidenceId });

    return { success: true };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    
    logger.error('CAPTURE', 'DISCARD_EVIDENCE_FAILED', {
      evidenceId,
      error: errorMessage,
    });

    return {
      success: false,
      error: `Falha ao descartar: ${errorMessage}`,
    };
  }
}
