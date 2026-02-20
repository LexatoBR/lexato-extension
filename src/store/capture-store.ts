/**
 * Store de Captura Zustand
 *
 * Gerencia estado global de capturas da extensão.
 *
 * MIGRAÇÃO PARA PIPELINE UNIFICADO:
 * Este store foi atualizado para suportar os novos status do EvidencePipeline.
 * Os status incluem todas as 6 fases do pipeline:
 * 1. Captura (initializing, capturing, etc.)
 * 2. Timestamp ICP-Brasil (timestamping, timestamp_fallback, etc.)
 * 3. Upload S3 (uploading)
 * 4. Preview (pending_review, approved, discarded, expired)
 * 5. Blockchain (registering_blockchain, blockchain_partial, etc.)
 * 6. Certificado (generating_pdf, certified, pdf_failed)
 *
 * Requisitos atendidos:
 * - 14.1: Utilizar Zustand para gerenciamento de estado global
 * - 14.4: Manter estado de captura em andamento e capturas recentes
 * - 14.5: Notificar componentes sobre mudanças de estado
 * - 13.5: Manter compatibilidade com interface existente
 *
 * @module CaptureStore
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { loggers } from '../lib/logger';
import type {
  CaptureData,
  CaptureType,
  StorageType,
  CaptureStatus,
  ScreenshotCaptureProgress,
  VideoCaptureProgress,
} from '../types/capture.types';
import type { EvidenceStatus, PipelineProgress } from '../lib/evidence-pipeline/types';
import type { CaptureErrorDetails } from '../sidepanel/components/capture/CaptureErrorModal';
import { getTimeoutManager } from '../lib/evidence-pipeline/timeout-manager';

const log = loggers.storage.withPrefix('[CaptureStore]');

/** Tipo de progresso unificado */
export type CaptureProgress = ScreenshotCaptureProgress | VideoCaptureProgress;

/** Chaves de armazenamento */
const STORAGE_KEYS = {
  CAPTURE_STATE: 'lexato_capture_state',
  RECENT_CAPTURES: 'lexato_recent_captures',
  PIPELINE_PROGRESS: 'lexato_pipeline_progress',
} as const;

/** Número máximo de capturas recentes */
const MAX_RECENT_CAPTURES = 20;

// ============================================================================
// Mapeamento de Status Pipeline → Status Legado
// ============================================================================

/**
 * Mapeia EvidenceStatus do pipeline para CaptureStatus legado
 * Mantém compatibilidade com código existente
 */
function mapPipelineStatusToLegacy(pipelineStatus: EvidenceStatus): CaptureStatus {
  const mapping: Record<EvidenceStatus, CaptureStatus> = {
    // Fase 1: Captura
    INITIALIZING: 'initializing',
    CAPTURING: 'capturing',
    CAPTURED: 'capturing',
    CAPTURE_FAILED: 'failed',
    // Fase 2: Timestamp
    TIMESTAMPING: 'timestamping',
    TIMESTAMPED: 'timestamping',
    TIMESTAMP_FALLBACK: 'timestamp_fallback',
    TIMESTAMP_FAILED: 'timestamp_failed',
    // Fase 3: Upload
    UPLOADING: 'uploading',
    UPLOADED: 'uploading',
    UPLOAD_FAILED: 'failed',
    // Fase 4: Preview
    PENDING_REVIEW: 'pending_review',
    APPROVED: 'approved',
    DISCARDED: 'discarded',
    EXPIRED: 'expired',
    // Fase 5: Blockchain
    REGISTERING_BLOCKCHAIN: 'registering_blockchain',
    BLOCKCHAIN_PARTIAL: 'blockchain_partial',
    BLOCKCHAIN_COMPLETE: 'blockchain_complete',
    BLOCKCHAIN_FAILED: 'blockchain_failed',
    // Fase 6: Certificado
    GENERATING_PDF: 'generating_pdf',
    CERTIFIED: 'certified',
    PDF_FAILED: 'pdf_failed',
  };

  return mapping[pipelineStatus] ?? 'processing';
}

/**
 * Verifica se o status indica captura em andamento
 */
function isActiveStatus(status: CaptureStatus | EvidenceStatus): boolean {
  const activeStatuses = [
    'initializing',
    'lockdown_active',
    'capturing',
    'timestamping',
    'uploading',
    'processing',
    'INITIALIZING',
    'CAPTURING',
    'CAPTURED',
    'TIMESTAMPING',
    'TIMESTAMPED',
    'UPLOADING',
    'UPLOADED',
  ];
  return activeStatuses.includes(status);
}

/** Estado do store */
interface CaptureStoreState {
  isCapturing: boolean;
  currentCaptureId: string | null;
  currentCaptureType: CaptureType | null;
  currentStorageType: StorageType | null;
  captureProgress: CaptureProgress | null;
  recentCaptures: CaptureData[];
  isLoadingRecent: boolean;
  error: string | null;
  isStarting: boolean;
  isCancelling: boolean;
  /** Progresso do pipeline unificado (novo) */
  pipelineProgress: PipelineProgress | null;
  /** Status do pipeline (novo) */
  pipelineStatus: EvidenceStatus | null;
  /** Detalhes estruturados do erro (para modal) */
  errorDetails: CaptureErrorDetails | null;
  /** Se o erro pode ser recuperado com retry */
  isRetryable: boolean;
  /** Número de tentativas de retry */
  retryCount: number;
  /** Máximo de tentativas permitidas */
  maxRetries: number;
  /** Se está tentando retry */
  isRetrying: boolean;
}

/** Ações do store */
interface CaptureStoreActions {
  loadCaptureState: () => Promise<void>;
  startCapture: (type: CaptureType, storageType: StorageType) => Promise<string>;
  prepareVideoEnvironment: () => Promise<void>;
  cancelCapture: () => Promise<void>;
  stopVideoRecording: () => Promise<void>;
  updateProgress: (progress: CaptureProgress) => void;
  completeCapture: (captureData: CaptureData) => void;
  failCapture: (error: string) => void;
  refreshRecentCaptures: () => Promise<void>;
  addRecentCapture: (capture: CaptureData) => void;
  updateRecentCapture: (captureId: string, updates: Partial<CaptureData>) => void;
  clearError: () => void;
  setCaptureState: (state: Partial<CaptureStoreState>) => void;
  resetCaptureState: () => void;
  /** Atualiza progresso do pipeline (novo) */
  updatePipelineProgress: (progress: PipelineProgress) => void;
  /** Define status do pipeline (novo) */
  setPipelineStatus: (status: EvidenceStatus) => void;
  /** Define erro com detalhes estruturados */
  setErrorDetails: (error: CaptureErrorDetails) => void;
  /** Limpa estado de erro mantendo o restante */
  clearErrorState: () => void;
  /** Tenta captura novamente */
  retryCapture: () => Promise<void>;
  /** Limpa cache da extensão (sem logout) */
  clearCaptureCache: () => Promise<void>;
}

type CaptureStore = CaptureStoreState & CaptureStoreActions;

/** Máximo de tentativas de retry padrão */
const DEFAULT_MAX_RETRIES = 3;

const initialState: CaptureStoreState = {
  isCapturing: false,
  currentCaptureId: null,
  currentCaptureType: null,
  currentStorageType: null,
  captureProgress: null,
  recentCaptures: [],
  isLoadingRecent: true,
  error: null,
  isStarting: false,
  isCancelling: false,
  pipelineProgress: null,
  pipelineStatus: null,
  errorDetails: null,
  isRetryable: false,
  retryCount: 0,
  maxRetries: DEFAULT_MAX_RETRIES,
  isRetrying: false,
};

/**
 * Store de captura Zustand
 */
export const useCaptureStore = create<CaptureStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    loadCaptureState: async (): Promise<void> => {
      try {
        const result = await chrome.storage.local.get([
          STORAGE_KEYS.CAPTURE_STATE,
          STORAGE_KEYS.RECENT_CAPTURES,
        ]);

        const captureState = result[STORAGE_KEYS.CAPTURE_STATE] as {
          isCapturing: boolean;
          currentCaptureId: string | null;
          currentCaptureType: CaptureType | null;
          currentStorageType: StorageType | null;
          progress: CaptureProgress | null;
        } | undefined;

        const recentCaptures = (result[STORAGE_KEYS.RECENT_CAPTURES] as CaptureData[]) ?? [];

        set({
          isCapturing: captureState?.isCapturing ?? false,
          currentCaptureId: captureState?.currentCaptureId ?? null,
          currentCaptureType: captureState?.currentCaptureType ?? null,
          currentStorageType: captureState?.currentStorageType ?? null,
          captureProgress: captureState?.progress ?? null,
          recentCaptures,
          isLoadingRecent: false,
        });
      } catch (err) {
        log.error('[CaptureStore] Erro ao carregar estado:', err);
        set({ isLoadingRecent: false, error: 'Erro ao carregar capturas' });
      }
    },

    startCapture: async (type: CaptureType, storageType: StorageType): Promise<string> => {
      set({ error: null, isStarting: true });

      try {
        const result = await chrome.runtime.sendMessage({
          type: 'START_CAPTURE',
          payload: { captureType: type, storageType },
        });

        if (!result?.success) {
          const errorMessage = result?.error ?? 'Falha ao iniciar captura';
          set({ error: errorMessage, isStarting: false });
          throw new Error(errorMessage);
        }

        const captureId = result.captureId as string;
        const progress: ScreenshotCaptureProgress = {
          stage: 'initializing',
          percent: 0,
          message: 'Iniciando...',
        };

        set({
          isCapturing: true,
          currentCaptureId: captureId,
          currentCaptureType: type,
          currentStorageType: storageType,
          captureProgress: progress,
          isStarting: false,
        });

        await chrome.storage.local.set({
          [STORAGE_KEYS.CAPTURE_STATE]: {
            isCapturing: true,
            currentCaptureId: captureId,
            currentCaptureType: type,
            currentStorageType: storageType,
            progress,
          },
        });

        return captureId;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erro ao iniciar captura';
        set({ error: errorMessage, isStarting: false });
        throw err;
      }
    },

    prepareVideoEnvironment: async (): Promise<void> => {
      try {
        await chrome.runtime.sendMessage({ type: 'PREPARE_VIDEO_ENVIRONMENT' });
      } catch (err) {
        log.error('[CaptureStore] Erro ao preparar ambiente:', err);
        throw err;
      }
    },

    cancelCapture: async (): Promise<void> => {
      set({ isCancelling: true });

      try {
        await chrome.runtime.sendMessage({ type: 'CAPTURE_CANCEL' });
        set({
          isCapturing: false,
          currentCaptureId: null,
          currentCaptureType: null,
          currentStorageType: null,
          captureProgress: null,
          isCancelling: false,
        });
        await chrome.storage.local.remove(STORAGE_KEYS.CAPTURE_STATE);
      } catch (err) {
        log.error('[CaptureStore] Erro ao cancelar captura:', err);
        set({ isCancelling: false });
      }
    },

    stopVideoRecording: async (): Promise<void> => {
      try {
        await chrome.runtime.sendMessage({ type: 'CAPTURE_STOP_VIDEO' });
      } catch (err) {
        log.error('[CaptureStore] Erro ao parar gravação:', err);
      }
    },

    updateProgress: (progress: CaptureProgress): void => {
      set({ captureProgress: progress });
      const state = get();
      chrome.storage.local.set({
        [STORAGE_KEYS.CAPTURE_STATE]: {
          isCapturing: state.isCapturing,
          currentCaptureId: state.currentCaptureId,
          currentCaptureType: state.currentCaptureType,
          currentStorageType: state.currentStorageType,
          progress,
        },
      }).catch((err) => log.error('[CaptureStore] Erro ao persistir progresso:', err));
    },

    completeCapture: (captureData: CaptureData): void => {
      const { recentCaptures } = get();
      const updatedRecent = [captureData, ...recentCaptures].slice(0, MAX_RECENT_CAPTURES);

      set({
        isCapturing: false,
        currentCaptureId: null,
        currentCaptureType: null,
        currentStorageType: null,
        captureProgress: null,
        recentCaptures: updatedRecent,
      });

      chrome.storage.local.set({ [STORAGE_KEYS.RECENT_CAPTURES]: updatedRecent })
        .catch((err) => log.error('[CaptureStore] Erro ao persistir capturas:', err));
      chrome.storage.local.remove(STORAGE_KEYS.CAPTURE_STATE)
        .catch((err) => log.error('[CaptureStore] Erro ao limpar estado:', err));
    },

    failCapture: (error: string): void => {
      set({
        isCapturing: false,
        currentCaptureId: null,
        currentCaptureType: null,
        currentStorageType: null,
        captureProgress: null,
        error,
      });
      chrome.storage.local.remove(STORAGE_KEYS.CAPTURE_STATE)
        .catch((err) => log.error('[CaptureStore] Erro ao limpar estado:', err));
    },

    refreshRecentCaptures: async (): Promise<void> => {
      try {
        const result = await chrome.runtime.sendMessage({ type: 'CAPTURE_GET_RECENT' });
        if (result?.captures) {
          set({ recentCaptures: result.captures });
          await chrome.storage.local.set({ [STORAGE_KEYS.RECENT_CAPTURES]: result.captures });
        }
      } catch (err) {
        log.error('[CaptureStore] Erro ao atualizar capturas:', err);
      }
    },

    addRecentCapture: (capture: CaptureData): void => {
      const { recentCaptures } = get();
      const updatedRecent = [capture, ...recentCaptures].slice(0, MAX_RECENT_CAPTURES);
      set({ recentCaptures: updatedRecent });
      chrome.storage.local.set({ [STORAGE_KEYS.RECENT_CAPTURES]: updatedRecent })
        .catch((err) => log.error('[CaptureStore] Erro ao persistir capturas:', err));
    },

    updateRecentCapture: (captureId: string, updates: Partial<CaptureData>): void => {
      const { recentCaptures } = get();
      const updatedRecent = recentCaptures.map((c) =>
        c.id === captureId ? { ...c, ...updates } : c
      );
      set({ recentCaptures: updatedRecent });
      chrome.storage.local.set({ [STORAGE_KEYS.RECENT_CAPTURES]: updatedRecent })
        .catch((err) => log.error('[CaptureStore] Erro ao persistir capturas:', err));
    },

    clearError: (): void => set({ error: null }),

    setCaptureState: (state: Partial<CaptureStoreState>): void => set(state),

    resetCaptureState: (): void => {
      set({
        isCapturing: false,
        currentCaptureId: null,
        currentCaptureType: null,
        currentStorageType: null,
        captureProgress: null,
        error: null,
        isStarting: false,
        isCancelling: false,
        pipelineProgress: null,
        pipelineStatus: null,
      });
      chrome.storage.local.remove(STORAGE_KEYS.CAPTURE_STATE)
        .catch((err) => log.error('[CaptureStore] Erro ao limpar estado:', err));
      chrome.storage.local.remove(STORAGE_KEYS.PIPELINE_PROGRESS)
        .catch((err) => log.error('[CaptureStore] Erro ao limpar progresso pipeline:', err));
    },

    updatePipelineProgress: (progress: PipelineProgress): void => {
      const legacyStatus = mapPipelineStatusToLegacy(progress.status);
      const isActive = isActiveStatus(progress.status);

      set({
        pipelineProgress: progress,
        pipelineStatus: progress.status,
        isCapturing: isActive,
        currentCaptureId: progress.evidenceId,
      });

      // Persistir progresso do pipeline
      chrome.storage.local.set({
        [STORAGE_KEYS.PIPELINE_PROGRESS]: progress,
        [STORAGE_KEYS.CAPTURE_STATE]: {
          isCapturing: isActive,
          currentCaptureId: progress.evidenceId,
          currentCaptureType: get().currentCaptureType,
          currentStorageType: get().currentStorageType,
          progress: {
            stage: legacyStatus,
            percent: progress.percent,
            message: progress.message,
          },
        },
      }).catch((err) => log.error('[CaptureStore] Erro ao persistir progresso pipeline:', err));
    },

    setPipelineStatus: (status: EvidenceStatus): void => {
      const isActive = isActiveStatus(status);
      set({
        pipelineStatus: status,
        isCapturing: isActive,
      });
    },

    setErrorDetails: (error: CaptureErrorDetails): void => {
      log.error('[CaptureStore] Erro de captura:', error);

      // Limpar timeouts ativos
      getTimeoutManager().clearAll();

      set({
        errorDetails: error,
        isRetryable: error.isRecoverable,
        error: error.message,
        isCapturing: false,
        isStarting: false,
        isCancelling: false,
        isRetrying: false,
      });

      // Persistir estado de erro para recuperação
      chrome.storage.local.set({
        [STORAGE_KEYS.CAPTURE_STATE]: {
          isCapturing: false,
          error: error.message,
          errorDetails: error,
        },
      }).catch((err) => log.error('[CaptureStore] Erro ao persistir erro:', err));
    },

    clearErrorState: (): void => {
      log.info('[CaptureStore] Limpando estado de erro');
      set({
        error: null,
        errorDetails: null,
        isRetryable: false,
        retryCount: 0,
        isRetrying: false,
      });
    },

    retryCapture: async (): Promise<void> => {
      const state = get();
      const { currentCaptureType, currentStorageType, retryCount, maxRetries } = state;

      // Verificar se pode fazer retry
      if (retryCount >= maxRetries) {
        log.warn('[CaptureStore] Máximo de tentativas atingido');
        set({
          isRetryable: false,
          errorDetails: state.errorDetails ? {
            ...state.errorDetails,
            isRecoverable: false,
            message: 'Número máximo de tentativas atingido. Por favor, tente uma nova captura.',
          } : null,
        });
        return;
      }

      // Incrementar contador e limpar erro
      set({
        isRetrying: true,
        retryCount: retryCount + 1,
        error: null,
        errorDetails: null,
      });

      try {
        // Se temos tipo de captura salvo, tentar novamente
        if (currentCaptureType && currentStorageType) {
          log.info(`[CaptureStore] Retry tentativa ${retryCount + 1}`);
          await get().startCapture(currentCaptureType, currentStorageType);
        } else {
          // Sem contexto de captura - não pode fazer retry automático
          log.warn('[CaptureStore] Sem contexto de captura para retry');
          set({ isRetrying: false });
        }
      } catch (err) {
        log.error('[CaptureStore] Erro no retry:', err);
        set({ isRetrying: false });
        // O erro será tratado pelo startCapture
      }
    },

    clearCaptureCache: async (): Promise<void> => {
      log.info('[CaptureStore] Limpando cache de captura (mantendo auth)');

      // Limpar todos os timeouts
      getTimeoutManager().clearAll();

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
          log.info(`[CaptureStore] Cache limpo: ${keysToRemove.length} chaves removidas`);
        }

        // Resetar estado do store (mas manter recentCaptures)
        const { recentCaptures } = get();
        set({
          ...initialState,
          recentCaptures,
          isLoadingRecent: false,
        });

        log.info('[CaptureStore] Estado resetado com sucesso');
      } catch (err) {
        log.error('[CaptureStore] Erro ao limpar cache:', err);
        throw err;
      }
    },
  }))
);

/** Inicializa listeners de mensagens e storage */
export function initCaptureListeners(): () => void {
  const handleMessage = (message: { type: string; payload?: unknown }): void => {
    const store = useCaptureStore.getState();
    switch (message.type) {
      case 'CAPTURE_PROGRESS':
        store.updateProgress(message.payload as CaptureProgress);
        break;
      case 'CAPTURE_COMPLETE':
        store.completeCapture(message.payload as CaptureData);
        break;
      case 'CAPTURE_ERROR':
        store.failCapture((message.payload as { error: string })?.error ?? 'Erro na captura');
        break;
      case 'CAPTURE_CANCELLED':
        store.resetCaptureState();
        break;
      // Novas mensagens do pipeline unificado
      case 'PIPELINE_PROGRESS':
        store.updatePipelineProgress(message.payload as PipelineProgress);
        break;
      case 'PIPELINE_STATUS':
        store.setPipelineStatus((message.payload as { status: EvidenceStatus }).status);
        break;
      case 'PIPELINE_COMPLETE':
        store.completeCapture(message.payload as CaptureData);
        break;
      case 'PIPELINE_ERROR': {
        const errorPayload = message.payload as {
          error: string;
          code?: string;
          isRecoverable?: boolean;
          phase?: string;
          details?: string;
        };

        // Criar detalhes estruturados do erro
        // Usar spread condicional para evitar propriedades undefined
        const errorDetails: CaptureErrorDetails = {
          code: errorPayload.code ?? 'UNKNOWN_ERROR',
          message: errorPayload.error ?? 'Erro desconhecido no pipeline',
          isRecoverable: errorPayload.isRecoverable ?? false,
          retryCount: store.retryCount,
          maxRetries: store.maxRetries,
          ...(errorPayload.phase && { phase: errorPayload.phase }),
          ...(errorPayload.details && { technicalDetails: errorPayload.details }),
        };

        store.setErrorDetails(errorDetails);
        break;
      }
    }
  };

  const handleStorageChange = (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: string
  ): void => {
    if (areaName !== 'local') {
      return;
    }

    const captureStateChange = changes[STORAGE_KEYS.CAPTURE_STATE];
    if (captureStateChange) {
      const newState = captureStateChange.newValue;
      useCaptureStore.setState({
        isCapturing: newState?.isCapturing ?? false,
        currentCaptureId: newState?.currentCaptureId ?? null,
        currentCaptureType: newState?.currentCaptureType ?? null,
        currentStorageType: newState?.currentStorageType ?? null,
        captureProgress: newState?.progress ?? null,
      });
    }

    const recentCapturesChange = changes[STORAGE_KEYS.RECENT_CAPTURES];
    if (recentCapturesChange) {
      useCaptureStore.setState({
        recentCaptures: recentCapturesChange.newValue ?? [],
      });
    }

    // Novo: Sincronizar progresso do pipeline entre contextos
    const pipelineProgressChange = changes[STORAGE_KEYS.PIPELINE_PROGRESS];
    if (pipelineProgressChange) {
      const progress = pipelineProgressChange.newValue as PipelineProgress | null;
      useCaptureStore.setState({
        pipelineProgress: progress,
        pipelineStatus: progress?.status ?? null,
      });
    }
  };

  chrome.runtime.onMessage.addListener(handleMessage);
  chrome.storage.onChanged.addListener(handleStorageChange);

  return () => {
    chrome.runtime.onMessage.removeListener(handleMessage);
    chrome.storage.onChanged.removeListener(handleStorageChange);
  };
}

export default useCaptureStore;
