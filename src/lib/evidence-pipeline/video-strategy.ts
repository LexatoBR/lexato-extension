/**
 * Estratégia de Captura de Vídeo Forense
 *
 * Implementa o padrão Strategy para captura de vídeo via MediaRecorder no
 * documento offscreen. Gerencia o ciclo de vida da gravação, processamento
 * de chunks, coleta de HTML e metadados forenses.
 *
 * Fluxo de captura:
 * 1. Inicializa documento offscreen
 * 2. Coleta HTML inicial e metadados forenses
 * 3. Inicia gravação através de mensagens
 * 4. Monitora navegações e captura HTMLs
 * 5. Recebe chunks periodicamente (timeslice)
 * 6. Calcula hash de cada chunk
 * 7. Ao finalizar, coleta HTML final
 * 8. Calcula Merkle Root de todos os artefatos
 *
 * @module VideoStrategy
 * @see Requirements 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 7.9, 7.10
 */

import { BaseCaptureStrategy } from './base-capture-strategy';
import { calcularHashSHA256, calcularMerkleRoot, gerarUUIDv4 } from './crypto-helper';
import { HtmlCollectionService } from './html-collection-service';
// IMPORTANTE: Importar diretamente do arquivo, NÃO do index.ts
// O index.ts exporta todos os collectors, incluindo os que usam 'document'
// Isso causa erro "document is not defined" no service worker
import { ForensicCollector } from '../forensic/forensic-collector';
import { AuditLogger } from '../audit-logger';
// Importar utilitários de contexto para debug
import { hasDOMAccess, detectExecutionContext } from '../context-utils';
import type {
  CaptureType,
  CaptureConfig,
  CaptureResult,
  PipelineProgressCallback,
  EvidenceStatus,
  HtmlCollection,
} from './types';
import type { ForensicMetadata } from '../../types/forensic-metadata.types';

// ============================================================================
// Funções de Debug - Desabilitadas para produção
// ============================================================================

const DEBUG_PREFIX = '[VideoStrategy]';

/**
 * Log de debug desabilitado para produção (CWS compliance)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function debugLog(_tag: string, _data?: Record<string, unknown>): void {
  // Desabilitado para produção - sem console.warn de diagnóstico
}

/**
 * Log de erro desabilitado para produção (CWS compliance)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function debugError(_tag: string, _error: unknown): void {
  // Desabilitado para produção - erros são capturados pelo AuditLogger/Sentry
}

// ============================================================================
// Tipos Internos
// ============================================================================

interface VideoChunk {
  index: number;
  data: Uint8Array;
  hash: string;
  timestamp: string;
  size: number;
}

interface OffscreenResponse {
  success?: boolean;
  error?: string;
}

// ============================================================================
// Constantes
// ============================================================================

/**
 * Timeslice para MediaRecorder (1 segundo)
 * Intervalo menor permite updates de UI mais fluidos e upload incremental
 */
const TIMESLICE_MS = 1000;

/**
 * Duração máxima padrão (30 minutos)
 */
const MAX_DURATION_MS = 30 * 60 * 1000;

// ============================================================================
// VideoStrategy
// ============================================================================

export class VideoStrategy extends BaseCaptureStrategy {
  readonly type: CaptureType = 'video';

  private chunks: VideoChunk[] = [];
  private totalSize = 0;
  private startTime = 0;
  private streamId: string | null = null;
  private listener: ((message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => void) | null = null;
  private stopResolve: ((result: CaptureResult) => void) | null = null;
  private stopReject: ((reason: unknown) => void) | null = null;
  private evidenceId: string | null = null;
  private config: CaptureConfig | null = null;
  private onProgress: PipelineProgressCallback | undefined;

  // Serviços de coleta
  private htmlCollectionService: HtmlCollectionService | null = null;
  private forensicCollector: ForensicCollector | null = null;
  private forensicMetadata: ForensicMetadata | null = null;
  private pageUrl = '';
  private pageTitle = '';
  private logger: AuditLogger;
  /** Logger com contexto da captura atual */
  private captureLogger: AuditLogger | null = null;

  constructor() {
    super();
    this.logger = new AuditLogger();
  }

  /**
   * Executa captura de vídeo com coleta completa de artefatos forenses
   *
   * @param config - Configuração da captura
   * @param onProgress - Callback de progresso
   * @returns Promise que resolve com CaptureResult APÓS a parada da gravação
   */
  async execute(
    config: CaptureConfig,
    onProgress?: PipelineProgressCallback
  ): Promise<CaptureResult> {
    debugLog('EXECUTE_START', {
      tabId: config.tabId,
      windowId: config.windowId,
      type: config.type,
      context: detectExecutionContext(),
      hasDOMAccess: hasDOMAccess(),
    });

    this.iniciarCaptura();
    debugLog('EXECUTE_INICIAR_CAPTURA_CALLED');

    this.evidenceId = gerarUUIDv4();
    debugLog('EXECUTE_EVIDENCE_ID_GENERATED', { evidenceId: this.evidenceId });

    this.config = config;
    this.onProgress = onProgress;
    this.chunks = [];
    this.totalSize = 0;
    debugLog('EXECUTE_STATE_INITIALIZED');

    // Criar logger com contexto da captura para rastreabilidade completa
    this.captureLogger = this.logger.withContext({
      captureId: this.evidenceId,
      tabId: config.tabId,
      phase: 'INITIALIZING',
    });
    debugLog('EXECUTE_CAPTURE_LOGGER_CREATED');

    this.captureLogger.info('VIDEO_CAPTURE', 'CAPTURE_START', {
      windowId: config.windowId,
      type: config.type,
    });

    try {
      // Timer para medir duração total da inicialização
      const stopInitTimer = this.captureLogger.startTimer('initialization');
      debugLog('EXECUTE_INIT_TIMER_STARTED');
      
      this.captureLogger.info('VIDEO_CAPTURE', 'PHASE_TRANSITION', { 
        from: 'IDLE', 
        to: 'INITIALIZING' 
      });
      this.emitirProgresso('INITIALIZING', 0, 'Inicializando gravador...');
      debugLog('EXECUTE_PHASE_INITIALIZING');

      // 1. Obter informações da aba
      debugLog('EXECUTE_STEP_1_GET_TAB_INFO', { tabId: config.tabId });
      this.captureLogger.info('VIDEO_CAPTURE', 'STEP_TAB_INFO', {});
      const tab = await chrome.tabs.get(config.tabId);
      this.pageUrl = tab.url ?? '';
      this.pageTitle = tab.title ?? '';
      debugLog('EXECUTE_STEP_1_TAB_INFO_OBTAINED', { 
        url: this.pageUrl, 
        title: this.pageTitle 
      });
      this.captureLogger.info('VIDEO_CAPTURE', 'TAB_INFO_OBTAINED', { 
        url: this.pageUrl, 
        title: this.pageTitle 
      });

      // 2. Preparar Offscreen
      debugLog('EXECUTE_STEP_2_PREPARE_OFFSCREEN');
      this.captureLogger.info('VIDEO_CAPTURE', 'STEP_OFFSCREEN_PREPARE', {});
      await this.ensureOffscreenDocument();
      debugLog('EXECUTE_STEP_2_OFFSCREEN_READY');
      this.captureLogger.info('VIDEO_CAPTURE', 'OFFSCREEN_READY', {});

      // 3. Parar gravações anteriores (segurança)
      debugLog('EXECUTE_STEP_3_CANCEL_PREVIOUS');
      this.captureLogger.info('VIDEO_CAPTURE', 'STEP_CANCEL_PREVIOUS', {});
      await this.enviarMensagemOffscreen('cancel-recording');
      debugLog('EXECUTE_STEP_3_PREVIOUS_CANCELLED');
      this.captureLogger.info('VIDEO_CAPTURE', 'PREVIOUS_CANCELLED', {});

      // 4. Usar streamId pré-capturado ou preparar fallback para getDisplayMedia
      // O streamId é pré-capturado no chrome.action.onClicked (user gesture válido).
      // Se disponível, evita o picker do getDisplayMedia — experiência transparente.
      // Se ausente (ex: aba mudou, expirou), o offscreen usa getDisplayMedia como fallback.
      if (config.preCapturedStreamId) {
        this.streamId = config.preCapturedStreamId;
        debugLog('EXECUTE_STEP_4_USING_PRE_CAPTURED_STREAM_ID', {
          streamIdPrefix: this.streamId.substring(0, 20),
        });
        this.captureLogger.info('VIDEO_CAPTURE', 'STEP_STREAM_ID_PRE_CAPTURED', {
          streamIdPrefix: this.streamId.substring(0, 20),
        });
      } else {
        debugLog('EXECUTE_STEP_4_NO_PRE_CAPTURED_STREAM_ID', {
          reason: 'Fallback para getDisplayMedia no offscreen',
        });
        this.captureLogger.info('VIDEO_CAPTURE', 'STEP_STREAM_ID_FALLBACK_DISPLAY_MEDIA', {});
      }
      this.emitirProgresso('INITIALIZING', 10, 'Preparando captura de tela...');

      // 5. Inicializar serviço de coleta de HTML
      debugLog('EXECUTE_STEP_5_INIT_HTML_SERVICE', { tabId: config.tabId });
      this.captureLogger.info('VIDEO_CAPTURE', 'STEP_HTML_SERVICE_INIT', {});
      this.htmlCollectionService = new HtmlCollectionService(config.tabId);
      debugLog('EXECUTE_STEP_5_HTML_SERVICE_CREATED');
      
      this.emitirProgresso('INITIALIZING', 20, 'Coletando HTML inicial...');
      this.captureLogger.info('VIDEO_CAPTURE', 'HTML_COLLECTION_STARTING', {});
      debugLog('EXECUTE_STEP_5_HTML_COLLECTION_STARTING');
      
      try {
        await this.htmlCollectionService.startCollection();
        debugLog('EXECUTE_STEP_5_HTML_COLLECTION_SUCCESS');
        this.captureLogger.info('VIDEO_CAPTURE', 'HTML_COLLECTION_STARTED', {});
      } catch (htmlError) {
        // Continuar mesmo se HTML falhar - não é crítico para vídeo
        debugError('EXECUTE_STEP_5_HTML_COLLECTION_FAILED', htmlError);
        this.captureLogger.warn('VIDEO_CAPTURE', 'HTML_COLLECTION_FAILED_CONTINUING', {
          error: htmlError instanceof Error ? htmlError.message : String(htmlError),
        });
        this.htmlCollectionService = null;
      }

      // 6. Coletar metadados forenses
      debugLog('EXECUTE_STEP_6_COLLECT_FORENSIC_METADATA');
      this.captureLogger.info('VIDEO_CAPTURE', 'STEP_FORENSIC_COLLECT', {});
      this.emitirProgresso('INITIALIZING', 30, 'Coletando metadados forenses...');
      
      try {
        debugLog('EXECUTE_STEP_6_CALLING_COLETAR_METADADOS_FORENSES');
        await this.coletarMetadadosForenses();
        debugLog('EXECUTE_STEP_6_FORENSIC_METADATA_COLLECTED');
        this.captureLogger.info('VIDEO_CAPTURE', 'FORENSIC_COLLECTED', {});
      } catch (forensicError) {
        // Continuar mesmo se forense falhar - não é crítico para vídeo
        debugError('EXECUTE_STEP_6_FORENSIC_COLLECTION_FAILED', forensicError);
        this.captureLogger.warn('VIDEO_CAPTURE', 'FORENSIC_COLLECTION_FAILED_CONTINUING', {
          error: forensicError instanceof Error ? forensicError.message : String(forensicError),
        });
      }

      // 7. Configurar listener de mensagens ANTES de iniciar
      debugLog('EXECUTE_STEP_7_SETUP_MESSAGE_LISTENER');
      this.captureLogger.info('VIDEO_CAPTURE', 'STEP_LISTENER_SETUP', {});
      this.setupMessageListener();
      debugLog('EXECUTE_STEP_7_LISTENER_CONFIGURED');
      this.captureLogger.info('VIDEO_CAPTURE', 'LISTENER_CONFIGURED', {});

      // Registrar duração da inicialização
      const initDurationMs = stopInitTimer();
      debugLog('EXECUTE_INITIALIZATION_COMPLETE', { durationMs: initDurationMs });
      this.captureLogger.info('VIDEO_CAPTURE', 'INITIALIZATION_COMPLETE', {
        durationMs: initDurationMs,
      });

      // 8. Iniciar Gravação - Transição de fase
      debugLog('EXECUTE_STEP_8_START_RECORDING');
      this.captureLogger = this.captureLogger.withContext({ phase: 'CAPTURING' });
      this.captureLogger.info('VIDEO_CAPTURE', 'PHASE_TRANSITION', { 
        from: 'INITIALIZING', 
        to: 'CAPTURING' 
      });
      
      this.emitirProgresso('CAPTURING', 0, 'Iniciando gravação...');
      
      debugLog('EXECUTE_STEP_8_SENDING_START_RECORDING_MESSAGE', {
        hasStreamId: !!this.streamId,
        streamIdPrefix: this.streamId?.substring(0, 20),
        mimeType: 'video/webm;codecs=vp9',
        timeslice: TIMESLICE_MS,
      });
      const recordingConfig = this.streamId
        ? { streamId: this.streamId, mimeType: 'video/webm;codecs=vp9', timeslice: TIMESLICE_MS }
        : { useDisplayMedia: true, mimeType: 'video/webm;codecs=vp9', timeslice: TIMESLICE_MS };
      const response = await this.enviarMensagemOffscreen('start-recording', recordingConfig);
      debugLog('EXECUTE_STEP_8_START_RECORDING_RESPONSE', { response });

      if (!response?.success) {
        debugError('EXECUTE_STEP_8_START_RECORDING_FAILED', new Error(response?.error ?? 'Falha ao iniciar gravador offscreen'));
        throw new Error(response?.error ?? 'Falha ao iniciar gravador offscreen');
      }

      this.startTime = Date.now();
      this.emitirProgresso('CAPTURING', 0, 'Gravando...');
      debugLog('EXECUTE_STEP_8_RECORDING_STARTED', {
        startTime: this.startTime,
        url: this.pageUrl,
      });
      
      this.captureLogger.info('VIDEO_CAPTURE', 'RECORDING_STARTED', {
        url: this.pageUrl,
        timesliceMs: TIMESLICE_MS,
      });

      // A execução "suspende" aqui, aguardando o método stop() ser chamado
      debugLog('EXECUTE_RETURNING_PROMISE_WAITING_FOR_STOP');
      return new Promise<CaptureResult>((resolve, reject) => {
        this.stopResolve = resolve;
        this.stopReject = reject;
        debugLog('EXECUTE_PROMISE_CREATED_WAITING_FOR_STOP');

        // Configurar timeout máximo (30 minutos)
        setTimeout(() => {
          if (this.isCapturing()) {
            debugLog('EXECUTE_MAX_DURATION_TIMEOUT_REACHED', { durationMs: MAX_DURATION_MS });
            this.captureLogger?.warn('VIDEO_CAPTURE', 'MAX_DURATION_REACHED', {
              durationMs: MAX_DURATION_MS,
            });
            this.stop().catch((err) => {
              debugError('EXECUTE_AUTO_STOP_FAILED', err);
            });
          }
        }, MAX_DURATION_MS);
      });
    } catch (error) {
      debugError('EXECUTE_CATCH_ERROR', error);
      this.cleanup();
      const msg = error instanceof Error ? error.message : 'Erro desconhecido';
      const stack = error instanceof Error ? error.stack : undefined;
      
      this.captureLogger?.error('VIDEO_CAPTURE', 'CAPTURE_FAILED', {
        error: msg,
        stack,
      });
      this.emitirProgresso('CAPTURE_FAILED', 0, `Falha: ${msg}`);
      throw error;
    }
  }

  /**
   * Para a gravação e finaliza a captura
   */
  async stop(): Promise<void> {
    debugLog('STOP_CALLED', {
      isCapturing: this.isCapturing(),
      chunksCount: this.chunks.length,
      totalSize: this.totalSize,
    });

    if (!this.isCapturing()) {
      debugLog('STOP_IGNORED_NOT_CAPTURING');
      return;
    }

    // Transição de fase para FINALIZING
    debugLog('STOP_TRANSITIONING_TO_FINALIZING');
    this.captureLogger = this.captureLogger?.withContext({ phase: 'FINALIZING' }) ?? null;
    this.captureLogger?.info('VIDEO_CAPTURE', 'PHASE_TRANSITION', { 
      from: 'CAPTURING', 
      to: 'FINALIZING' 
    });

    this.captureLogger?.info('VIDEO_CAPTURE', 'STOP_REQUESTED', {
      chunksCount: this.chunks.length,
      totalSize: this.totalSize,
      durationMs: Date.now() - this.startTime,
    });

    this.emitirProgresso('CAPTURING', 90, 'Finalizando gravação...');
    debugLog('STOP_EMITTED_PROGRESS_90');

    try {
      debugLog('STOP_SENDING_STOP_RECORDING_MESSAGE');
      await this.enviarMensagemOffscreen('stop-recording');
      debugLog('STOP_STOP_RECORDING_MESSAGE_SENT');
      
      debugLog('STOP_CALLING_FINALIZAR_PROCESSAMENTO');
      await this.finalizarProcessamento();
      debugLog('STOP_FINALIZAR_PROCESSAMENTO_COMPLETE');
    } catch (error) {
      debugError('STOP_ERROR', error);
      this.captureLogger?.error('VIDEO_CAPTURE', 'STOP_ERROR', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      if (this.stopReject) {
        this.stopReject(error);
      }
    }
  }

  /**
   * Cancela a captura
   */
  override async cancel(): Promise<void> {
    debugLog('CANCEL_CALLED', {
      isCapturing: this.isCapturing(),
      chunksCount: this.chunks.length,
      totalSize: this.totalSize,
    });

    if (!this.isCapturing()) {
      debugLog('CANCEL_IGNORED_NOT_CAPTURING');
      return;
    }

    this.captureLogger?.info('VIDEO_CAPTURE', 'CAPTURE_CANCELLED', {
      chunksCount: this.chunks.length,
      totalSize: this.totalSize,
    });

    try {
      debugLog('CANCEL_SENDING_CANCEL_RECORDING_MESSAGE');
      await this.enviarMensagemOffscreen('cancel-recording');
      debugLog('CANCEL_CANCEL_RECORDING_MESSAGE_SENT');
    } catch (e) {
      debugError('CANCEL_OFFSCREEN_ERROR', e);
      this.captureLogger?.warn('VIDEO_CAPTURE', 'CANCEL_OFFSCREEN_ERROR', {
        error: e instanceof Error ? e.message : 'Erro desconhecido',
      });
    }

    debugLog('CANCEL_CANCELLING_HTML_COLLECTION');
    this.htmlCollectionService?.cancel();
    debugLog('CANCEL_CALLING_CLEANUP');
    this.cleanup();
    debugLog('CANCEL_CALLING_SUPER_CANCEL');
    super.cancel();
    debugLog('CANCEL_COMPLETE');
  }

  // ==========================================================================
  // Coleta de Metadados Forenses
  // ==========================================================================

  /**
   * Coleta metadados forenses completos usando ForensicCollector
   */
  private async coletarMetadadosForenses(): Promise<void> {
    const stopTimer = this.captureLogger?.startTimer('forensicCollection');
    this.captureLogger?.info('VIDEO_CAPTURE', 'FORENSIC_COLLECTION_START', {});
    
    if (!this.evidenceId) {
      this.captureLogger?.warn('VIDEO_CAPTURE', 'FORENSIC_COLLECTION_NO_EVIDENCE_ID', {});
      return;
    }

    this.captureLogger?.info('VIDEO_CAPTURE', 'FORENSIC_COLLECTOR_CREATING', {});
    
    try {
      this.forensicCollector = new ForensicCollector(this.logger);
      this.captureLogger?.info('VIDEO_CAPTURE', 'FORENSIC_COLLECTOR_CREATED', {});
    } catch (error) {
      this.captureLogger?.error('VIDEO_CAPTURE', 'FORENSIC_COLLECTOR_CREATE_FAILED', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }

    try {
      this.captureLogger?.info('VIDEO_CAPTURE', 'FORENSIC_COLLECT_CALLING', {
        captureId: this.evidenceId,
        url: this.pageUrl,
      });
      
      this.forensicMetadata = await this.forensicCollector.collect({
        captureId: this.evidenceId,
        url: this.pageUrl,
        title: this.pageTitle,
        viewport: { width: 0, height: 0 }, // Será atualizado
        pageSize: { width: 0, height: 0 },
        viewportsCaptured: 0,
      });
      
      const durationMs = stopTimer?.() ?? 0;
      this.captureLogger?.info('VIDEO_CAPTURE', 'FORENSIC_METADATA_COLLECTED', {
        durationMs,
        hasGeolocation: !!this.forensicMetadata.geolocation,
        hasNetwork: !!this.forensicMetadata.network,
        hasDns: !!this.forensicMetadata.dns,
        hasWhois: !!this.forensicMetadata.whois,
        hasSsl: !!this.forensicMetadata.sslCertificate,
      });
    } catch (error) {
      this.captureLogger?.warn('VIDEO_CAPTURE', 'FORENSIC_METADATA_PARTIAL', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
      // Continuar mesmo com erro parcial nos metadados
    }
    
    this.captureLogger?.info('VIDEO_CAPTURE', 'FORENSIC_COLLECTION_FINISHED', {});
  }

  // ==========================================================================
  // Processamento de Chunks
  // ==========================================================================

  private setupMessageListener(): void {
    debugLog('SETUP_MESSAGE_LISTENER_START');
    
    this.listener = (message: unknown) => {
      const msg = message as { target?: string; type?: string; data?: unknown; error?: string };

      // [DIAGNÓSTICO] Log de TODA mensagem recebida removido (CWS compliance)

      debugLog('MESSAGE_RECEIVED', {
        target: msg.target,
        type: msg.type,
        hasData: !!msg.data,
        hasError: !!msg.error,
      });

      // Aceitar mensagens do offscreen document (target: 'background')
      // ou mensagens internas (target: 'extension')
      // O offscreen envia chunks com target: 'background'
      if (msg.target !== 'extension' && msg.target !== 'background') {
        debugLog('MESSAGE_IGNORED_WRONG_TARGET', { target: msg.target });
        return;
      }

      // Aceitar tanto 'video-chunk' quanto 'chunk-ready' (enviado pelo offscreen)
      if (msg.type === 'video-chunk' || msg.type === 'chunk-ready') {
        debugLog('MESSAGE_VIDEO_CHUNK_RECEIVED', { dataType: typeof msg.data, type: msg.type });
        this.handleChunk(msg.data).catch((err) => {
          debugError('MESSAGE_VIDEO_CHUNK_HANDLE_ERROR', err);
        });
      }

      // Mensagem de gravação parada pelo offscreen
      if (msg.type === 'recording-stopped') {
        debugLog('MESSAGE_RECORDING_STOPPED_RECEIVED');
      }

      if (msg.type === 'recording-error') {
        debugError('MESSAGE_RECORDING_ERROR_RECEIVED', new Error(msg.error ?? 'Erro na gravação offscreen'));
        const error = new Error(msg.error ?? 'Erro na gravação offscreen');
        if (this.stopReject) {
          this.stopReject(error);
        }
        this.cleanup();
      }
    };

    chrome.runtime.onMessage.addListener(this.listener);
    debugLog('SETUP_MESSAGE_LISTENER_COMPLETE');
  }

  private async handleChunk(rawChunk: unknown): Promise<void> {
    debugLog('HANDLE_CHUNK_START', {
      isCapturing: this.isCapturing(),
      rawChunkType: typeof rawChunk,
    });

    if (!this.isCapturing()) {
      debugLog('HANDLE_CHUNK_IGNORED_NOT_CAPTURING');
      return;
    }

    const chunk = rawChunk as { chunk: number[] | string; index: number; timestamp: string };
    debugLog('HANDLE_CHUNK_PARSED', {
      index: chunk.index,
      timestamp: chunk.timestamp,
      chunkType: typeof chunk.chunk,
      isArray: Array.isArray(chunk.chunk),
    });
    
    const stopTimer = this.captureLogger?.startTimer('chunkProcessing');

    try {
      let chunkData: Uint8Array;
      if (Array.isArray(chunk.chunk)) {
        debugLog('HANDLE_CHUNK_CONVERTING_ARRAY', { length: chunk.chunk.length });
        chunkData = new Uint8Array(chunk.chunk);
      } else if (typeof chunk.chunk === 'string') {
        debugLog('HANDLE_CHUNK_CONVERTING_BASE64', { length: chunk.chunk.length });
        chunkData = this.base64ToUint8Array(chunk.chunk);
      } else {
        debugError('HANDLE_CHUNK_INVALID_FORMAT', new Error(`Invalid chunk format: ${typeof chunk.chunk}`));
        this.captureLogger?.error('VIDEO_CAPTURE', 'CHUNK_INVALID_FORMAT', {
          chunkIndex: chunk.index,
        });
        return;
      }

      debugLog('HANDLE_CHUNK_CALCULATING_HASH', { dataLength: chunkData.length });
      const hash = await calcularHashSHA256(chunkData.buffer as ArrayBuffer);
      debugLog('HANDLE_CHUNK_HASH_CALCULATED', { hash: hash.substring(0, 16) + '...' });

      this.chunks.push({
        index: chunk.index,
        data: chunkData,
        hash,
        timestamp: chunk.timestamp,
        size: chunkData.length,
      });

      this.totalSize += chunkData.length;

      debugLog('HANDLE_CHUNK_ADDED', {
        index: chunk.index,
        size: chunkData.length,
        totalChunks: this.chunks.length,
        totalSize: this.totalSize,
      });

      const durationMs = stopTimer?.() ?? 0;
      
      // Log de chunk processado (apenas a cada 10 chunks para não poluir)
      if (chunk.index % 10 === 0) {
        this.captureLogger?.info('VIDEO_CAPTURE', 'CHUNK_PROCESSED', {
          chunkIndex: chunk.index,
          chunkSize: chunkData.length,
          totalChunks: this.chunks.length,
          totalSize: this.totalSize,
          processingMs: durationMs,
        });
      }

      const recordingDurationMs = Date.now() - this.startTime;
      const durationFormatada = this.formatarDuracao(recordingDurationMs);
      const navigations = this.htmlCollectionService?.getNavigationCount() ?? 0;
      
      this.emitirProgresso(
        'CAPTURING',
        -1,
        `Gravando... ${durationFormatada} | ${this.chunks.length} chunks | ${navigations} navegações`
      );
      debugLog('HANDLE_CHUNK_COMPLETE', { index: chunk.index });
    } catch (error) {
      debugError('HANDLE_CHUNK_ERROR', error);
      this.captureLogger?.error('VIDEO_CAPTURE', 'CHUNK_PROCESS_ERROR', {
        chunkIndex: chunk.index,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  // ==========================================================================
  // Finalização
  // ==========================================================================

  private async finalizarProcessamento(): Promise<void> {
    debugLog('FINALIZAR_PROCESSAMENTO_START', {
      chunksCount: this.chunks.length,
      totalSize: this.totalSize,
    });
    
    const stopTimer = this.captureLogger?.startTimer('finalization');
    
    try {
      this.emitirProgresso('CAPTURING', 95, 'Coletando HTML final...');
      debugLog('FINALIZAR_PROCESSAMENTO_COLLECTING_FINAL_HTML');

      // 1. Parar coleta de HTML e obter todos os snapshots
      let htmlCollection: HtmlCollection | null = null;
      if (this.htmlCollectionService) {
        debugLog('FINALIZAR_PROCESSAMENTO_STOPPING_HTML_COLLECTION');
        htmlCollection = await this.htmlCollectionService.stopCollection();
        debugLog('FINALIZAR_PROCESSAMENTO_HTML_COLLECTION_STOPPED', {
          initialUrl: htmlCollection.initial.url,
          finalUrl: htmlCollection.final.url,
          navigationsCount: htmlCollection.navigations.length,
          totalSizeBytes: htmlCollection.totalSizeBytes,
        });
        
        this.captureLogger?.info('VIDEO_CAPTURE', 'HTML_COLLECTION_COMPLETE', {
          initialUrl: htmlCollection.initial.url,
          finalUrl: htmlCollection.final.url,
          navigationsCount: htmlCollection.navigations.length,
          totalSizeBytes: htmlCollection.totalSizeBytes,
        });
      } else {
        debugLog('FINALIZAR_PROCESSAMENTO_NO_HTML_COLLECTION_SERVICE');
      }

      this.emitirProgresso('CAPTURING', 98, 'Calculando hashes...');
      debugLog('FINALIZAR_PROCESSAMENTO_CREATING_FINAL_RESULT');

      // 2. Criar resultado final
      const result = await this.criarResultadoFinal(htmlCollection);
      debugLog('FINALIZAR_PROCESSAMENTO_RESULT_CREATED', {
        evidenceId: result.evidenceId,
        merkleRoot: result.merkleRoot,
        mediaSize: result.media.sizeBytes,
      });

      this.finalizarCaptura();
      debugLog('FINALIZAR_PROCESSAMENTO_FINALIZAR_CAPTURA_CALLED');

      const finalizationMs = stopTimer?.() ?? 0;
      
      // Transição de fase para COMPLETED
      this.captureLogger = this.captureLogger?.withContext({ phase: 'COMPLETED' }) ?? null;
      this.captureLogger?.info('VIDEO_CAPTURE', 'PHASE_TRANSITION', { 
        from: 'FINALIZING', 
        to: 'COMPLETED' 
      });

      this.captureLogger?.info('VIDEO_CAPTURE', 'CAPTURE_COMPLETE', {
        durationMs: result.timestamps.durationMs,
        finalizationMs,
        videoSizeBytes: result.media.sizeBytes,
        htmlTotalBytes: htmlCollection?.totalSizeBytes ?? 0,
        chunksCount: this.chunks.length,
        merkleRoot: result.merkleRoot,
      });

      debugLog('FINALIZAR_PROCESSAMENTO_RESOLVING_PROMISE');
      if (this.stopResolve) {
        this.stopResolve(result);
        this.stopResolve = null;
      }
      debugLog('FINALIZAR_PROCESSAMENTO_COMPLETE');
    } catch (error) {
      debugError('FINALIZAR_PROCESSAMENTO_ERROR', error);
      this.captureLogger?.error('VIDEO_CAPTURE', 'FINALIZATION_FAILED', {
        error: error instanceof Error ? error.message : 'Erro desconhecido',
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      if (this.stopReject) {
        this.stopReject(error);
        this.stopReject = null;
      }
    } finally {
      debugLog('FINALIZAR_PROCESSAMENTO_CLEANUP');
      this.cleanup();
    }
  }

  private async criarResultadoFinal(htmlCollection: HtmlCollection | null): Promise<CaptureResult> {
    debugLog('CRIAR_RESULTADO_FINAL_START', {
      hasHtmlCollection: !!htmlCollection,
      chunksCount: this.chunks.length,
    });

    // 1. Calcular Merkle Root dos chunks de vídeo
    debugLog('CRIAR_RESULTADO_FINAL_CALCULATING_VIDEO_MERKLE');
    const chunkHashes = this.chunks.map((c) => c.hash);
    const videoMerkleRoot =
      chunkHashes.length > 0
        ? await calcularMerkleRoot(chunkHashes)
        : await calcularHashSHA256('');
    debugLog('CRIAR_RESULTADO_FINAL_VIDEO_MERKLE_CALCULATED', {
      videoMerkleRoot: videoMerkleRoot.substring(0, 16) + '...',
    });

    // 2. Criar Blob do vídeo
    debugLog('CRIAR_RESULTADO_FINAL_CREATING_VIDEO_BLOB');
    const videoBlob = new Blob(
      this.chunks.map((c) => c.data as BlobPart),
      { type: 'video/webm;codecs=vp9' }
    );

    debugLog('CRIAR_RESULTADO_FINAL_VIDEO_BLOB_CREATED', {
      blobSize: videoBlob.size,
      blobType: videoBlob.type,
    });

    // 3. Preparar timestamps
    const endedAt = new Date().toISOString();
    const startedAtIso = new Date(this.startTime).toISOString();
    const durationMs = Date.now() - this.startTime;
    debugLog('CRIAR_RESULTADO_FINAL_TIMESTAMPS_PREPARED', {
      startedAt: startedAtIso,
      endedAt,
      durationMs,
    });

    // 4. Preparar metadados forenses completos
    debugLog('CRIAR_RESULTADO_FINAL_PREPARING_FORENSIC_METADATA');
    const captureId = this.evidenceId ?? '';
    const forensicMetadata: ForensicMetadata = {
      ...(this.forensicMetadata ?? {}),
      schemaVersion: '2.0.0',
      captureId,
      collectionTimestamp: startedAtIso,
      collectionDurationMs: durationMs,
      url: this.pageUrl,
      title: this.pageTitle,
      userAgent: navigator.userAgent,
      extensionVersion: chrome.runtime.getManifest().version,
      viewport: { width: 0, height: 0 },
      pageSize: { width: 0, height: 0 },
      viewportsCaptured: 0,
      hashes: {
        media: videoMerkleRoot,
        htmlCombined: htmlCollection?.combinedHash,
      },
      // Adicionar informações de navegação aos metadados
      videoCapture: {
        durationMs,
        chunksCount: this.chunks.length,
        navigationsCount: htmlCollection?.navigations.length ?? 0,
        startUrl: htmlCollection?.initial.url ?? this.pageUrl,
        endUrl: htmlCollection?.final.url ?? this.pageUrl,
      },
    } as ForensicMetadata;

    debugLog('CRIAR_RESULTADO_FINAL_CALCULATING_METADATA_HASH');
    const metadataJson = JSON.stringify(forensicMetadata);
    const metadataHash = await calcularHashSHA256(metadataJson);
    debugLog('CRIAR_RESULTADO_FINAL_METADATA_HASH_CALCULATED', {
      metadataHash: metadataHash.substring(0, 16) + '...',
    });

    // 5. Calcular Merkle Root final (vídeo + HTML + metadados)
    debugLog('CRIAR_RESULTADO_FINAL_CALCULATING_FINAL_MERKLE');
    const hashesParaMerkle = [videoMerkleRoot, metadataHash];
    if (htmlCollection?.combinedHash) {
      hashesParaMerkle.push(htmlCollection.combinedHash);
    }
    const finalMerkleRoot = await calcularMerkleRoot(hashesParaMerkle);
    debugLog('CRIAR_RESULTADO_FINAL_FINAL_MERKLE_CALCULATED', {
      finalMerkleRoot: finalMerkleRoot.substring(0, 16) + '...',
      hashesCount: hashesParaMerkle.length,
    });

    // 6. Preparar HTML para compatibilidade (usa HTML inicial)
    const htmlInitial = htmlCollection?.initial ?? {
      content: '',
      hash: '',
      sizeBytes: 0,
    };

    const evidenceId = this.evidenceId ?? '';
    
    debugLog('CRIAR_RESULTADO_FINAL_BUILDING_RESULT_OBJECT');
    const result: CaptureResult = {
      evidenceId,
      type: 'video',
      url: this.pageUrl,
      title: this.pageTitle,
      media: {
        blob: videoBlob,
        hash: videoMerkleRoot,
        mimeType: 'video/webm;codecs=vp9',
        sizeBytes: this.totalSize,
      },
      // Compatibilidade: HTML inicial
      html: {
        content: htmlInitial.content,
        hash: htmlInitial.hash,
        sizeBytes: htmlInitial.sizeBytes,
      },
      // Nova estrutura: coleção completa de HTMLs
      ...(htmlCollection && { htmlCollection }),
      forensicMetadata,
      metadataHash,
      merkleRoot: finalMerkleRoot,
      timestamps: {
        startedAt: startedAtIso,
        endedAt,
        durationMs,
      },
      videoData: {
        totalChunks: this.chunks.length,
        chunkHashes,
        durationSeconds: Math.round(durationMs / 1000),
        frameRate: 30,
      },
      isolation: {
        mode: this.config?.isolation ? 'full' : 'none',
        disabledExtensions: this.config?.isolation?.disabledExtensions ?? [],
        nonDisabledExtensions: this.config?.isolation?.nonDisabledExtensions ?? [],
        ...(this.config?.isolation?.snapshotHash && { snapshotHash: this.config.isolation.snapshotHash }),
      },
    };

    debugLog('CRIAR_RESULTADO_FINAL_COMPLETE', {
      evidenceId: result.evidenceId,
      merkleRoot: result.merkleRoot,
      mediaSize: result.media.sizeBytes,
    });

    return result;
  }

  // ==========================================================================
  // Helpers
  // ==========================================================================

  private cleanup(): void {
    debugLog('CLEANUP_START', {
      hasListener: !!this.listener,
      chunksCount: this.chunks.length,
      hasHtmlCollectionService: !!this.htmlCollectionService,
      hasForensicCollector: !!this.forensicCollector,
    });
    
    if (this.listener) {
      debugLog('CLEANUP_REMOVING_LISTENER');
      chrome.runtime.onMessage.removeListener(this.listener);
      this.listener = null;
    }
    this.chunks = [];
    this.htmlCollectionService = null;
    this.forensicCollector = null;
    this.forensicMetadata = null;
    this.captureLogger = null;
    this.finalizarCaptura();
    debugLog('CLEANUP_COMPLETE');
  }

  private async ensureOffscreenDocument(): Promise<void> {
    debugLog('ENSURE_OFFSCREEN_START');
    
    const existingContexts = await chrome.runtime.getContexts({});
    debugLog('ENSURE_OFFSCREEN_CONTEXTS_FETCHED', {
      contextsCount: existingContexts.length,
      contextTypes: existingContexts.map(c => c.contextType),
    });
    
    const offscreenExists = existingContexts.some(
      (c) => c.contextType === ('OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType)
    );

    if (offscreenExists) {
      debugLog('ENSURE_OFFSCREEN_ALREADY_EXISTS');
      return;
    }

    debugLog('ENSURE_OFFSCREEN_CREATING_DOCUMENT');
    await chrome.offscreen.createDocument({
      url: 'src/offscreen/offscreen.html',
      reasons: [chrome.offscreen.Reason.DISPLAY_MEDIA],
      justification: 'Gravação forense de vídeo via captura de tela',
    });
    debugLog('ENSURE_OFFSCREEN_DOCUMENT_CREATED');
  }

  private async enviarMensagemOffscreen(type: string, data?: unknown): Promise<OffscreenResponse> {
    debugLog('ENVIAR_MENSAGEM_OFFSCREEN_START', { type, hasData: !!data });
    
    const response = await chrome.runtime.sendMessage({
      type,
      target: 'offscreen',
      data,
    }) as OffscreenResponse;
    
    debugLog('ENVIAR_MENSAGEM_OFFSCREEN_RESPONSE', { 
      type, 
      success: response?.success, 
      error: response?.error 
    });
    
    return response;
  }

  private async obterStreamId(tabId: number): Promise<string> {
    debugLog('OBTER_STREAM_ID_START', { tabId });
    
    return new Promise((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
        if (chrome.runtime.lastError) {
          debugError('OBTER_STREAM_ID_CHROME_ERROR', chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else if (!streamId) {
          debugError('OBTER_STREAM_ID_NO_STREAM', new Error('Falha ao obter stream ID'));
          reject(new Error('Falha ao obter stream ID'));
        } else {
          debugLog('OBTER_STREAM_ID_SUCCESS', { streamIdPrefix: streamId.substring(0, 20) });
          resolve(streamId);
        }
      });
    });
  }

  private emitirProgresso(status: EvidenceStatus, percent: number, message: string): void {
    debugLog('EMITIR_PROGRESSO', { status, percent, message, hasCallback: !!this.onProgress });
    
    if (this.onProgress && this.evidenceId) {
      this.onProgress({
        evidenceId: this.evidenceId,
        status,
        phase: 1,
        phaseName: 'capture',
        percent,
        message,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    debugLog('BASE64_TO_UINT8ARRAY_START', { inputLength: base64.length });
    
    const binaryString = atob(base64.split(',')[1] ?? base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    debugLog('BASE64_TO_UINT8ARRAY_COMPLETE', { outputLength: bytes.length });
    return bytes;
  }

  private formatarDuracao(ms: number): string {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }
}

export default VideoStrategy;
