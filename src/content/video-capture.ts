/**
 * VideoCapture - Captura de vídeo da aba ativa
 *
 * Implementa gravação de vídeo do viewport da aba ativa.
 * Ativa lockdown antes de iniciar, permite scroll e cliques com botão esquerdo,
 * tem duração máxima de 30 minutos e gera vídeo WebM com hash SHA-256.
 *
 * @module VideoCapture
 * @see Requirements 7.1-7.10
 */

import { AuditLogger } from '../lib/audit-logger';
import { CryptoUtils } from '../lib/crypto-utils-native';
import { LockdownSecurityManager } from './lockdown-manager';
import type {
  VideoCaptureResult,
  VideoCaptureConfig,
  VideoCaptureProgress,
  VideoProgressCallback,
  VideoAutoFinalizeCallback,
  VideoMetadata,
  VideoRecordingState,
  VideoStartOptions,
  CaptureMetadata,
} from '../types/capture.types';

// ============================================================================
// Constantes
// ============================================================================

/**
 * Duração máxima de gravação: 30 minutos em ms
 * Requirement 7.4
 */
const MAX_DURATION_MS = 30 * 60 * 1000; // 30 minutos

/**
 * Intervalo de atualização do timer em ms
 */
const TIMER_UPDATE_INTERVAL_MS = 1000;

/**
 * Avisos de tempo restante
 */
const TIME_WARNINGS = {
  FIVE_MIN: 5 * 60 * 1000,
  ONE_MIN: 60 * 1000,
  THIRTY_SEC: 30 * 1000,
};


/**
 * Configuração padrão da captura de vídeo
 */
const DEFAULT_CONFIG: VideoCaptureConfig = {
  maxDurationMs: MAX_DURATION_MS, // 30 minutos (Requirement 7.4)
  format: 'webm', // Formato WebM (Requirement 7.5)
  videoCodec: 'video/webm;codecs=vp9',
  videoBitrate: 2500000, // 2.5 Mbps
  frameRate: 30,
  hashTimeout: 5000, // 5 segundos para hash
  collectHtml: true, // Coletar HTML (Requirement 7.9)
  collectMetadata: true,
};

// ============================================================================
// VideoCapture
// ============================================================================

/**
 * VideoCapture - Gerencia gravação de vídeo da aba ativa
 *
 * Fluxo de gravação:
 * 1. Ativar lockdown (Requirement 7.1)
 * 2. Capturar área visível da aba (Requirement 7.2)
 * 3. Permitir scroll e cliques com botão esquerdo (Requirement 7.3)
 * 4. Gravar até 30 minutos (Requirement 7.4)
 * 5. Salvar em formato WebM (Requirement 7.5)
 * 6. Exibir timer e controles (Requirement 7.7)
 * 7. Calcular hash SHA-256 (Requirement 7.8)
 * 8. Coletar HTML no início e fim (Requirement 7.9)
 * 9. Finalizar automaticamente aos 30 min (Requirement 7.10)
 *
 * @example
 * ```typescript
 * const logger = new AuditLogger();
 * const videoCapture = new VideoCapture(logger);
 *
 * // Iniciar gravação
 * await videoCapture.start({
 *   onProgress: (progress) => console.log(progress.message),
 *   onAutoFinalize: (reason) => console.log('Finalizado:', reason),
 * });
 *
 * // Parar gravação
 * const result = await videoCapture.stop();
 * if (result.success) {
 *   console.log('Vídeo gravado:', result.videoHash);
 * }
 * ```
 */
export class VideoCapture {
  private logger: AuditLogger;
  private config: VideoCaptureConfig;
  private lockdownManager: LockdownSecurityManager | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private recordedChunks: Blob[] = [];
  private state: VideoRecordingState = 'idle';
  private startTime = 0;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private progressCallback: VideoProgressCallback | null = null;
  private autoFinalizeCallback: VideoAutoFinalizeCallback | null = null;
  private htmlContentStart: string | null = null;
  private lastWarning: '5min' | '1min' | '30sec' | null = null;
  private devToolsViolationDetected = false;


  /**
   * Cria nova instância do VideoCapture
   *
   * @param logger - Instância do AuditLogger para registro de eventos
   * @param config - Configuração customizada (opcional)
   */
  constructor(logger: AuditLogger, config?: Partial<VideoCaptureConfig>) {
    this.logger = logger;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Obtém estado atual da gravação
   */
  getState(): VideoRecordingState {
    return this.state;
  }

  /**
   * Verifica se está gravando
   */
  isRecording(): boolean {
    return this.state === 'recording';
  }

  /**
   * Obtém configuração atual
   */
  getConfig(): VideoCaptureConfig {
    return { ...this.config };
  }

  /**
   * Obtém tempo decorrido em ms
   * 
   * NOTA: Cálculo simplificado sem ajustes de pausa.
   * A remoção de pause/resume garante integridade temporal da evidência.
   */
  getElapsedTime(): number {
    if (this.state === 'idle' || this.startTime === 0) {
      return 0;
    }

    return Date.now() - this.startTime;
  }

  /**
   * Obtém tempo restante em ms
   */
  getRemainingTime(): number {
    const elapsed = this.getElapsedTime();
    return Math.max(0, this.config.maxDurationMs - elapsed);
  }


  /**
   * Inicia gravação de vídeo
   * Requirements 7.1, 7.2, 7.3
   *
   * @param options - Opções de gravação
   * @returns Promise que resolve quando gravação iniciar
   */
  async start(options?: VideoStartOptions): Promise<{ success: boolean; error?: string }> {
    if (this.state !== 'idle') {
      return {
        success: false,
        error: 'Gravação já em andamento ou não finalizada',
      };
    }

    this.progressCallback = options?.onProgress ?? null;
    this.autoFinalizeCallback = options?.onAutoFinalize ?? null;

    this.logger.info('CAPTURE', 'VIDEO_START', {
      url: window.location.href,
      config: this.config,
    });

    try {
      // Etapa 1: Ativar lockdown (Requirement 7.1)
      this.reportProgress('idle', 'Ativando modo lockdown...');
      const lockdownResult = await this.activateLockdown();
      if (!lockdownResult.success) {
        throw new Error(`Falha ao ativar lockdown: ${lockdownResult.error}`);
      }

      // Etapa 2: Coletar HTML inicial (Requirement 7.9)
      if (this.config.collectHtml) {
        this.htmlContentStart = this.collectHtml();
      }

      // Etapa 3: Obter stream de mídia (Requirement 7.2)
      this.reportProgress('idle', 'Iniciando captura de tela...');
      
      // Usar stream fornecido (para testes) ou solicitar ao service worker
      if (options?.mediaStream) {
        this.mediaStream = options.mediaStream;
      } else {
        this.mediaStream = await this.requestMediaStream();
      }

      // Etapa 4: Configurar MediaRecorder (Requirement 7.5)
      this.setupMediaRecorder();

      // Etapa 5: Iniciar gravação
      if (this.mediaRecorder) {
        this.mediaRecorder.start(1000); // Chunk a cada 1 segundo
      }
      this.state = 'recording';
      this.startTime = Date.now();
      this.recordedChunks = [];
      this.lastWarning = null;

      // Etapa 6: Iniciar timer (Requirement 7.7)
      this.startTimer();

      this.logger.info('CAPTURE', 'VIDEO_RECORDING_STARTED', {
        startTime: new Date(this.startTime).toISOString(),
        maxDurationMs: this.config.maxDurationMs,
      });

      this.reportProgress('recording', 'Gravação em andamento...');

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.error('CAPTURE', 'VIDEO_START_FAILED', { error: errorMessage });
      
      // Limpar recursos em caso de erro
      this.cleanup();
      
      return { success: false, error: errorMessage };
    }
  }


  /**
   * Para gravação e retorna resultado
   * Requirements 7.7, 7.8, 7.9
   *
   * @returns Resultado da captura com vídeo e hashes
   */
  async stop(): Promise<VideoCaptureResult> {
    if (this.state !== 'recording') {
      return {
        success: false,
        error: 'Nenhuma gravação em andamento',
      };
    }

    this.state = 'stopping';
    this.reportProgress('stopping', 'Finalizando gravação...');

    this.logger.info('CAPTURE', 'VIDEO_STOPPING', {
      elapsedMs: this.getElapsedTime(),
    });

    try {
      // Parar timer
      this.stopTimer();

      // Parar MediaRecorder e aguardar chunks finais
      const videoBlob = await this.stopMediaRecorder();

      // Coletar HTML final (Requirement 7.9)
      let htmlContentEnd: string | undefined;
      let htmlHashEnd: string | undefined;
      if (this.config.collectHtml) {
        htmlContentEnd = this.collectHtml();
        htmlHashEnd = await this.calculateHash(htmlContentEnd);
      }

      // Calcular hash do HTML inicial
      let htmlHashStart: string | undefined;
      if (this.htmlContentStart) {
        htmlHashStart = await this.calculateHash(this.htmlContentStart);
      }

      // Calcular hash do vídeo (Requirement 7.8)
      const videoData = await this.blobToBase64(videoBlob);
      const videoHash = await this.calculateHash(videoData);

      // Coletar metadados
      const durationMs = this.getElapsedTime();
      let metadata: VideoMetadata | undefined;
      let metadataHash: string | undefined;
      if (this.config.collectMetadata) {
        metadata = this.collectMetadata(videoBlob.size, durationMs, false);
        metadataHash = await this.calculateHash(metadata);
      }

      // Desativar lockdown
      this.deactivateLockdown();

      this.state = 'stopped';

      this.logger.info('CAPTURE', 'VIDEO_COMPLETE', {
        durationMs,
        fileSizeBytes: videoBlob.size,
        videoHash,
      });

      // Construir resultado
      const result: VideoCaptureResult = {
        success: true,
        videoBlob,
        videoData,
        videoHash,
        durationMs,
        autoFinalized: false,
      };

      // CRÍTICO: Marcar se houve violação de segurança
      if (this.devToolsViolationDetected) {
        result.integrityCompromised = true;
        result.integrityCompromiseReason = 'devtools_detected';
      }

      if (this.htmlContentStart) {
        result.htmlContentStart = this.htmlContentStart;
      }
      if (htmlHashStart) {
        result.htmlHashStart = htmlHashStart;
      }
      if (htmlContentEnd) {
        result.htmlContentEnd = htmlContentEnd;
      }
      if (htmlHashEnd) {
        result.htmlHashEnd = htmlHashEnd;
      }
      if (metadata) {
        result.metadata = metadata;
      }
      if (metadataHash) {
        result.metadataHash = metadataHash;
      }

      // Limpar recursos
      this.cleanup();

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      this.logger.error('CAPTURE', 'VIDEO_STOP_FAILED', { error: errorMessage });
      
      this.cleanup();
      
      return {
        success: false,
        error: errorMessage,
        durationMs: this.getElapsedTime(),
      };
    }
  }


  /**
   * Cancela gravação sem salvar
   */
  cancel(): void {
    if (this.state === 'idle' || this.state === 'stopped') {
      return;
    }

    this.logger.info('CAPTURE', 'VIDEO_CANCELLED', {
      elapsedMs: this.getElapsedTime(),
    });

    this.cleanup();
    this.state = 'idle';
  }

  // NOTA: Métodos pause() e resume() foram removidos como parte do redesign.
  // A remoção de pause/resume garante integridade temporal da evidência.
   (Requirements 5.1, 5.2)


  // ==========================================================================
  // Métodos de Lockdown
  // ==========================================================================

  /**
   * Ativa modo lockdown antes da gravação
   * Requirement 7.1
   *
   * CRÍTICO: Configura callback para parar gravação se DevTools for detectado
   */
  private async activateLockdown(): Promise<{ success: boolean; error?: string }> {
    try {
      this.lockdownManager = new LockdownSecurityManager(this.logger);

      // CRÍTICO: Configurar callback para parar gravação quando DevTools é detectado
      this.lockdownManager.onDevToolsDetected(() => {
        this.handleDevToolsDetected();
      });

      const result = await this.lockdownManager.activate();

      if (!result.success) {
        const failResult: { success: boolean; error?: string } = { success: false };
        if (result.error) {
          failResult.error = result.error;
        }
        return failResult;
      }

      this.logger.info('CAPTURE', 'VIDEO_LOCKDOWN_ACTIVATED', {
        protections: result.protections,
      });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Manipula detecção de DevTools durante gravação
   *
   * CRÍTICO: Para a gravação imediatamente para preservar integridade forense.
   * A evidência será marcada como COMPROMETIDA no audit log.
   *
   * Requirement 7.11 (segurança durante gravação)
   */
  private handleDevToolsDetected(): void {
    // Evitar múltiplas chamadas
    if (this.devToolsViolationDetected) {
      return;
    }

    this.devToolsViolationDetected = true;

    this.logger.critical('CAPTURE', 'DEVTOOLS_DETECTED_DURING_RECORDING', {
      elapsedMs: this.getElapsedTime(),
      state: this.state,
      action: 'STOPPING_RECORDING',
      integrityCompromised: true,
    });

    // Notificar callback de auto-finalização com motivo de segurança
    if (this.autoFinalizeCallback) {
      this.autoFinalizeCallback('security_violation');
    }

    // Notificar Service Worker sobre violação de segurança
    this.notifySecurityViolationToSidePanel();

    // Parar gravação automaticamente
    // Usar setTimeout para permitir que os logs sejam registrados primeiro
    setTimeout(() => {
      this.stop().catch((error) => {
        this.logger.error('CAPTURE', 'DEVTOOLS_STOP_FAILED', {
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      });
    }, 100);
  }

  /**
   * Envia notificação de violação de segurança para o Service Worker
   *
   * Notifica o usuário via Side Panel que a gravação foi interrompida
   * por motivos de segurança (DevTools detectado).
   */
  private notifySecurityViolationToSidePanel(): void {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'SECURITY_VIOLATION_NOTIFICATION',
        payload: {
          reason: 'devtools_detected',
          elapsedMs: this.getElapsedTime(),
          message: 'Gravação interrompida: DevTools detectado. A integridade da evidência foi comprometida.',
          severity: 'critical',
        },
      }).catch(() => {
        // Ignora erros de comunicação
        this.logger.warn('CAPTURE', 'SECURITY_VIOLATION_NOTIFICATION_FAILED', {
          message: 'Falha ao notificar Service Worker sobre violação de segurança',
        });
      });
    }
  }

  /**
   * Desativa lockdown após gravação
   */
  private deactivateLockdown(): void {
    if (this.lockdownManager) {
      const result = this.lockdownManager.deactivate();
      this.logger.info('CAPTURE', 'VIDEO_LOCKDOWN_DEACTIVATED', {
        violations: result.totalViolations,
      });
      this.lockdownManager = null;
    }
  }

  // ==========================================================================
  // Métodos de MediaRecorder
  // ==========================================================================

  /**
   * Solicita stream de mídia ao service worker
   * Requirement 7.2
   */
  private async requestMediaStream(): Promise<MediaStream> {
    return new Promise((resolve, reject) => {
      // Verificar se estamos em ambiente de extensão
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime.sendMessage(
          {
            type: 'REQUEST_TAB_CAPTURE',
            options: {
              video: true,
              audio: false,
              videoConstraints: {
                mandatory: {
                  chromeMediaSource: 'tab',
                  maxFrameRate: this.config.frameRate,
                },
              },
            },
          },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
              return;
            }
            if (response?.success && response?.streamId) {
              // Obter stream a partir do streamId
              navigator.mediaDevices
                .getUserMedia({
                  video: {
                    // @ts-expect-error - chromeMediaSource é específico do Chrome
                    mandatory: {
                      chromeMediaSource: 'tab',
                      chromeMediaSourceId: response.streamId,
                    },
                  },
                  audio: false,
                })
                .then(resolve)
                .catch(reject);
            } else {
              reject(new Error(response?.error ?? 'Falha ao obter stream de captura'));
            }
          }
        );
      } else {
        // Fallback para ambiente de teste - criar stream mock
        reject(new Error('Captura de tela não disponível neste ambiente'));
      }
    });
  }


  /**
   * Configura MediaRecorder para gravação
   * Requirement 7.5
   */
  private setupMediaRecorder(): void {
    if (!this.mediaStream) {
      throw new Error('Stream de mídia não disponível');
    }

    // Verificar suporte ao codec
    const mimeType = this.getSupportedMimeType();

    this.mediaRecorder = new MediaRecorder(this.mediaStream, {
      mimeType,
      videoBitsPerSecond: this.config.videoBitrate,
    });

    // Handler para dados disponíveis
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    };

    // Handler para erros
    this.mediaRecorder.onerror = (event) => {
      this.logger.error('CAPTURE', 'MEDIARECORDER_ERROR', {
        error: (event as ErrorEvent).message ?? 'Erro desconhecido',
      });
    };

    this.logger.info('CAPTURE', 'MEDIARECORDER_CONFIGURED', {
      mimeType,
      videoBitrate: this.config.videoBitrate,
    });
  }

  /**
   * Obtém MIME type suportado pelo navegador
   */
  private getSupportedMimeType(): string {
    const mimeTypes = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];

    for (const mimeType of mimeTypes) {
      if (MediaRecorder.isTypeSupported(mimeType)) {
        return mimeType;
      }
    }

    // Fallback para webm básico
    return 'video/webm';
  }

  /**
   * Para MediaRecorder e retorna blob do vídeo
   */
  private stopMediaRecorder(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) {
        reject(new Error('MediaRecorder não inicializado'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        resolve(blob);
      };

      // Parar gravação se ainda estiver ativa
      if (this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
      } else {
        // Já está parado, criar blob diretamente
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        resolve(blob);
      }

      // Parar tracks do stream
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((track) => track.stop());
      }
    });
  }


  // ==========================================================================
  // Métodos de Timer
  // ==========================================================================

  /**
   * Inicia timer de atualização
   * Requirement 7.7
   */
  private startTimer(): void {
    this.timerInterval = setInterval(() => {
      this.onTimerTick();
    }, TIMER_UPDATE_INTERVAL_MS);
  }

  /**
   * Para timer de atualização
   */
  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  /**
   * Callback do timer - verifica limite e atualiza progresso
   * Requirement 7.10
   */
  private onTimerTick(): void {
    if (this.state !== 'recording') {
      return;
    }

    const elapsed = this.getElapsedTime();
    const remaining = this.getRemainingTime();

    // Verificar avisos de tempo
    this.checkTimeWarnings(remaining);

    // Verificar limite máximo (Requirement 7.10)
    if (elapsed >= this.config.maxDurationMs) {
      this.logger.warn('CAPTURE', 'VIDEO_MAX_DURATION_REACHED', {
        elapsedMs: elapsed,
        maxDurationMs: this.config.maxDurationMs,
      });

      // Finalizar automaticamente
      this.autoFinalize();
      return;
    }

    // Atualizar progresso
    this.reportProgress('recording', this.formatTimeMessage(elapsed, remaining));
  }

  /**
   * Verifica e emite avisos de tempo restante
   */
  private checkTimeWarnings(remaining: number): void {
    let warning: '5min' | '1min' | '30sec' | null = null;

    if (remaining <= TIME_WARNINGS.THIRTY_SEC && this.lastWarning !== '30sec') {
      warning = '30sec';
    } else if (remaining <= TIME_WARNINGS.ONE_MIN && this.lastWarning !== '1min' && this.lastWarning !== '30sec') {
      warning = '1min';
    } else if (remaining <= TIME_WARNINGS.FIVE_MIN && !this.lastWarning) {
      warning = '5min';
    }

    if (warning) {
      this.lastWarning = warning;
      this.logger.warn('CAPTURE', 'VIDEO_TIME_WARNING', {
        warning,
        remainingMs: remaining,
      });
    }
  }

  /**
   * Finaliza gravação automaticamente ao atingir limite
   * Requirements 7.10, 9.4, 9.5
   *
   * Quando o tempo máximo de gravação (30 minutos) é atingido:
   * - Para a gravação automaticamente (Requirement 9.4)
   * - Notifica o usuário via Side Panel (Requirement 9.5)
   */
  private async autoFinalize(): Promise<void> {
    this.logger.info('CAPTURE', 'VIDEO_AUTO_FINALIZE', {
      reason: 'max_duration',
    });

    // Notificar callback
    if (this.autoFinalizeCallback) {
      this.autoFinalizeCallback('max_duration');
    }

    // Notificar Service Worker para exibir alerta no Side Panel (Requirement 9.5)
    this.notifyAutoFinalizationToSidePanel();

    // Parar gravação
    await this.stop();
  }

  /**
   * Envia notificação de auto-finalização para o Service Worker
   *
   * O Service Worker irá usar o RecordingStateManager para adicionar
   * um alerta informativo ao Side Panel.
   *
   * Requirement 9.5: Notificar usuário via Side Panel
   */
  private notifyAutoFinalizationToSidePanel(): void {
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage({
        type: 'AUTO_FINALIZATION_NOTIFICATION',
        payload: {
          reason: 'max_duration',
          elapsedMs: this.getElapsedTime(),
          maxDurationMs: this.config.maxDurationMs,
        },
      }).catch(() => {
        // Ignora erros de comunicação (Service Worker pode não estar disponível)
        this.logger.warn('CAPTURE', 'AUTO_FINALIZE_NOTIFICATION_FAILED', {
          message: 'Falha ao notificar Service Worker sobre auto-finalização',
        });
      });
    }
  }

  /**
   * Formata mensagem de tempo para exibição
   */
  private formatTimeMessage(elapsed: number, remaining: number): string {
    const elapsedStr = this.formatTime(elapsed);
    const remainingStr = this.formatTime(remaining);
    return `Gravando: ${elapsedStr} (restam ${remainingStr})`;
  }

  /**
   * Formata tempo em ms para string MM:SS
   */
  private formatTime(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }


  // ==========================================================================
  // Métodos de Coleta
  // ==========================================================================

  /**
   * Coleta HTML da página
   * Requirement 7.9
   */
  collectHtml(): string {
    return document.documentElement.outerHTML;
  }

  /**
   * Coleta metadados da captura de vídeo
   */
  collectMetadata(fileSizeBytes: number, durationMs: number, autoFinalized: boolean): VideoMetadata {
    const extensionVersion = this.getExtensionVersion();
    const now = new Date();

    const baseMetadata: CaptureMetadata = {
      url: window.location.href,
      title: document.title,
      timestamp: now.toISOString(),
      userAgent: navigator.userAgent,
      extensionVersion,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      pageSize: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
      viewportsCaptured: 1,
    };

    return {
      ...baseMetadata,
      recordingDurationMs: durationMs,
      videoFormat: 'webm',
      videoCodec: this.getSupportedMimeType(),
      videoBitrate: this.config.videoBitrate,
      frameRate: this.config.frameRate,
      fileSizeBytes,
      autoFinalized,
      startTimestamp: new Date(this.startTime).toISOString(),
      endTimestamp: now.toISOString(),
    };
  }

  /**
   * Obtém versão da extensão
   */
  private getExtensionVersion(): string {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
      return chrome.runtime.getManifest().version;
    }
    return '0.0.0';
  }

  // ==========================================================================
  // Métodos de Hash
  // ==========================================================================

  /**
   * Calcula hash SHA-256 com timeout
   */
  private async calculateHash(data: string | object): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout ao calcular hash'));
      }, this.config.hashTimeout);

      CryptoUtils.hash(data)
        .then((hash) => {
          clearTimeout(timeout);
          resolve(hash);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Converte Blob para Base64
   */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // Remover prefixo data:video/webm;base64,
        const base64 = result.split(',')[1] ?? result;
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Falha ao converter blob para base64'));
      reader.readAsDataURL(blob);
    });
  }


  // ==========================================================================
  // Métodos de Progresso
  // ==========================================================================

  /**
   * Reporta progresso da gravação
   */
  private reportProgress(state: VideoRecordingState, message: string): void {
    if (!this.progressCallback) {
      return;
    }

    const elapsed = this.getElapsedTime();
    const remaining = this.getRemainingTime();
    const percent = Math.min(100, Math.floor((elapsed / this.config.maxDurationMs) * 100));

    const progress: VideoCaptureProgress = {
      state,
      elapsedMs: elapsed,
      remainingMs: remaining,
      percent,
      message,
    };

    if (this.lastWarning) {
      progress.timeWarning = this.lastWarning;
    }

    this.progressCallback(progress);
  }

  // ==========================================================================
  // Métodos de Limpeza
  // ==========================================================================

  /**
   * Limpa todos os recursos
   */
  private cleanup(): void {
    // Parar timer
    this.stopTimer();

    // Parar MediaRecorder
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch {
        // Ignorar erros ao parar
      }
    }
    this.mediaRecorder = null;

    // Parar stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    // Desativar lockdown
    this.deactivateLockdown();

    // Limpar chunks
    this.recordedChunks = [];

    // Resetar estado
    this.startTime = 0;
    this.htmlContentStart = null;
    this.lastWarning = null;
    this.progressCallback = null;
    this.autoFinalizeCallback = null;
    this.devToolsViolationDetected = false;

    this.logger.info('CAPTURE', 'VIDEO_CLEANUP_COMPLETE', {});
  }

  /**
   * Limpa recursos e reseta estado para idle
   */
  reset(): void {
    this.cleanup();
    this.state = 'idle';
  }
}

export default VideoCapture;
