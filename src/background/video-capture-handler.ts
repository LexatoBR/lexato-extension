/**
 * Handler de Captura de Vídeo Forense
 *
 * Orquestra a captura de vídeo via MediaRecorder no documento offscreen,
 * gerenciando chunks, upload multipart e isolamento de abas.
 *
 * MIGRAÇÃO PARA PIPELINE UNIFICADO:
 * Este módulo está em processo de migração para usar o EvidencePipeline.
 * A classe VideoCaptureHandler está marcada como @deprecated e será removida
 * após 2 semanas de operação estável do novo pipeline.
 *
 * Usar as novas funções:
 * - startVideoCaptureWithPipeline() - Inicia captura de vídeo
 * - stopVideoCaptureWithPipeline() - Para captura e processa resultado
 *
 * Requisitos:
 * - 2.3: Captura de vídeo via MediaRecorder
 * - 2.4, 2.5, 2.6: Hashes e Merkle Root
 * - 13.4, 13.5, 13.7: Migração incremental com compatibilidade
 *
 * @module VideoCaptureHandler
 */

import { AuditLogger } from '../lib/audit-logger';
import { addBreadcrumb } from '../lib/sentry';
import { ChunkManager } from './chunk-manager';
import { MultipartUploadService } from '../lib/multipart-upload';
import { TabIsolationManager } from './tab-isolation-manager';
import { hasDOMAccess, detectExecutionContext } from '../lib/context-utils';
import { permissionHelper } from '../lib/permissions/permission-helper';
import {
  getTabIsolationManager,
  getExtensionIsolationManager,
} from './managers/isolation-managers';

import { VideoEvidenceManifest } from '../types/video-evidence.types';

// ============================================================================
// Funções de Debug - Logging Extensivo para Diagnóstico
// ============================================================================

const DEBUG_PREFIX = '[VideoCaptureHandler]';
let debugCounter = 0;

/**
 * Flag para habilitar logs de debug
 * Em produção, os logs de debug são desabilitados para evitar poluição do console
 */
const DEBUG_ENABLED = import.meta.env.DEV || import.meta.env['VITE_DEBUG'] === 'true';

/**
 * Log de debug com timestamp, contador e contexto de execução
 * NOTA: Logs são desabilitados em produção para melhorar performance
 */
function debugLog(tag: string, data?: Record<string, unknown>): void {
  if (!DEBUG_ENABLED) {
    return;
  }
  debugCounter++;
  const timestamp = new Date().toISOString();
  const context = detectExecutionContext();
  const hasDOM = hasDOMAccess();
  // Usar Sentry breadcrumb em vez de console.log
  addBreadcrumb({
    category: 'video-capture',
    message: `[${debugCounter}] ${tag}`,
    level: 'info',
    ...(data ? { data: typeof data === 'object' ? data as Record<string, unknown> : { value: data } } : {}),
  });
}

/**
 * Log de erro com timestamp, contador e contexto de execução
 */
function debugError(tag: string, error: unknown): void {
  debugCounter++;
  const timestamp = new Date().toISOString();
  const context = detectExecutionContext();
  const hasDOM = hasDOMAccess();
  const errorMsg = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : undefined;
  console.error(
    `${DEBUG_PREFIX} [${debugCounter}] [${timestamp}] [${context}] [DOM:${hasDOM}] ERROR: ${tag}`,
    { error: errorMsg, stack: errorStack }
  );
}

// ============================================================================
// Tipos de Finalização
// ============================================================================

/**
 * Fase da finalização de captura
 */
export type FinalizationPhase = 'stopping' | 'timestamp' | 'upload' | 'preview' | 'complete' | 'error';

/**
 * Mensagem de progresso de finalização para o SidePanel
 */
export interface FinalizationProgressMessage {
  type: 'FINALIZATION_PROGRESS';
  payload: {
    phase: FinalizationPhase;
    percent: number;
    message: string;
  };
}

// ============================================================================
// Função de Notificação de Progresso
// ============================================================================

/**
 * Envia mensagem de progresso de finalização para o SidePanel
 * Permite que o usuário veja o progresso das fases de finalização
 */
function sendFinalizationProgress(phase: FinalizationPhase, percent: number, message: string): void {
  const progressMessage: FinalizationProgressMessage = {
    type: 'FINALIZATION_PROGRESS',
    payload: {
      phase,
      percent,
      message,
    },
  };

  // Enviar para todos os listeners (SidePanel irá receber)
  chrome.runtime.sendMessage(progressMessage).catch(() => {
    // Ignorar erro se não houver listeners (SidePanel fechado)
  });
}

// ============================================================================
// Tipos Legados (Deprecated)
// ============================================================================

/**
 * Configuração para iniciar captura
 *
 * @deprecated Usar CaptureConfig de evidence-pipeline/types.ts
 */
export interface CaptureConfig {
    tabId: number;
    windowId: number;
    captureId: string;
    storageType: string; // 'STANDARD' | 'GLACIER' etc
}

/**
 * Snapshot do estado atual da captura para diagnóstico
 * @internal Usado para diagnóstico e debugging
 * @deprecated Será removido junto com VideoCaptureHandler
 */
type CaptureStateSnapshot = {
    isCapturing: boolean;
    hasChunkManager: boolean;
    hasUploadService: boolean;
    uploadServiceInProgress: boolean;
    uploadId: string | null;
};

// Exportar tipo para evitar warning de não uso
export type { CaptureStateSnapshot };

/**
 * Handler responsável por orquestrar a captura de vídeo forense
 *
 * @deprecated Esta classe será substituída por chamadas ao EvidencePipeline.
 * Usar startVideoCaptureWithPipeline() e stopVideoCaptureWithPipeline() para novos fluxos.
 * Será removida após 2 semanas de operação estável do novo pipeline.
 */
export class VideoCaptureHandler {
    private isCapturing = false;
    private recordingStoppedPending = false;
    private stopRequested = false;
    private chunkManager: ChunkManager | null = null;
    private uploadService: MultipartUploadService | null = null;
    private currentCaptureId: string | null = null;
    private currentTabId: number | null = null;

    constructor(
        private logger: AuditLogger,
        private tabIsolationManager: TabIsolationManager
        // Injeção de dependências futura para ChunkManager e UploadService se necessário
    ) { }

    /**
     * Garante que o documento offscreen existe
     */
    private async ensureOffscreenDocument(): Promise<void> {
        const existingContexts = await chrome.runtime.getContexts({});
        const offscreenExists = existingContexts.some(c => c.contextType === 'OFFSCREEN_DOCUMENT');

        if (offscreenExists) {
            return;
        }

        await chrome.offscreen.createDocument({
            url: 'src/offscreen/offscreen.html',
            reasons: [chrome.offscreen.Reason.USER_MEDIA],
            justification: 'Gravação forense de vídeo da aba',
        });
    }

    /**
     * Inicia o processo de captura
     */
    async startCapture(config: CaptureConfig): Promise<void> {
        if (this.isCapturing) {
            this.logger.warn('CAPTURE', 'START_DUPLICATED_IGNORED', { captureId: config.captureId });
            // Retorna promessa resolvida para não quebrar o fluxo do chamador que talvez tenha disparado duplo
            return; 
        }

        // Bloqueio imediato para evitar Race Condition (cliques duplos no botão Start)
        this.isCapturing = true;

        // Verbose Logging via logger
        this.logger.info('CAPTURE', 'START_CAPTURE_VERBOSE', {
            captureId: config.captureId,
            tabId: config.tabId,
            windowId: config.windowId,
            storageType: config.storageType
        });

        this.logger.info('CAPTURE', 'START_REQUESTED', {
            captureId: config.captureId,
            tabId: config.tabId,
            windowId: config.windowId,
            storageType: config.storageType
        });


        try {
            // 1. Preparar Offscreen
            await this.ensureOffscreenDocument();

            // 1.1 GARANTIA DE ESTADO: Forçar parada de qualquer gravação anterior no Offscreen
            // Isso previne o erro "Gravação já em andamento" se o offscreen ficou "preso"
            try {
                await chrome.runtime.sendMessage({
                    type: 'cancel-recording',
                    target: 'offscreen'
                });
            } catch {
                // Pode falhar se offscreen não existir ainda, mas ensureOffscreenDocument já garantiu
            }

            // 2. Verificar permissão 'tabCapture' antes de obter stream
            const hasTabCapture = await permissionHelper.hasPermission('tabCapture');
            if (!hasTabCapture) {
                this.logger.error('CAPTURE', 'TAB_CAPTURE_PERMISSION_NOT_GRANTED', {
                    captureId: config.captureId,
                    degradation: 'Captura de vídeo não pode ser iniciada sem permissão tabCapture',
                });
                throw new Error('Permissão tabCapture não concedida. Solicite a permissão antes de iniciar a captura.');
            }

            // 3. Obter Stream ID
                const streamId = await new Promise<string>((resolve, reject) => {
                chrome.tabCapture.getMediaStreamId(
                    { targetTabId: config.tabId },
                    (id) => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                            return;
                        }
                        if (!id) {
                            reject(new Error('Falha ao obter stream ID'));
                            return;
                        }
                        resolve(id);
                    }
                );
            });

            // 4. Inicializar Componentes
            this.chunkManager = new ChunkManager();

            // Instantiate service (requires APIClient to be initialized in service-worker)
            this.uploadService = new MultipartUploadService();

            await this.uploadService.initiate(config.captureId, config.storageType);

            // 5. Iniciar Gravação no Offscreen
            const response = await chrome.runtime.sendMessage({
                type: 'start-recording',
                target: 'offscreen',
                data: {
                    streamId: streamId,
                    mimeType: 'video/webm;codecs=vp9',
                    timeslice: 1000 // 1 segundo para updates frequentes de UI e upload
                }
            });

            if (!response?.success) {
                throw new Error(response?.error ?? 'Falha ao iniciar gravador offscreen');
            }

            // 6. Ativar Isolamento de Abas
            await this.tabIsolationManager.activate(config.tabId, config.windowId);
            
            // isCapturing já está true desde o início.
            
            // Salva captureId e tabId para uso no persistence e notificação
            this.currentCaptureId = config.captureId;
            this.currentTabId = config.tabId;

            this.logger.info('CAPTURE', 'STARTED', { captureId: config.captureId });

        } catch (error) {
            this.logger.error('CAPTURE', 'START_FAILED', { error: String(error) });
            await this.cleanup();
            throw error;
        }
    }

    /**
     * Processa chunk recebido do offscreen
     * 
     * @param data - Dados do chunk (array de números ou base64 string legado)
     */
    async handleChunk(data: { chunk: string | number[], index: number, timestamp: string, size?: number, mimeType?: string }): Promise<void> {
        // Conversão para Uint8Array
        let chunkData: Uint8Array;
        
        if (Array.isArray(data.chunk)) {
            // Formato preferido: array de números (mais confiável)
            chunkData = new Uint8Array(data.chunk);
        } else if (typeof data.chunk === 'string') {
            // Fallback para base64 (legado)
            try {
                // Remove Data URL prefix se presente
                let base64Data = data.chunk;
                if (base64Data.includes(',')) {
                    base64Data = base64Data.split(',')[1] ?? base64Data;
                }
                
                // Validar se é base64 válido antes de decodificar
                if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64Data)) {
                    throw new Error('String base64 inválida');
                }
                
                const binaryString = atob(base64Data);
                const len = binaryString.length;
                chunkData = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    chunkData[i] = binaryString.charCodeAt(i);
                }
            } catch (decodeError) {
                this.logger.error('CAPTURE', 'CHUNK_DECODE_FAILED', { 
                    index: data.index, 
                    error: String(decodeError),
                    chunkLength: data.chunk.length,
                    chunkPreview: data.chunk.substring(0, 50)
                });
                return; // Ignora chunk corrompido mas não para a captura
            }
        } else {
            this.logger.error('CAPTURE', 'CHUNK_INVALID_FORMAT', { 
                index: data.index, 
                type: typeof data.chunk 
            });
            return;
        }

        this.logger.info('CAPTURE', 'HANDLE_CHUNK_CALLED', {
            index: data.index,
            chunkSize: chunkData.length,
            isCapturing: this.isCapturing,
            hasChunkManager: !!this.chunkManager,
            hasUploadService: !!this.uploadService,
            uploadServiceInProgress: this.uploadService?.isInProgress(),
            uploadId: this.uploadService?.getUploadId()
        });

        if (!this.isCapturing || !this.chunkManager || !this.uploadService) {
            this.logger.warn('CAPTURE', 'CHUNK_IGNORED_STATE', { 
                state: this.isCapturing,
                hasChunkManager: !!this.chunkManager,
                hasUploadService: !!this.uploadService
            });
            return;
        }

        try {
            // Converter Uint8Array para ArrayBuffer para compatibilidade com Blob
            const arrayBuffer = chunkData.buffer.slice(
                chunkData.byteOffset,
                chunkData.byteOffset + chunkData.byteLength
            ) as ArrayBuffer;
            const blob = new Blob([arrayBuffer], { type: 'video/webm;codecs=vp9' });

            // Processar Hash e Encadeamento
            const videoChunk = await this.chunkManager.processChunk(blob, data.index);

            // Enviar para Upload usando novo método addChunk (com buffer de 5MB)
            const result = await this.uploadService.addChunk(
                videoChunk.data,
                videoChunk.hash
            );
            
            // Log sucesso (result é null se ainda acumulando no buffer)
            if (result) {
                this.logger.info('CAPTURE', 'PART_UPLOADED', { 
                    partNumber: result.partNumber,
                    etag: result.etag,
                });
            }

            this.logger.info('CAPTURE', 'CHUNK_PROCESSED', { 
                index: data.index, 
                size: blob.size,
                type: blob.type,
                buffered: result === null,
                hash: videoChunk.hash,
            });

        } catch (error) {
            this.logger.error('CAPTURE', 'CHUNK_Processing_FAILED', { index: data.index, error: String(error) });
            // Decidir se aborta captura ou tenta recuperar
        }
    }

    /**
     * Para a captura e finaliza o processo
     */
    private stopResolve: ((value: VideoEvidenceManifest | null) => void) | null = null;

    /**
     * Chamado quando o offscreen confirma que parou a gravação
     * 
     * IMPORTANTE: Este método é chamado quando o MediaRecorder para,
     * seja por stop explícito ou por fim natural do stream.
     * Só deve finalizar o upload e resolver a Promise se stopCapture() foi chamado.
     */
    async handleRecordingStopped(): Promise<void> {
        this.logger.info('CAPTURE', 'RECORDING_STOPPED_HANDLER_INVOKED', {
            isCapturing: this.isCapturing,
            hasStopResolve: !!this.stopResolve,
            captureId: this.currentCaptureId,
            stopRequested: this.stopRequested,
        });

        // Se stop não foi solicitado pelo usuário, apenas marcar como pendente
        if (!this.stopRequested) {
            this.logger.warn('CAPTURE', 'RECORDING_STOPPED_WITHOUT_STOP_REQUEST', {
                captureId: this.currentCaptureId,
                message: 'Gravação parou mas usuário ainda não clicou Stop. Aguardando...',
            });
            // Marcar que a gravação do offscreen já parou
            this.recordingStoppedPending = true;
            return;
        }

        await this.finalizarCaptura();
    }

    /**
     * Finaliza a captura: completa upload, gera manifesto e resolve Promise
     */
    private async finalizarCaptura(): Promise<void> {
        this.logger.info('CAPTURE', 'FINALIZING_CAPTURE', {
            captureId: this.currentCaptureId,
            tabId: this.currentTabId,
        });

        try {
            // 1. Finalizar Multipart Upload
            if (this.uploadService) {
                await this.uploadService.complete(this.currentCaptureId ?? undefined);
                this.logger.info('CAPTURE', 'MULTIPART_UPLOAD_COMPLETED', {
                    captureId: this.currentCaptureId,
                });
            }

            // 2. Gerar Manifesto
            this.tabIsolationManager.generateManifestSection();

            // 3. Notificar content script para esconder overlay
            if (this.currentTabId) {
                try {
                    await chrome.tabs.sendMessage(this.currentTabId, {
                        type: 'CAPTURE_COMPLETE',
                        payload: { captureId: this.currentCaptureId },
                    });
                    this.logger.info('CAPTURE', 'OVERLAY_HIDE_SENT', {
                        tabId: this.currentTabId,
                    });
                } catch (e) {
                    // Tab pode ter sido fechada, ignorar erro
                    this.logger.warn('CAPTURE', 'OVERLAY_HIDE_FAILED', {
                        tabId: this.currentTabId,
                        error: String(e),
                    });
                }
            }

            // 4. Resolver a Promise do stopCapture
            if (this.stopResolve) {
                this.stopResolve(null); // Retornar manifesto real aqui depois
                this.stopResolve = null;
            }

        } catch (error) {
            this.logger.error('CAPTURE', 'FINALIZE_FAILED', { error: String(error) });
            if (this.stopResolve) {
                // Mesmo com erro, liberar a UI
                this.stopResolve(null);
                this.stopResolve = null;
            }
        } finally {
            await this.cleanup();
        }
    }

    /**
     * Para a captura e finaliza o processo
     */
    async stopCapture(): Promise<VideoEvidenceManifest | null> {
        // Marcar que o usuário solicitou parada ANTES de qualquer verificação
        this.stopRequested = true;

        this.logger.info('CAPTURE', 'STOPPING', {
            isCapturing: this.isCapturing,
            recordingStoppedPending: this.recordingStoppedPending,
            stopRequested: this.stopRequested,
            captureId: this.currentCaptureId,
        });

        if (!this.isCapturing) {
            this.logger.warn('CAPTURE', 'STOP_CALLED_WHILE_NOT_CAPTURING', {
                recordingStoppedPending: this.recordingStoppedPending,
            });
            // Ainda tentar enviar stop para offscreen por garantia
            try {
                await chrome.runtime.sendMessage({
                    type: 'stop-recording',
                    target: 'offscreen'
                });
            } catch { /* ignore */ }
            this.stopRequested = false; // Reset flag
            return null;
        }

        // Criar Promise para aguardar finalização
        const stopPromise = new Promise<VideoEvidenceManifest | null>((resolve) => {
            this.stopResolve = resolve;
        });

        // Timeout de segurança (15s) para não travar a UI se o sinal nunca voltar
        setTimeout(() => {
            if (this.stopResolve) {
                this.logger.error('CAPTURE', 'STOP_TIMEOUT', {
                    message: 'Stop timeout reached. Forcing cleanup.',
                });
                this.stopResolve(null);
                this.stopResolve = null;
                this.cleanup();
            }
        }, 15000);

        // Se a gravação já parou (recordingStoppedPending), finalizar diretamente
        if (this.recordingStoppedPending) {
            this.logger.info('CAPTURE', 'RECORDING_ALREADY_STOPPED_FINALIZING', {
                captureId: this.currentCaptureId,
            });
            // Chamar finalizarCaptura diretamente pois o offscreen já parou
            await this.finalizarCaptura();
            return stopPromise;
        }

        // 1. Enviar sinal de parada para offscreen
        try {
            await chrome.runtime.sendMessage({
                type: 'stop-recording',
                target: 'offscreen'
            });
            this.logger.info('CAPTURE', 'STOP_SIGNAL_SENT_TO_OFFSCREEN', {
                captureId: this.currentCaptureId,
            });
        } catch (e) {
            console.warn('[VideoCaptureHandler] Failed to send stop to offscreen:', e);
            // Se falhar o envio, tentar finalizar diretamente
            this.logger.warn('CAPTURE', 'STOP_SIGNAL_FAILED_FINALIZING_DIRECTLY', {
                error: String(e),
            });
            await this.finalizarCaptura();
        }

        return stopPromise;
    }

    /**
     * Limpeza de recursos
     */
    private async cleanup() {
        this.isCapturing = false;
        this.recordingStoppedPending = false;
        this.stopRequested = false;
        this.chunkManager = null;
        this.uploadService = null;
        this.currentTabId = null;

        await this.tabIsolationManager.deactivateLockdown(false);

        // Opcional: fechar offscreen document para economizar recursos
        // chrome.offscreen.closeDocument();
    }
}


// ============================================================================
// Nova API com EvidencePipeline
// ============================================================================

import { createEvidencePipeline, ensureAPIClientInitialized, isAPIClientInitialized } from '../lib/evidence-pipeline';
import { getAPIClient } from './api-client';
import { getApiUrl } from '../config/environment';
import type {
  CaptureConfig as PipelineCaptureConfig,
  CaptureResult,
  TimestampResult,
  UploadResult,
  PipelineProgress,
} from '../lib/evidence-pipeline/types';
import { ErrorCodes } from '../lib/errors';
import type { AuthTokens } from '../types/auth.types';

// Importar funções de storage do service-worker via chrome.storage
// (evita dependência circular)

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
async function ensureAPIClientReady(logger: AuditLogger): Promise<boolean> {
  if (isAPIClientInitialized()) {
    debugLog('ENSURE_API_CLIENT_ALREADY_INITIALIZED');
    return true;
  }

  debugLog('ENSURE_API_CLIENT_INITIALIZING');
  
  try {
    // Tentar obter cliente existente primeiro (pode ter sido inicializado pelo service-worker)
    try {
      getAPIClient();
      debugLog('ENSURE_API_CLIENT_FOUND_EXISTING');
      return true;
    } catch {
      // Cliente não existe, precisamos inicializar
      debugLog('ENSURE_API_CLIENT_NOT_FOUND_WILL_INITIALIZE');
    }

    // Inicializar o APIClient com configuração padrão
    ensureAPIClientInitialized({
      baseURL: getApiUrl(),
      getTokens: getStoredTokensForAPIClient,
      refreshToken: async () => {
        // Refresh simplificado - o interceptor do APIClient já trata isso
        logger.warn('AUTH', 'REFRESH_TOKEN_CALLED_FROM_PIPELINE', {});
        return false;
      },
      getCorrelationId: () => crypto.randomUUID(),
      logger: logger,
    });

    debugLog('ENSURE_API_CLIENT_INITIALIZED_SUCCESS');
    logger.info('VIDEO_CAPTURE', 'API_CLIENT_INITIALIZED', {});
    return true;
  } catch (error) {
    debugError('ENSURE_API_CLIENT_FAILED', error);
    logger.error('VIDEO_CAPTURE', 'API_CLIENT_INIT_FAILED', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Payload simplificado para captura de vídeo via pipeline
 */
export interface PipelineVideoCapturePayload {
  /** Classe de armazenamento */
  storageClass?: 'STANDARD' | 'GLACIER' | 'DEEP_ARCHIVE';
  /** Anos de retenção */
  retentionYears?: 5 | 10 | 20;
  /**
   * Stream ID pré-capturado via tabCapture no clique do ícone.
   * Evita o picker do getDisplayMedia quando disponível.
   */
  preCapturedStreamId?: string | undefined;
}

/**
 * Resultado da captura de vídeo via pipeline
 */
export interface PipelineVideoCaptureResult {
  /** Se a captura foi iniciada com sucesso */
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
 * Estado da captura de vídeo em andamento
 * Armazenado em memória para gerenciar o ciclo de vida
 */
interface ActiveVideoCapture {
  evidenceId: string;
  pipeline: ReturnType<typeof createEvidencePipeline>;
  captureResult: CaptureResult | null;
  timestampResult: TimestampResult | null;
  startedAt: number;
}

/** Captura de vídeo ativa (singleton por extensão) */
let activeVideoCapture: ActiveVideoCapture | null = null;

// ============================================================================
// Capture Bridge — Obtenção de streamId via janela intermediária
// ============================================================================

/**
 * Resolver/Rejecter da Promise que aguarda o streamId da capture bridge.
 * Populados por obtainStreamIdViaBridge() e resolvidos pelo handler de
 * mensagens CAPTURE_BRIDGE_STREAM_ID / CAPTURE_BRIDGE_ERROR no service worker.
 */
let bridgeResolve: ((streamId: string) => void) | null = null;
let bridgeReject: ((error: Error) => void) | null = null;

/**
 * Chamado pelo service worker ao receber CAPTURE_BRIDGE_STREAM_ID.
 * Resolve a Promise que startVideoCaptureWithPipeline está aguardando.
 */
export function resolveBridgeStreamId(streamId: string): void {
  if (bridgeResolve) {
    bridgeResolve(streamId);
    bridgeResolve = null;
    bridgeReject = null;
  }
}

/**
 * Chamado pelo service worker ao receber CAPTURE_BRIDGE_ERROR.
 * Rejeita a Promise que startVideoCaptureWithPipeline está aguardando.
 */
export function rejectBridgeStreamId(error: string): void {
  if (bridgeReject) {
    bridgeReject(new Error(error));
    bridgeResolve = null;
    bridgeReject = null;
  }
}

/**
 * Abre a capture bridge window para obter streamId via tabCapture.
 *
 * A bridge é uma janela mínima da extensão que chama
 * chrome.tabCapture.getMediaStreamId() (funciona porque é uma foreground page)
 * e envia o resultado de volta via chrome.runtime.sendMessage.
 *
 * @param tabId - ID da aba a capturar
 * @param timeoutMs - Timeout em ms (padrão: 5000)
 * @returns streamId obtido ou null se falhar
 */
async function obtainStreamIdViaBridge(tabId: number, timeoutMs = 5000): Promise<string | null> {
  debugLog('BRIDGE_OBTAIN_STREAM_ID_START', { tabId, timeoutMs });

  let bridgeWindowId: number | undefined;

  try {
    const streamIdPromise = new Promise<string>((resolve, reject) => {
      bridgeResolve = resolve;
      bridgeReject = reject;
    });

    // Timeout de segurança
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout aguardando streamId da bridge (${timeoutMs}ms)`));
      }, timeoutMs);
    });

    // Abrir janela da bridge com tabId na URL
    const bridgeUrl = chrome.runtime.getURL(`src/capture-bridge/capture-bridge.html?tabId=${tabId}`);
    debugLog('BRIDGE_OPENING_WINDOW', { bridgeUrl });

    const bridgeWindow = await chrome.windows.create({
      url: bridgeUrl,
      type: 'popup',
      width: 1,
      height: 1,
      focused: false,
    });

    bridgeWindowId = bridgeWindow.id;
    debugLog('BRIDGE_WINDOW_CREATED', { windowId: bridgeWindowId });

    // Aguardar streamId ou timeout
    const streamId = await Promise.race([streamIdPromise, timeoutPromise]);
    debugLog('BRIDGE_STREAM_ID_RECEIVED', { streamIdPrefix: streamId.substring(0, 20) });

    // Fechar janela da bridge (pode já ter se fechado sozinha)
    if (bridgeWindowId) {
      try {
        await chrome.windows.remove(bridgeWindowId);
      } catch {
        // Janela já foi fechada pela bridge
      }
    }

    return streamId;
  } catch (error) {
    debugError('BRIDGE_OBTAIN_STREAM_ID_FAILED', error);

    // Limpar resolvers
    bridgeResolve = null;
    bridgeReject = null;

    // Fechar janela da bridge se ainda existir
    if (bridgeWindowId) {
      try {
        await chrome.windows.remove(bridgeWindowId);
      } catch {
        // Ignorar
      }
    }

    return null;
  }
}

/**
 * Inicia captura de vídeo usando o EvidencePipeline unificado
 *
 * Esta é a nova API recomendada para iniciar capturas de vídeo. Ela:
 * 1. Cria uma instância do EvidencePipeline
 * 2. Inicia a Fase 1 (Captura) com VideoStrategy
 * 3. Retorna o ID da evidência para acompanhamento
 *
 * A captura continua em background até que stopVideoCaptureWithPipeline()
 * seja chamado. Após a parada, as fases 2-4 são executadas automaticamente.
 *
 * @param payload - Configuração da captura
 * @param logger - Logger para auditoria
 * @returns Resultado com evidenceId ou erro
 *
 * @example
 * ```typescript
 * const result = await startVideoCaptureWithPipeline(
 *   { retentionYears: 5 },
 *   logger
 * );
 *
 * if (result.success) {
 *   console.log('Gravação iniciada:', result.evidenceId);
 *   // Usuário clica em Stop...
 *   await stopVideoCaptureWithPipeline(logger);
 * }
 * ```
 */
export async function startVideoCaptureWithPipeline(
  payload: PipelineVideoCapturePayload,
  logger: AuditLogger
): Promise<PipelineVideoCaptureResult> {
  debugLog('START_VIDEO_WITH_PIPELINE_CALLED', { 
    payload,
    context: detectExecutionContext(),
    hasDOMAccess: hasDOMAccess(),
  });
  
  logger.info('VIDEO_CAPTURE', 'START_VIDEO_WITH_PIPELINE', { payload });

  // Verificar se já há captura em andamento
  if (activeVideoCapture) {
    debugLog('START_VIDEO_WITH_PIPELINE_ALREADY_IN_PROGRESS', {
      existingId: activeVideoCapture.evidenceId,
    });
    logger.warn('VIDEO_CAPTURE', 'CAPTURE_ALREADY_IN_PROGRESS', {
      existingId: activeVideoCapture.evidenceId,
    });
    return {
      success: false,
      error: 'Já existe uma captura de vídeo em andamento',
      errorCode: ErrorCodes.CAPTURE_FAILED,
    };
  }

  try {
    // 0. CRÍTICO: Garantir que APIClient está inicializado ANTES de criar o pipeline
    debugLog('START_VIDEO_WITH_PIPELINE_ENSURING_API_CLIENT');
    const apiClientReady = await ensureAPIClientReady(logger);
    if (!apiClientReady) {
      debugLog('START_VIDEO_WITH_PIPELINE_API_CLIENT_FAILED');
      return {
        success: false,
        error: 'Falha ao inicializar cliente de API. Verifique se você está autenticado.',
        errorCode: ErrorCodes.AUTH_TOKEN_INVALID,
      };
    }
    debugLog('START_VIDEO_WITH_PIPELINE_API_CLIENT_READY');

    // 0.5. Verificar permissão 'tabCapture' antes de prosseguir
    debugLog('START_VIDEO_WITH_PIPELINE_CHECKING_TAB_CAPTURE_PERMISSION');
    const hasTabCapture = await permissionHelper.hasPermission('tabCapture');
    if (!hasTabCapture) {
      debugLog('START_VIDEO_WITH_PIPELINE_TAB_CAPTURE_PERMISSION_DENIED');
      logger.error('VIDEO_CAPTURE', 'TAB_CAPTURE_PERMISSION_NOT_GRANTED', {
        degradation: 'Captura de vídeo não pode ser iniciada sem permissão tabCapture',
      });
      return {
        success: false,
        error: 'Permissão tabCapture não concedida. Solicite a permissão antes de iniciar a captura.',
        errorCode: ErrorCodes.CAPTURE_FAILED,
      };
    }
    debugLog('START_VIDEO_WITH_PIPELINE_TAB_CAPTURE_PERMISSION_GRANTED');

    // 1. Obter aba ativa
    debugLog('START_VIDEO_WITH_PIPELINE_GETTING_ACTIVE_TAB');
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    debugLog('START_VIDEO_WITH_PIPELINE_ACTIVE_TAB_RESULT', {
      hasTab: !!activeTab,
      tabId: activeTab?.id,
      tabUrl: activeTab?.url,
      windowId: activeTab?.windowId,
    });

    if (!activeTab?.id || !activeTab.url) {
      debugLog('START_VIDEO_WITH_PIPELINE_TAB_ACCESS_FAILED');
      logger.error('VIDEO_CAPTURE', 'TAB_ACCESS_FAILED', {
        hasId: !!activeTab?.id,
        hasUrl: !!activeTab?.url,
      });
      return {
        success: false,
        error: 'Não foi possível acessar a aba atual',
        errorCode: ErrorCodes.PERMISSION_TAB_ACCESS,
      };
    }

    // Garantir que windowId existe
    const windowId = activeTab.windowId;
    if (windowId === undefined) {
      debugLog('START_VIDEO_WITH_PIPELINE_WINDOW_ID_MISSING');
      logger.error('VIDEO_CAPTURE', 'WINDOW_ID_MISSING', {
        tabId: activeTab.id,
      });
      return {
        success: false,
        error: 'Não foi possível obter windowId da aba',
        errorCode: ErrorCodes.PERMISSION_TAB_ACCESS,
      };
    }

    // 1.5. Obter streamId: prioridade é payload > session storage > bridge > getDisplayMedia
    if (!payload.preCapturedStreamId) {
      // Tentar ler do session storage (salvo pelo popup via OPEN_SIDEPANEL_FOR_VIDEO)
      debugLog('START_VIDEO_WITH_PIPELINE_NO_PRE_CAPTURED_STREAM_ID_CHECKING_SESSION');
      try {
        const sessionData = await chrome.storage.session.get('lexato_video_stream_id');
        const storedData = sessionData['lexato_video_stream_id'] as {
          streamId: string | null;
          tabId: number;
          timestamp: number;
        } | undefined;

        if (
          storedData?.streamId &&
          storedData.tabId === activeTab.id &&
          Date.now() - storedData.timestamp < 5 * 60 * 1000
        ) {
          payload.preCapturedStreamId = storedData.streamId;
          debugLog('START_VIDEO_WITH_PIPELINE_SESSION_STREAM_ID_FOUND', {
            streamIdPrefix: storedData.streamId.substring(0, 20),
            ageMs: Date.now() - storedData.timestamp,
          });
          logger.info('VIDEO_CAPTURE', 'SESSION_STREAM_ID_OBTAINED', {
            tabId: storedData.tabId,
            ageMs: Date.now() - storedData.timestamp,
          });
        }

        // Limpar após consumo (uso único)
        await chrome.storage.session.remove('lexato_video_stream_id');
      } catch (err) {
        debugLog('START_VIDEO_WITH_PIPELINE_SESSION_READ_FAILED', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Se ainda não tem streamId, tentar via bridge window (fallback)
    if (!payload.preCapturedStreamId) {
      debugLog('START_VIDEO_WITH_PIPELINE_NO_PRE_CAPTURED_STREAM_ID_TRYING_BRIDGE');
      logger.info('VIDEO_CAPTURE', 'BRIDGE_ATTEMPT', { tabId: activeTab.id });

      const bridgeStreamId = await obtainStreamIdViaBridge(activeTab.id);
      if (bridgeStreamId) {
        payload.preCapturedStreamId = bridgeStreamId;
        debugLog('START_VIDEO_WITH_PIPELINE_BRIDGE_SUCCESS', {
          streamIdPrefix: bridgeStreamId.substring(0, 20),
        });
        logger.info('VIDEO_CAPTURE', 'BRIDGE_STREAM_ID_OBTAINED', {
          streamIdPrefix: bridgeStreamId.substring(0, 20),
        });
      } else {
        debugLog('START_VIDEO_WITH_PIPELINE_BRIDGE_FAILED_FALLBACK_DISPLAY_MEDIA');
        logger.warn('VIDEO_CAPTURE', 'BRIDGE_FAILED_FALLBACK', {
          reason: 'Bridge falhou, fallback para getDisplayMedia com picker',
        });
        // Continua sem streamId — o offscreen usará getDisplayMedia (mostra picker)
      }
    }

    // 2. Ativar lockdown ANTES de iniciar captura
    // Isso bloqueia F12, menu de contexto e outras ações que comprometem a integridade
    debugLog('START_VIDEO_WITH_PIPELINE_ACTIVATING_LOCKDOWN');
    try {
      const lockdownResult = await chrome.tabs.sendMessage(activeTab.id, {
        type: 'ACTIVATE_LOCKDOWN',
      });

      if (!lockdownResult?.success) {
        debugLog('START_VIDEO_WITH_PIPELINE_LOCKDOWN_FAILED', {
          error: lockdownResult?.error,
        });
        logger.warn('VIDEO_CAPTURE', 'LOCKDOWN_ACTIVATION_FAILED', {
          error: lockdownResult?.error ?? 'Falha ao ativar lockdown',
        });
        // Continua mesmo se lockdown falhar - algumas páginas podem não ter content script
      } else {
        debugLog('START_VIDEO_WITH_PIPELINE_LOCKDOWN_ACTIVATED', {
          protections: lockdownResult.data?.protections,
        });
        logger.info('VIDEO_CAPTURE', 'LOCKDOWN_ACTIVATED', {
          protections: lockdownResult.data?.protections,
        });
      }
    } catch (lockdownError) {
      // Content script pode não estar carregado em algumas páginas
      debugLog('START_VIDEO_WITH_PIPELINE_LOCKDOWN_ERROR', {
        error: lockdownError instanceof Error ? lockdownError.message : String(lockdownError),
      });
      logger.warn('VIDEO_CAPTURE', 'LOCKDOWN_ACTIVATION_ERROR', {
        error: lockdownError instanceof Error ? lockdownError.message : String(lockdownError),
      });
    }

    // 3. Criar pipeline
    debugLog('START_VIDEO_WITH_PIPELINE_CREATING_PIPELINE');
    const pipeline = createEvidencePipeline();
    debugLog('START_VIDEO_WITH_PIPELINE_PIPELINE_CREATED');

    // 4. Configurar captura
    debugLog('START_VIDEO_WITH_PIPELINE_CONFIGURING_CAPTURE');
    const captureConfig: PipelineCaptureConfig = {
      tabId: activeTab.id,
      windowId,
      type: 'video',
      storageConfig: {
        storageClass: payload.storageClass ?? 'STANDARD',
        retentionYears: payload.retentionYears ?? 5,
      },
      preCapturedStreamId: payload.preCapturedStreamId,
    };
    debugLog('START_VIDEO_WITH_PIPELINE_CAPTURE_CONFIG', { captureConfig });

    // 5. Registrar callback de progresso e criar sinalização de início real
    debugLog('START_VIDEO_WITH_PIPELINE_REGISTERING_PROGRESS_CALLBACK');

    // Promise que resolve quando o offscreen confirma que a gravação iniciou.
    // Isso evita que o service worker notifique o Side Panel com status 'recording'
    // antes da gravação realmente começar (ex: enquanto o picker do getDisplayMedia está aberto).
    let resolveRecordingStarted: () => void;
    let rejectRecordingStarted: (reason: Error) => void;
    const recordingStartedPromise = new Promise<void>((resolve, reject) => {
      resolveRecordingStarted = resolve;
      rejectRecordingStarted = reject;
    });

    // Timeout de 60s para o usuário interagir com o picker (se aparecer)
    const recordingStartTimeout = setTimeout(() => {
      rejectRecordingStarted(new Error('Timeout aguardando início da gravação (60s)'));
    }, 60_000);

    pipeline.onProgress((progress: PipelineProgress) => {
      debugLog('START_VIDEO_WITH_PIPELINE_PROGRESS', {
        evidenceId: progress.evidenceId,
        status: progress.status,
        phase: progress.phase,
        percent: progress.percent,
      });
      logger.info('VIDEO_CAPTURE', 'PIPELINE_PROGRESS', {
        evidenceId: progress.evidenceId,
        status: progress.status,
        phase: progress.phase,
        percent: progress.percent,
        message: progress.message,
      });

      // Quando o VideoStrategy emite CAPTURING, o offscreen confirmou a gravação
      if (progress.status === 'CAPTURING' && progress.message?.includes('Gravando')) {
        clearTimeout(recordingStartTimeout);
        resolveRecordingStarted();
      }
    });

    // 6. Iniciar Fase 1: Captura (não bloqueia - vídeo é contínuo)
    debugLog('START_VIDEO_WITH_PIPELINE_STARTING_PHASE_1');
    logger.info('VIDEO_CAPTURE', 'PIPELINE_PHASE_1_START', { type: 'video' });

    // Armazenar estado da captura ativa
    // NOTA: startCapture para vídeo retorna uma Promise que só resolve quando stop() é chamado
    // Por isso, não aguardamos aqui - apenas iniciamos
    debugLog('START_VIDEO_WITH_PIPELINE_CALLING_START_CAPTURE');
    const capturePromise = pipeline.startCapture(captureConfig);
    debugLog('START_VIDEO_WITH_PIPELINE_START_CAPTURE_CALLED');

    // Gerar evidenceId temporário (será substituído pelo real quando captura completar)
    const tempEvidenceId = `video-${Date.now()}`;
    debugLog('START_VIDEO_WITH_PIPELINE_TEMP_EVIDENCE_ID', { tempEvidenceId });

    activeVideoCapture = {
      evidenceId: tempEvidenceId,
      pipeline,
      captureResult: null,
      timestampResult: null,
      startedAt: Date.now(),
    };

    // Diagnostico: estado ativo configurado
    addBreadcrumb({ category: 'video-capture', message: `activeVideoCapture configurado: evidenceId=${tempEvidenceId}`, level: 'info' });

    debugLog('START_VIDEO_WITH_PIPELINE_ACTIVE_CAPTURE_SET');

    // Aguardar resultado da captura em background
    debugLog('START_VIDEO_WITH_PIPELINE_SETTING_UP_CAPTURE_PROMISE_HANDLER');

    // Diagnostico: configurando handlers para capturePromise
    addBreadcrumb({ category: 'video-capture', message: 'Configurando handlers para capturePromise', level: 'info' });

    capturePromise
      .then((result) => {
        // Diagnostico: capturePromise resolvida
        addBreadcrumb({ category: 'video-capture', message: `capturePromise resolvida: evidenceId=${result.evidenceId}, mediaSize=${result.media.sizeBytes}`, level: 'info' });

        debugLog('START_VIDEO_WITH_PIPELINE_CAPTURE_PROMISE_RESOLVED', {
          evidenceId: result.evidenceId,
          merkleRoot: result.merkleRoot,
        });
        if (activeVideoCapture) {
          activeVideoCapture.captureResult = result;
          activeVideoCapture.evidenceId = result.evidenceId;
          addBreadcrumb({ category: 'video-capture', message: 'captureResult atribuido ao activeVideoCapture', level: 'info' });
          logger.info('VIDEO_CAPTURE', 'CAPTURE_RESULT_RECEIVED', {
            evidenceId: result.evidenceId,
            merkleRoot: result.merkleRoot,
          });
        } else {
          // Caso crítico - activeVideoCapture foi limpo
        }
      })
      .catch((error) => {
        debugError('START_VIDEO_WITH_PIPELINE_CAPTURE_PROMISE_REJECTED', error);
        logger.error('VIDEO_CAPTURE', 'CAPTURE_FAILED', {
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });

        // Rejeitar a promise de confirmação se a captura falhou antes de iniciar
        clearTimeout(recordingStartTimeout);
        rejectRecordingStarted(error instanceof Error ? error : new Error(String(error)));

        activeVideoCapture = null;
      });

    debugLog('START_VIDEO_WITH_PIPELINE_RETURNING_SUCCESS', {
      evidenceId: tempEvidenceId,
      status: 'CAPTURING',
    });

    // Aguardar confirmação real do offscreen antes de retornar success.
    // Isso garante que o service worker só notifique o Side Panel com 'recording'
    // APÓS a gravação ter realmente iniciado (e não enquanto o picker está aberto).
    try {
      debugLog('START_VIDEO_WITH_PIPELINE_WAITING_RECORDING_CONFIRMATION');
      await recordingStartedPromise;
      debugLog('START_VIDEO_WITH_PIPELINE_RECORDING_CONFIRMED');
    } catch (waitError) {
      // Timeout ou erro — limpar estado e retornar falha
      debugError('START_VIDEO_WITH_PIPELINE_RECORDING_WAIT_FAILED', waitError);
      activeVideoCapture = null;
      return {
        success: false,
        error: waitError instanceof Error ? waitError.message : 'Falha ao aguardar início da gravação',
        errorCode: ErrorCodes.CAPTURE_FAILED,
      };
    }

    return {
      success: true,
      evidenceId: tempEvidenceId,
      status: 'CAPTURING',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    debugError('START_VIDEO_WITH_PIPELINE_CATCH_ERROR', error);

    logger.error('VIDEO_CAPTURE', 'START_VIDEO_FAILED', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    activeVideoCapture = null;

    return {
      success: false,
      error: `Falha ao iniciar gravação: ${errorMessage}`,
      errorCode: ErrorCodes.CAPTURE_FAILED,
    };
  }
}

/**
 * Para a captura de vídeo e executa as fases restantes do pipeline
 *
 * Executa:
 * - Finalização da Fase 1 (para gravação, processa chunks)
 * - Fase 2: Timestamp ICP-Brasil
 * - Fase 3: Upload S3
 * - Fase 4: Abre Preview
 *
 * @param logger - Logger para auditoria
 * @returns Resultado com evidenceId final ou erro
 */
export async function stopVideoCaptureWithPipeline(
  logger: AuditLogger
): Promise<PipelineVideoCaptureResult> {
  debugLog('STOP_VIDEO_WITH_PIPELINE_CALLED', {
    hasActiveCapture: !!activeVideoCapture,
    context: detectExecutionContext(),
    hasDOMAccess: hasDOMAccess(),
  });
  
  logger.info('VIDEO_CAPTURE', 'STOP_VIDEO_WITH_PIPELINE', {});

  if (!activeVideoCapture) {
    debugLog('STOP_VIDEO_WITH_PIPELINE_NO_ACTIVE_CAPTURE');
    logger.warn('VIDEO_CAPTURE', 'NO_ACTIVE_CAPTURE', {});
    return {
      success: false,
      error: 'Nenhuma captura de vídeo em andamento',
      errorCode: ErrorCodes.CAPTURE_FAILED,
    };
  }

  const { pipeline } = activeVideoCapture;
  debugLog('STOP_VIDEO_WITH_PIPELINE_GOT_PIPELINE', {
    evidenceId: activeVideoCapture.evidenceId,
    startedAt: activeVideoCapture.startedAt,
  });

  // Notificar SidePanel que a finalização está iniciando
  // Isso faz o SidePanel mostrar a tela de progresso em vez do timer/controles
  sendFinalizationProgress('stopping', 5, 'Finalizando gravação...');

  try {
    // 1. CRÍTICO: Chamar stopCapture() para disparar VideoStrategy.stop()
    // Isso faz a Promise de startCapture() resolver com o CaptureResult
    debugLog('STOP_VIDEO_WITH_PIPELINE_CALLING_STOP_CAPTURE');
    logger.info('VIDEO_CAPTURE', 'STOPPING_CAPTURE', {});
    await pipeline.stopCapture();
    debugLog('STOP_VIDEO_WITH_PIPELINE_STOP_CAPTURE_COMPLETE');

    // 2. Aguardar resultado da captura (agora deve estar disponível rapidamente)
    debugLog('STOP_VIDEO_WITH_PIPELINE_WAITING_CAPTURE_RESULT');
    logger.info('VIDEO_CAPTURE', 'WAITING_CAPTURE_RESULT', {});

    const maxWait = 10000; // Reduzido para 10s pois stop já foi chamado
    const startWait = Date.now();

    while (!activeVideoCapture.captureResult && Date.now() - startWait < maxWait) {
      debugLog('STOP_VIDEO_WITH_PIPELINE_WAITING_LOOP', {
        elapsed: Date.now() - startWait,
        maxWait,
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (!activeVideoCapture.captureResult) {
      debugError('STOP_VIDEO_WITH_PIPELINE_TIMEOUT', new Error('Timeout aguardando resultado da captura após stop'));
      throw new Error('Timeout aguardando resultado da captura após stop');
    }

    const captureResult = activeVideoCapture.captureResult;

    // Diagnostico: captureResult recebido
    addBreadcrumb({ category: 'video-capture', message: `captureResult recebido: evidenceId=${captureResult.evidenceId}, mediaSize=${captureResult.media.sizeBytes}`, level: 'info' });

    if (captureResult.media.sizeBytes === 0 || captureResult.media.blob?.size === 0) {
      debugError('STOP_VIDEO_WITH_PIPELINE_ZERO_BYTES', new Error(`Media tem 0 bytes: sizeBytes=${captureResult.media.sizeBytes}, blob.size=${captureResult.media.blob?.size}`));
    }

    debugLog('STOP_VIDEO_WITH_PIPELINE_CAPTURE_RESULT_RECEIVED', {
      evidenceId: captureResult.evidenceId,
      merkleRoot: captureResult.merkleRoot,
      mediaSize: captureResult.media.sizeBytes,
    });
    logger.info('VIDEO_CAPTURE', 'PIPELINE_PHASE_1_COMPLETE', {
      evidenceId: captureResult.evidenceId,
      merkleRoot: captureResult.merkleRoot,
      mediaSize: captureResult.media.sizeBytes,
      htmlCollectionSize: captureResult.htmlCollection?.totalSizeBytes ?? 0,
    });

    // 3. Executar Fase 2: Timestamp ICP-Brasil
    debugLog('STOP_VIDEO_WITH_PIPELINE_STARTING_PHASE_2');
    logger.info('VIDEO_CAPTURE', 'PIPELINE_PHASE_2_START', {
      merkleRoot: captureResult.merkleRoot,
    });

    // Notificar SidePanel sobre início da fase de timestamp
    sendFinalizationProgress('timestamp', 25, 'Aplicando carimbo de tempo...');

    const timestampResult = await pipeline.applyTimestamp(captureResult.merkleRoot);

    // IMPORTANTE: Verificar se activeVideoCapture ainda existe antes de atribuir
    // Pode ter sido limpo por timeout ou erro em outra parte do código
    if (activeVideoCapture) {
      activeVideoCapture.timestampResult = timestampResult;
    } else {
      logger.warn('VIDEO_CAPTURE', 'ACTIVE_VIDEO_CAPTURE_NULL_AFTER_TIMESTAMP', {
        message: 'activeVideoCapture foi limpo durante applyTimestamp, continuando sem salvar timestampResult',
      });
    }

    debugLog('STOP_VIDEO_WITH_PIPELINE_PHASE_2_COMPLETE', {
      type: timestampResult.type,
      tsa: timestampResult.tsa,
    });
    logger.info('VIDEO_CAPTURE', 'PIPELINE_PHASE_2_COMPLETE', {
      type: timestampResult.type,
      tsa: timestampResult.tsa,
    });

    // 4. Executar Fase 3: Upload S3 (agora envia TODOS os artefatos)
    debugLog('STOP_VIDEO_WITH_PIPELINE_STARTING_PHASE_3');
    logger.info('VIDEO_CAPTURE', 'PIPELINE_PHASE_3_START', {
      evidenceId: captureResult.evidenceId,
      hasHtmlCollection: !!captureResult.htmlCollection,
      hasForensicMetadata: !!captureResult.forensicMetadata,
    });

    // Notificar SidePanel sobre início da fase de upload
    sendFinalizationProgress('upload', 50, 'Enviando evidência para o servidor...');

    const uploadResult: UploadResult = await pipeline.uploadToS3(captureResult, timestampResult);
    debugLog('STOP_VIDEO_WITH_PIPELINE_PHASE_3_COMPLETE', {
      method: uploadResult.uploadMethod,
      totalBytes: uploadResult.stats.totalBytes,
      filesCount: uploadResult.stats.filesCount,
    });
    logger.info('VIDEO_CAPTURE', 'PIPELINE_PHASE_3_COMPLETE', {
      method: uploadResult.uploadMethod,
      totalBytes: uploadResult.stats.totalBytes,
      filesCount: uploadResult.stats.filesCount,
    });

    // 5. Executar Fase 4: Desbloquear isolamento e abrir Preview
    debugLog('STOP_VIDEO_WITH_PIPELINE_STARTING_PHASE_4');
    logger.info('VIDEO_CAPTURE', 'PIPELINE_PHASE_4_START', {
      evidenceId: captureResult.evidenceId,
    });

    // 5.1. Desbloquear isolamento ANTES de abrir preview
    // CRÍTICO: Sem isso, o TabIsolationManager bloqueia a abertura da nova aba
    debugLog('STOP_VIDEO_WITH_PIPELINE_DEACTIVATING_ISOLATION');
    logger.info('VIDEO_CAPTURE', 'DEACTIVATING_ISOLATION_BEFORE_PREVIEW', {
      evidenceId: captureResult.evidenceId,
    });

    try {
      // Enviar mensagem para content script limpar recursos E desativar lockdown
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        // Primeiro desativar lockdown (F12, menu contexto, etc.)
        await chrome.tabs.sendMessage(tabs[0].id, {
          type: 'DEACTIVATE_LOCKDOWN',
        }).catch(() => {
          debugLog('STOP_VIDEO_DEACTIVATE_LOCKDOWN_MESSAGE_IGNORED');
        });

        // Depois enviar cleanup geral
        await chrome.tabs.sendMessage(tabs[0].id, {
          type: 'CAPTURE_CLEANUP',
        }).catch(() => {
          // Ignorar erro - tab pode não ter content script
          debugLog('STOP_VIDEO_CLEANUP_MESSAGE_IGNORED');
        });
      }

      // Desativar isolamento de abas (usa singleton)
      const tabIsolationMgr = getTabIsolationManager(logger);
      tabIsolationMgr.deactivateLockdown(false);
      debugLog('STOP_VIDEO_TAB_ISOLATION_DEACTIVATED');
      logger.info('VIDEO_CAPTURE', 'TAB_ISOLATION_DEACTIVATED', {});

      // Restaurar extensões desabilitadas
      const extensionIsolationMgr = getExtensionIsolationManager(logger);
      await extensionIsolationMgr.forceRestore();
      debugLog('STOP_VIDEO_EXTENSION_ISOLATION_RESTORED');
      logger.info('VIDEO_CAPTURE', 'EXTENSION_ISOLATION_RESTORED', {});
    } catch (unlockError) {
      // Log mas não falha - preview pode ainda funcionar
      debugLog('STOP_VIDEO_UNLOCK_ERROR', {
        error: unlockError instanceof Error ? unlockError.message : 'Erro desconhecido',
      });
      logger.warn('VIDEO_CAPTURE', 'UNLOCK_ERROR_BEFORE_PREVIEW', {
        error: unlockError instanceof Error ? unlockError.message : 'Erro desconhecido',
      });
    }

    // 5.2. Notificar SidePanel sobre abertura do preview
    sendFinalizationProgress('preview', 90, 'Abrindo visualização...');

    // 5.3. Abrir preview (agora sem bloqueio de isolamento)
    await pipeline.openPreview(captureResult.evidenceId);
    debugLog('STOP_VIDEO_WITH_PIPELINE_PHASE_4_COMPLETE');
    logger.info('VIDEO_CAPTURE', 'PIPELINE_PHASE_4_COMPLETE', {
      evidenceId: captureResult.evidenceId,
    });

    // Notificar SidePanel sobre conclusão
    sendFinalizationProgress('complete', 100, 'Captura finalizada com sucesso!');

    // Limpar estado
    const finalEvidenceId = captureResult.evidenceId;
    activeVideoCapture = null;
    debugLog('STOP_VIDEO_WITH_PIPELINE_COMPLETE', {
      evidenceId: finalEvidenceId,
      status: 'PENDING_REVIEW',
    });

    return {
      success: true,
      evidenceId: finalEvidenceId,
      status: 'PENDING_REVIEW',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

    debugError('STOP_VIDEO_WITH_PIPELINE_CATCH_ERROR', error);

    logger.error('VIDEO_CAPTURE', 'STOP_VIDEO_FAILED', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    activeVideoCapture = null;

    return {
      success: false,
      error: `Falha ao finalizar gravação: ${errorMessage}`,
      errorCode: ErrorCodes.CAPTURE_FAILED,
    };
  }
}

/**
 * Cancela a captura de vídeo em andamento
 *
 * Para o MediaRecorder no offscreen document, limpa recursos e restaura isolamento.
 * Requisito 6.4, 6.5: Restaurar extensões em qualquer cenário de cancelamento.
 *
 * @param logger - Logger para auditoria
 * @returns Resultado da operação
 */
export async function cancelVideoCaptureWithPipeline(
  logger: AuditLogger
): Promise<{ success: boolean; error?: string }> {
  logger.info('VIDEO_CAPTURE', 'CANCEL_VIDEO_WITH_PIPELINE', {});

  if (!activeVideoCapture) {
    logger.warn('VIDEO_CAPTURE', 'NO_ACTIVE_CAPTURE_TO_CANCEL', {});
    return {
      success: true, // Não há nada para cancelar, consideramos sucesso
    };
  }

  try {
    // 1. CRÍTICO: Parar gravação no offscreen document PRIMEIRO
    // Isso garante que o MediaRecorder pare de gravar e libere recursos
    logger.info('VIDEO_CAPTURE', 'STOPPING_OFFSCREEN_RECORDING', {});
    try {
      await chrome.runtime.sendMessage({
        type: 'cancel-recording',
        target: 'offscreen',
      });
      logger.info('VIDEO_CAPTURE', 'OFFSCREEN_CANCEL_SENT', {});
    } catch (offscreenError) {
      // Ignorar erro - offscreen pode não existir ou já ter sido fechado
      logger.warn('VIDEO_CAPTURE', 'OFFSCREEN_CANCEL_FAILED', {
        error: offscreenError instanceof Error ? offscreenError.message : 'Erro desconhecido',
      });
    }

    // 2. Limpar estado da captura ativa
    activeVideoCapture = null;

    // 3. Desbloquear isolamento (sem abrir preview pois foi cancelado)
    logger.info('VIDEO_CAPTURE', 'DEACTIVATING_ISOLATION_ON_CANCEL', {});

    try {
      // Enviar mensagem para content script limpar recursos E desativar lockdown
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        // Primeiro desativar lockdown (F12, menu contexto, etc.)
        await chrome.tabs.sendMessage(tabs[0].id, {
          type: 'DEACTIVATE_LOCKDOWN',
        }).catch(() => {
          // Ignorar erro - tab pode não ter content script
        });

        // Depois enviar cleanup geral
        await chrome.tabs.sendMessage(tabs[0].id, {
          type: 'CAPTURE_CLEANUP',
        }).catch(() => {
          // Ignorar erro - tab pode não ter content script
        });
      }

      // Desativar isolamento de abas (usa singleton)
      const tabIsolationMgr = getTabIsolationManager(logger);
      tabIsolationMgr.deactivateLockdown(false);
      logger.info('VIDEO_CAPTURE', 'TAB_ISOLATION_DEACTIVATED_ON_CANCEL', {});

      // Restaurar extensões desabilitadas
      const extensionIsolationMgr = getExtensionIsolationManager(logger);
      await extensionIsolationMgr.forceRestore();
      logger.info('VIDEO_CAPTURE', 'EXTENSION_ISOLATION_RESTORED_ON_CANCEL', {});
    } catch (unlockError) {
      logger.warn('VIDEO_CAPTURE', 'UNLOCK_ERROR_ON_CANCEL', {
        error: unlockError instanceof Error ? unlockError.message : 'Erro desconhecido',
      });
    }

    logger.info('VIDEO_CAPTURE', 'VIDEO_CAPTURE_CANCELLED', {});

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

    logger.error('VIDEO_CAPTURE', 'CANCEL_VIDEO_FAILED', {
      error: errorMessage,
    });

    // Mesmo em erro, tentar desbloquear
    try {
      // Desativar lockdown no content script
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]?.id) {
        await chrome.tabs.sendMessage(tabs[0].id, {
          type: 'DEACTIVATE_LOCKDOWN',
        }).catch(() => {});
      }

      const tabIsolationMgr = getTabIsolationManager(logger);
      tabIsolationMgr.deactivateLockdown(false);
      const extensionIsolationMgr = getExtensionIsolationManager(logger);
      await extensionIsolationMgr.forceRestore();
    } catch {
      // Ignorar erros de desbloqueio em erro
    }

    activeVideoCapture = null;

    return {
      success: false,
      error: `Falha ao cancelar: ${errorMessage}`,
    };
  }
}

/**
 * Verifica se há captura de vídeo em andamento
 *
 * @returns true se há captura ativa
 */
export function isVideoCaptureActive(): boolean {
  return activeVideoCapture !== null;
}

/**
 * Obtém informações da captura de vídeo ativa
 *
 * @returns Informações da captura ou null se não houver captura ativa
 */
export function getActiveVideoCaptureInfo(): {
  evidenceId: string;
  startedAt: number;
  durationMs: number;
} | null {
  if (!activeVideoCapture) {
    return null;
  }

  return {
    evidenceId: activeVideoCapture.evidenceId,
    startedAt: activeVideoCapture.startedAt,
    durationMs: Date.now() - activeVideoCapture.startedAt,
  };
}
