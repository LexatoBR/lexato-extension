/**
 * Hook de captura para o Side Panel Lexato
 *
 * Gerencia estado de captura e operações de screenshot/vídeo.
 * Versão simplificada para o Side Panel - sem lógica de abertura
 * programática do Side Panel (já está aberto neste contexto).
 *
 * Requisitos atendidos:
 * - 4.4: useCapture funciona no contexto do Side Panel
 * - 4.5: Sem lógica de abertura programática do Side Panel
 * - 5.4: Eliminação da lógica de abertura programática
 * - 14.1: Utilizar Zustand para gerenciamento de estado global
 * - 14.4: Manter estado de captura em andamento e capturas recentes
 * - 14.5: Notificar componentes sobre mudanças de estado
 *
 * @module useCapture
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { loggers } from '../../lib/logger';
import { resetGlobalMaxProgress } from '../../hooks/useAnimatedProgress';
import type {
  CaptureData,
  CaptureType,
  CaptureStatus,
  StorageType,
  ScreenshotCaptureProgress,
  ScreenshotCaptureStage,
  VideoCaptureProgress,
} from '../../types/capture.types';
import type { CaptureState } from '../../types/api.types';

const log = loggers.sidePanel.withPrefix('[useCapture]');

/**
 * Detalhes estruturados do erro de captura
 *
 * Definido localmente para evitar dependência do popup.
 * Quando o CaptureErrorModal for migrado (tarefa 4.3),
 * este tipo pode ser importado do componente migrado.
 */
export interface CaptureErrorDetails {
  /** Código do erro (ex: ERR_CAPTURE_001) */
  code: string;
  /** Mensagem amigável em PT-BR */
  message: string;
  /** Se o erro pode ser recuperado com retry */
  isRecoverable: boolean;
  /** Fase do pipeline onde ocorreu */
  phase?: string;
  /** Número de tentativas já realizadas */
  retryCount?: number;
  /** Máximo de tentativas permitidas */
  maxRetries?: number;
  /** Detalhes técnicos (para debug) */
  technicalDetails?: string;
  /** Stack trace (apenas em desenvolvimento) */
  stack?: string;
}

/**
 * Ordem dos estágios para comparação (não pode regredir)
 */
const STAGE_ORDER: ScreenshotCaptureStage[] = [
  'initializing',
  'lockdown',
  'reload',
  'waiting_resources',
  'capturing',
  'stitching',
  'hashing',
  'timestamp',
  'uploading',
  'opening_preview',
  'complete',
];

/**
 * Obtém o índice do estágio para comparação
 */
function getStageIndex(stage: ScreenshotCaptureStage): number {
  return STAGE_ORDER.indexOf(stage);
}

// =============================================================================
// CONVERSÃO DE ESTADO DO STORAGE PARA PROGRESS
// =============================================================================

/**
 * Mapeia status de captura para estágio de screenshot
 */
function statusToStage(status: CaptureStatus): ScreenshotCaptureStage {
  switch (status) {
    case 'initializing':
      return 'initializing';
    case 'lockdown_active':
      return 'lockdown';
    case 'capturing':
      return 'capturing';
    case 'processing':
      return 'hashing';
    case 'timestamping':
    case 'timestamp_fallback':
      return 'timestamp';
    case 'uploading':
      return 'uploading';
    case 'pending_review':
      return 'opening_preview';
    case 'completed':
    case 'certified':
      return 'complete';
    case 'failed':
    case 'timestamp_failed':
    case 'blockchain_failed':
    case 'pdf_failed':
    default:
      return 'initializing';
  }
}

/**
 * Mapeia mensagem de progresso para estágio de screenshot
 * Fallback quando o status não é específico o suficiente
 */
function progressMessageToStage(message: string): ScreenshotCaptureStage {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('inicializ') || lowerMessage.includes('preparando')) {
    return 'initializing';
  }
  if (lowerMessage.includes('isolamento') || lowerMessage.includes('extensões') || lowerMessage.includes('extensoes') || lowerMessage.includes('lockdown') || lowerMessage.includes('seguro')) {
    return 'lockdown';
  }
  if (lowerMessage.includes('recarreg') || lowerMessage.includes('reload')) {
    return 'reload';
  }
  if (lowerMessage.includes('aguard') || lowerMessage.includes('recursos') || lowerMessage.includes('carrega')) {
    return 'waiting_resources';
  }
  if (lowerMessage.includes('captur') || lowerMessage.includes('viewport') || lowerMessage.includes('fotograf')) {
    return 'capturing';
  }
  if (lowerMessage.includes('unindo') || lowerMessage.includes('montando') || lowerMessage.includes('stitch')) {
    return 'stitching';
  }
  if (lowerMessage.includes('hash') || lowerMessage.includes('integridade') || lowerMessage.includes('sha')) {
    return 'hashing';
  }
  if (lowerMessage.includes('carimbo') || lowerMessage.includes('timestamp') || lowerMessage.includes('icp')) {
    return 'timestamp';
  }
  if (lowerMessage.includes('enviando') || lowerMessage.includes('upload') || lowerMessage.includes('servidor')) {
    return 'uploading';
  }
  if (lowerMessage.includes('preview') || lowerMessage.includes('abrindo')) {
    return 'opening_preview';
  }
  if (lowerMessage.includes('concluíd') || lowerMessage.includes('sucesso') || lowerMessage.includes('completo')) {
    return 'complete';
  }

  return 'initializing';
}

/**
 * Cache de estado máximo para evitar regressão
 * Persiste entre chamadas da função
 */
let maxStageIndex = -1;
let maxPercent = 0;

/**
 * Reseta o cache de progresso máximo (chamar no início de nova captura)
 */
export function resetProgressCache(): void {
  maxStageIndex = -1;
  maxPercent = 0;
  resetGlobalMaxProgress('screenshot');
}

/**
 * Converte CaptureState do storage para ScreenshotCaptureProgress
 *
 * IMPORTANTE: O progresso NUNCA regride - estágio e percentual só avançam
 */
function captureStateToProgress(state: CaptureState): ScreenshotCaptureProgress {
  // Primeiro tenta usar o status, depois fallback para progressMessage
  let stage = statusToStage(state.status);

  // Se o status é genérico, tenta inferir do progressMessage
  if (stage === 'initializing' && state.progressMessage) {
    stage = progressMessageToStage(state.progressMessage);
  }

  // REGRA CRÍTICA: Estágio NUNCA regride
  const currentStageIndex = getStageIndex(stage);
  if (currentStageIndex < maxStageIndex && maxStageIndex >= 0 && maxStageIndex < STAGE_ORDER.length) {
    // Usar o estágio máximo anterior (não regredir)
    const maxStage = STAGE_ORDER[maxStageIndex];
    if (maxStage) {
      stage = maxStage;
    }
  } else if (currentStageIndex > maxStageIndex) {
    // Atualizar máximo
    maxStageIndex = currentStageIndex;
  }

  // REGRA CRÍTICA: Percentual NUNCA regride
  const percent = Math.max(state.progress ?? 0, maxPercent);
  maxPercent = percent;

  return {
    stage,
    percent,
    message: state.progressMessage,
  };
}

/**
 * Tipo de progresso unificado
 */
type CaptureProgress = ScreenshotCaptureProgress | VideoCaptureProgress;

/** Máximo de tentativas de retry */
const MAX_RETRIES = 3;

/**
 * Estado de captura do hook
 */
interface UseCaptureState {
  /** Se há captura em andamento */
  isCapturing: boolean;
  /** Progresso da captura atual */
  captureProgress: CaptureProgress | null;
  /** Capturas recentes */
  recentCaptures: CaptureData[];
  /** Se está carregando capturas recentes */
  isLoadingRecent: boolean;
  /** Mensagem de erro */
  error: string | null;
  /** Detalhes estruturados do erro */
  errorDetails: CaptureErrorDetails | null;
  /** Se o erro pode ser recuperado */
  isRetryable: boolean;
  /** Número de tentativas realizadas */
  retryCount: number;
  /** Se está tentando retry */
  isRetrying: boolean;
}

/**
 * Retorno do hook useCapture
 */
interface UseCaptureReturn extends UseCaptureState {
  /** Inicia uma captura */
  startCapture: (type: CaptureType, storageType: StorageType) => Promise<void>;
  /** Cancela captura em andamento */
  cancelCapture: () => Promise<void>;
  /** Para gravação de vídeo */
  stopVideoRecording: () => Promise<void>;
  /** Atualiza lista de capturas recentes */
  refreshRecentCaptures: () => Promise<void>;
  /** Limpa erro */
  clearError: () => void;
  /** Tenta captura novamente */
  retryCapture: () => Promise<void>;
  /** Limpa estado de erro e permite nova captura */
  clearErrorState: () => void;
  /** Limpa cache de captura (sem logout) */
  clearCaptureCache: () => Promise<void>;
}

/**
 * Chaves de armazenamento
 */
const STORAGE_KEYS = {
  CAPTURE_STATE: 'lexato_capture_state',
  RECENT_CAPTURES: 'lexato_recent_captures',
  RECENT_CAPTURES_TIMESTAMP: 'lexato_recent_captures_timestamp',
} as const;

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Hook de captura para o Side Panel
 *
 * Funcionalidades:
 * - Inicia capturas de screenshot e vídeo
 * - Monitora progresso via mensagens do service worker
 * - Mantém lista de capturas recentes
 * - Sincroniza com chrome.storage.local
 *
 * Diferenças em relação à versão do popup:
 * - Sem lógica de chrome.sidePanel.open() (já está no Side Panel)
 * - Sem detecção de user gesture para abertura do Side Panel
 * - Sem fallback de abertura do Side Panel
 * - Sem window.close() após iniciar captura de vídeo
 */
export function useCapture(): UseCaptureReturn {
  const [state, setState] = useState<UseCaptureState>({
    isCapturing: false,
    captureProgress: null,
    recentCaptures: [],
    isLoadingRecent: true,
    error: null,
    errorDetails: null,
    isRetryable: false,
    retryCount: 0,
    isRetrying: false,
  });

  // Refs para contexto de retry
  const lastCaptureTypeRef = useRef<CaptureType | null>(null);
  const lastStorageTypeRef = useRef<StorageType | null>(null);

  /**
   * Carrega estado de captura do storage
   */
  const loadCaptureState = useCallback(async () => {
    log.debug('Carregando estado do storage...');
    try {
      const result = await chrome.storage.local.get([
        STORAGE_KEYS.CAPTURE_STATE,
        STORAGE_KEYS.RECENT_CAPTURES,
      ]);
      log.debug('Estado carregado do storage:', result);

      const captureState = result[STORAGE_KEYS.CAPTURE_STATE] as CaptureState | undefined;
      const recentCaptures = (result[STORAGE_KEYS.RECENT_CAPTURES] as CaptureData[]) ?? [];

      // Converter CaptureState para ScreenshotCaptureProgress se for screenshot ativo
      let isCapturing = false;
      let captureProgress: CaptureProgress | null = null;

      if (captureState) {
        const activeStatuses: CaptureStatus[] = ['initializing', 'lockdown_active', 'capturing', 'processing', 'uploading'];
        isCapturing = activeStatuses.includes(captureState.status);

        if (isCapturing && captureState.type === 'screenshot') {
          captureProgress = captureStateToProgress(captureState);
        }
      }

      setState((prev) => ({
        ...prev,
        isCapturing,
        captureProgress,
        recentCaptures,
        isLoadingRecent: false,
      }));
      log.debug('Estado atualizado:', {
        isCapturing,
        hasProgress: !!captureProgress,
        recentCapturesCount: recentCaptures.length,
      });
    } catch (err) {
      log.error('Erro ao carregar estado:', err);
      setState((prev) => ({
        ...prev,
        isLoadingRecent: false,
        error: 'Erro ao carregar capturas',
      }));
    }
  }, []);

  /**
   * Inicia uma captura
   *
   * No contexto do Side Panel, a captura inicia diretamente sem
   * necessidade de abrir o Side Panel (já está aberto).
   * Toda a lógica de chrome.sidePanel.open(), detecção de user gesture
   * e window.close() foi removida.
   */
  const startCapture = useCallback(
    async (type: CaptureType, storageType: StorageType): Promise<void> => {
      log.debug('Iniciando captura', { type, storageType });

      // Salvar contexto para retry
      lastCaptureTypeRef.current = type;
      lastStorageTypeRef.current = storageType;

      // Resetar cache de progresso no início de nova captura
      resetProgressCache();

      setState((prev) => ({
        ...prev,
        error: null,
        errorDetails: null,
        isRetryable: false,
      }));

      // Capturar tabId da aba ativa
      let targetTabId: number | undefined;

      try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.id && activeTab.id !== chrome.tabs.TAB_ID_NONE) {
          targetTabId = activeTab.id;
          log.debug('TabId capturado:', { targetTabId, url: activeTab.url });
        } else {
          log.warn('Não foi possível obter tabId ativo');
        }
      } catch (err) {
        log.error('Erro ao obter tabId:', err);
      }

      try {
        const message = {
          type: 'START_CAPTURE',
          payload: { type, storageType, tabId: targetTabId },
        };

        // Enviar mensagem ao Service Worker e aguardar resposta
        const result = await chrome.runtime.sendMessage(message);

        log.debug('Resposta do service worker', { success: result?.success, hasError: !!result?.error });

        if (!result?.success) {
          const errorMessage = result?.error ?? 'Falha ao iniciar captura';
          log.error('Erro na resposta do service worker', errorMessage);
          setState((prev) => ({ ...prev, error: errorMessage }));
          throw new Error(errorMessage);
        }

        // Atualizar estado local
        setState((prev) => ({
          ...prev,
          isCapturing: true,
          captureProgress: type === 'screenshot'
            ? {
                stage: 'initializing',
                percent: 0,
                message: 'Iniciando...',
              } as ScreenshotCaptureProgress
            : null,
        }));
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erro ao iniciar captura';
        log.error('Exceção ao iniciar captura', err);
        setState((prev) => ({ ...prev, error: errorMessage }));
        throw err;
      }
    },
    []
  );

  /**
   * Cancela captura em andamento
   */
  const cancelCapture = useCallback(async (): Promise<void> => {
    try {
      await chrome.runtime.sendMessage({ type: 'CAPTURE_CANCEL' });

      setState((prev) => ({
        ...prev,
        isCapturing: false,
        captureProgress: null,
      }));
    } catch (err) {
      log.error('Erro ao cancelar captura:', err);
    }
  }, []);

  /**
   * Para gravação de vídeo
   */
  const stopVideoRecording = useCallback(async (): Promise<void> => {
    try {
      await chrome.runtime.sendMessage({ type: 'CAPTURE_STOP_VIDEO' });
    } catch (err) {
      log.error('Erro ao parar gravação:', err);
    }
  }, []);

  /**
   * Atualiza lista de capturas recentes
   */
  const refreshRecentCaptures = useCallback(async (): Promise<void> => {
    try {
      // Verificar cache primeiro
      const cacheResult = await chrome.storage.local.get([
        STORAGE_KEYS.RECENT_CAPTURES,
        STORAGE_KEYS.RECENT_CAPTURES_TIMESTAMP
      ]);
      
      const cachedCaptures = cacheResult[STORAGE_KEYS.RECENT_CAPTURES] as CaptureData[] | undefined;
      const timestamp = cacheResult[STORAGE_KEYS.RECENT_CAPTURES_TIMESTAMP] as number | undefined;
      const now = Date.now();

      // Se cache é válido (< 5 min) e tem dados, usar cache
      if (cachedCaptures && timestamp && (now - timestamp < CACHE_TTL_MS)) {
        log.debug('Usando cache de capturas recentes');
        setState((prev) => ({ ...prev, recentCaptures: cachedCaptures, isLoadingRecent: false }));
        return;
      }

      setState((prev) => ({ ...prev, isLoadingRecent: true }));

      // Buscar do Service Worker (que busca do backend)
      log.debug('Solicitando capturas recentes ao Service Worker...');
      const result = await chrome.runtime.sendMessage({ type: 'CAPTURE_GET_RECENT' });
      log.debug('Resposta do Service Worker:', result);

      if (result?.captures) {
        const captures = result.captures;
        
        // Atualizar estado
        setState((prev) => ({ 
          ...prev, 
          recentCaptures: captures,
          isLoadingRecent: false 
        }));

        // Atualizar cache
        await chrome.storage.local.set({
          [STORAGE_KEYS.RECENT_CAPTURES]: captures,
          [STORAGE_KEYS.RECENT_CAPTURES_TIMESTAMP]: now
        });
      } else {
        setState((prev) => ({ ...prev, isLoadingRecent: false }));
      }
    } catch (err) {
      log.error('Erro ao atualizar capturas:', err);
      setState((prev) => ({ ...prev, isLoadingRecent: false }));
    }
  }, []);

  /**
   * Limpa erro
   */
  const clearError = useCallback((): void => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  /**
   * Limpa estado de erro completamente, permitindo nova captura
   */
  const clearErrorState = useCallback((): void => {
    log.info('Limpando estado de erro');
    setState((prev) => ({
      ...prev,
      error: null,
      errorDetails: null,
      isRetryable: false,
      retryCount: 0,
      isRetrying: false,
      isCapturing: false,
      captureProgress: null,
    }));
  }, []);

  /**
   * Tenta captura novamente
   */
  const retryCapture = useCallback(async (): Promise<void> => {
    const type = lastCaptureTypeRef.current;
    const storageType = lastStorageTypeRef.current;

    if (!type || !storageType) {
      log.warn('Sem contexto de captura para retry');
      setState((prev) => ({
        ...prev,
        error: 'Não foi possível recuperar o contexto da captura. Inicie uma nova captura.',
        isRetryable: false,
      }));
      return;
    }

    if (state.retryCount >= MAX_RETRIES) {
      log.warn('Máximo de tentativas atingido');
      setState((prev) => ({
        ...prev,
        isRetryable: false,
        error: 'Número máximo de tentativas atingido. Por favor, inicie uma nova captura.',
      }));
      return;
    }

    log.info(`Retry tentativa ${state.retryCount + 1}`);

    setState((prev) => ({
      ...prev,
      isRetrying: true,
      retryCount: prev.retryCount + 1,
      error: null,
      errorDetails: null,
    }));

    try {
      await startCapture(type, storageType);
    } catch (err) {
      log.error('Erro no retry:', err);
      setState((prev) => ({ ...prev, isRetrying: false }));
    }
  }, [state.retryCount, startCapture]);

  /**
   * Limpa cache de captura (sem fazer logout)
   *
   * Remove dados de captura do storage mantendo autenticação.
   * Útil para desbloquear extensão após erros.
   */
  const clearCaptureCache = useCallback(async (): Promise<void> => {
    log.info('Limpando cache de captura (mantendo auth)');

    // Keys que devem ser preservadas (relacionadas a autenticação)
    const AUTH_KEYS = [
      'lexato_access_token',
      'lexato_refresh_token',
      'lexato_id_token',
      'lexato_token_expiry',
      'lexato_user_data',
      'lexato_auth_state',
    ];

    try {
      // Obter todas as keys
      const allData = await chrome.storage.local.get(null);
      const keysToRemove: string[] = [];

      for (const key of Object.keys(allData)) {
        // Preservar keys de autenticação
        if (!AUTH_KEYS.includes(key)) {
          // Remover keys de captura e pipeline
          if (
            key.startsWith('lexato_capture') ||
            key.startsWith('lexato_pipeline') ||
            key.startsWith('lexato_evidence') ||
            key.startsWith('lexato_upload') ||
            key.startsWith('lexato_video')
          ) {
            keysToRemove.push(key);
          }
        }
      }

      if (keysToRemove.length > 0) {
        await chrome.storage.local.remove(keysToRemove);
        log.info(`Cache limpo: ${keysToRemove.length} chaves removidas`);
      }

      // Notificar service worker para limpar estado interno
      try {
        await chrome.runtime.sendMessage({ type: 'CLEAR_CAPTURE_CACHE' });
      } catch {
        // Ignorar erro se service worker não responder
      }

      // Resetar estado local
      setState({
        isCapturing: false,
        captureProgress: null,
        recentCaptures: state.recentCaptures, // Manter histórico
        isLoadingRecent: false,
        error: null,
        errorDetails: null,
        isRetryable: false,
        retryCount: 0,
        isRetrying: false,
      });

      log.info('Estado resetado com sucesso');
    } catch (err) {
      log.error('Erro ao limpar cache:', err);
      throw err;
    }
  }, [state.recentCaptures]);

  // Carregar estado inicial
  useEffect(() => {
    loadCaptureState();
  }, [loadCaptureState]);

  // Escutar mensagens do service worker
  useEffect(() => {
    const handleMessage = (
      message: { type: string; payload?: unknown },
      _sender: chrome.runtime.MessageSender,
      _sendResponse: (response?: unknown) => void
    ): boolean | void => {
      
      switch (message.type) {
        case 'CAPTURE_PROGRESS':
          setState((prev) => ({
            ...prev,
            captureProgress: message.payload as CaptureProgress,
          }));
          break;

        case 'CAPTURE_COMPLETE':
          log.info('Captura completa');
          setState((prev) => ({
            ...prev,
            isCapturing: false,
            captureProgress: null,
          }));
          // Atualizar lista de capturas recentes
          refreshRecentCaptures();
          break;

        case 'CAPTURE_ERROR':
          log.error('Erro na captura', message.payload);
          setState((prev) => ({
            ...prev,
            isCapturing: false,
            captureProgress: null,
            error: (message.payload as { error: string })?.error ?? 'Erro na captura',
          }));
          break;

        case 'CAPTURE_CANCELLED':
          log.warn('Captura cancelada');
          setState((prev) => ({
            ...prev,
            isCapturing: false,
            captureProgress: null,
          }));
          break;

        case 'PIPELINE_ERROR': {
          const errorPayload = message.payload as {
            error: string;
            code?: string;
            isRecoverable?: boolean;
            phase?: string;
            details?: string;
          };

          log.error('Erro no pipeline', errorPayload);

          setState((prev) => {
            // Criar detalhes estruturados do erro usando prev para evitar dependência externa
            const pipelineErrorDetails: CaptureErrorDetails = {
              code: errorPayload.code ?? 'UNKNOWN_ERROR',
              message: errorPayload.error ?? 'Erro desconhecido no pipeline',
              isRecoverable: errorPayload.isRecoverable ?? false,
              retryCount: prev.retryCount,
              maxRetries: MAX_RETRIES,
              ...(errorPayload.phase && { phase: errorPayload.phase }),
              ...(errorPayload.details && { technicalDetails: errorPayload.details }),
            };

            return {
              ...prev,
              isCapturing: false,
              captureProgress: null,
              error: pipelineErrorDetails.message,
              errorDetails: pipelineErrorDetails,
              isRetryable: pipelineErrorDetails.isRecoverable && prev.retryCount < MAX_RETRIES,
              isRetrying: false,
            };
          });
          break;
        }

        case 'PIPELINE_PROGRESS':
          // Atualizar progresso se vier do pipeline unificado
          if (message.payload) {
            const pipelineProgress = message.payload as {
              percent: number;
              message?: string;
              phase?: number;
              phaseName?: string;
            };

            // Converter para formato de progresso do Side Panel
            setState((prev) => ({
              ...prev,
              captureProgress: {
                stage: progressMessageToStage(pipelineProgress.message ?? ''),
                percent: pipelineProgress.percent,
                message: pipelineProgress.message,
              } as ScreenshotCaptureProgress,
            }));
          }
          break;
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [refreshRecentCaptures]);

  // Escutar mudanças no storage
  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ): void => {
      if (areaName !== 'local') {
        return;
      }

      // Verificar se estado de captura mudou
      const captureStateChange = changes[STORAGE_KEYS.CAPTURE_STATE];
      if (captureStateChange) {
        const newState = captureStateChange.newValue as CaptureState | undefined;

        if (!newState) {
          // Estado foi removido - captura finalizada ou cancelada
          setState((prev) => ({
            ...prev,
            isCapturing: false,
            captureProgress: null,
          }));
          return;
        }

        // Determinar se está capturando baseado no status
        const activeStatuses: CaptureStatus[] = ['initializing', 'lockdown_active', 'capturing', 'processing', 'uploading'];
        const isActive = activeStatuses.includes(newState.status);

        // Converter CaptureState para ScreenshotCaptureProgress se for screenshot
        let progress: CaptureProgress | null = null;
        if (isActive && newState.type === 'screenshot') {
          progress = captureStateToProgress(newState);
        }
        // Para vídeo, o progresso é gerenciado pelo VideoRecordingPanel diretamente

        setState((prev) => ({
          ...prev,
          isCapturing: isActive,
          captureProgress: progress,
        }));
      }

      // Verificar se capturas recentes mudaram
      const recentCapturesChange = changes[STORAGE_KEYS.RECENT_CAPTURES];
      if (recentCapturesChange) {
        const newCaptures = recentCapturesChange.newValue as CaptureData[] | undefined;
        setState((prev) => ({
          ...prev,
          recentCaptures: newCaptures ?? [],
        }));
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  return {
    ...state,
    startCapture,
    cancelCapture,
    stopVideoRecording,
    refreshRecentCaptures,
    clearError,
    retryCapture,
    clearErrorState,
    clearCaptureCache,
  };
}

export default useCapture;