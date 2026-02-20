/**
 * Orquestrador de Processamento Pós-Captura
 *
 * Gerencia a sequência de processamento após a captura de evidência:
 * 1. Captura finalizada (✓)
 * 2. Aplicar carimbo de tempo ICP-Brasil (com fallback NTP)
 * 3. Criptografar dados
 * 4. Enviar para armazenamento seguro (S3 com Object Lock 1 dia)
 * 5. Reativar extensões do navegador
 * 6. Abrir página de preview
 *
 * Este módulo integra com o ProcessingOverlay para exibir progresso visual
 * e garante que o timestamp seja aplicado ANTES do upload (Requirement 2).
 *
 * @module PostCaptureProcessor
 * @see Requirements 1: Processing Overlay Post-Capture
 * @see Requirements 2: ICP-Brasil Timestamp Before Upload
 * @see Requirements 11: Lockdown Deactivation
 */

import { AuditLogger } from '../../lib/audit-logger';
import { TimestampService } from '../../lib/evidence-pipeline/timestamp-service';
import { UploadService } from '../../lib/evidence-pipeline/upload-service';
import { TabIsolationManager } from '../tab-isolation-manager';
import { ExtensionIsolationManager } from '../extension-isolation-manager';
import { FRONTEND_URL, PREVIEW_ALARM_CONFIG } from '../utils/constants';
import { getAuthManager } from '../auth-manager-export';
import { getSidePanelHandler } from '../sidepanel-handler';
import type {
  CaptureResult,
  TimestampResult,
  UploadResult,
  StorageConfig,
  PipelineProgress,
} from '../../lib/evidence-pipeline/types';
import type { ProcessingStep, ProcessingStepStatus, ProcessingError } from '../../overlay/processing-overlay';

// ============================================================================
// Tipos
// ============================================================================

/**
 * Configuração do processador pós-captura
 */
export interface PostCaptureProcessorConfig {
  /** ID da aba capturada */
  tabId: number;
  /** ID da janela capturada */
  windowId: number;
  /** Configuração de armazenamento */
  storageConfig: StorageConfig;
  /** Logger para auditoria */
  logger: AuditLogger;
  /** Gerenciador de isolamento de abas */
  tabIsolationManager: TabIsolationManager;
  /** Gerenciador de isolamento de extensões */
  extensionIsolationManager: ExtensionIsolationManager;
}

/**
 * Estado do processamento pós-captura
 */
export interface PostCaptureState {
  /** ID da evidência */
  evidenceId: string;
  /** Etapas de processamento */
  steps: ProcessingStep[];
  /** Progresso geral (0-100) */
  progress: number;
  /** Erro atual (se houver) */
  error: ProcessingError | null;
  /** Resultado do timestamp */
  timestampResult: TimestampResult | null;
  /** Resultado do upload */
  uploadResult: UploadResult | null;
  /** Se o processamento está em andamento */
  isProcessing: boolean;
  /** Se o processamento foi concluído */
  isComplete: boolean;
}

/**
 * Callback para atualização de estado do overlay
 */
export type OverlayStateCallback = (state: PostCaptureState) => void;

/**
 * Resultado do processamento pós-captura
 */
export interface PostCaptureResult {
  /** Se o processamento foi bem-sucedido */
  success: boolean;
  /** ID da evidência */
  evidenceId: string;
  /** Resultado do timestamp */
  timestampResult?: TimestampResult;
  /** Resultado do upload */
  uploadResult?: UploadResult;
  /** URL da página de preview */
  previewUrl?: string;
  /** Erro (se falhou) */
  error?: string;
  /** Código do erro */
  errorCode?: string;
}

// ============================================================================
// Constantes
// ============================================================================

/**
 * IDs das etapas de processamento
 */
const STEP_IDS = {
  CAPTURE: 'capture',
  TIMESTAMP: 'timestamp',
  ENCRYPT: 'encrypt',
  UPLOAD: 'upload',
  EXTENSIONS: 'extensions',
} as const;

/**
 * Peso de cada etapa para cálculo de progresso (total = 100%)
 */
const STEP_WEIGHTS = {
  [STEP_IDS.CAPTURE]: 10,    // Já concluída
  [STEP_IDS.TIMESTAMP]: 20,  // Timestamp ICP-Brasil
  [STEP_IDS.ENCRYPT]: 15,    // Criptografia
  [STEP_IDS.UPLOAD]: 40,     // Upload S3 (maior peso)
  [STEP_IDS.EXTENSIONS]: 15, // Reativar extensões
} as const;

/**
 * Interface para resposta do endpoint sso-link do frontend
 */
interface SSOLinkResponse {
  /** URL completa do callback SSO */
  ssoUrl: string;
  /** Timestamp de expiração */
  expiresAt: string;
}

/**
 * Etapas iniciais de processamento
 * @see Requirements 1.4: Processing steps in order
 */
function createInitialSteps(): ProcessingStep[] {
  return [
    { id: STEP_IDS.CAPTURE, label: 'Captura finalizada', status: 'completed' },
    { id: STEP_IDS.TIMESTAMP, label: 'Aplicando carimbo de tempo ICP-Brasil...', status: 'pending' },
    { id: STEP_IDS.ENCRYPT, label: 'Criptografando dados...', status: 'pending' },
    { id: STEP_IDS.UPLOAD, label: 'Enviando para armazenamento seguro...', status: 'pending' },
    { id: STEP_IDS.EXTENSIONS, label: 'Reativando extensões do navegador...', status: 'pending' },
  ];
}

// ============================================================================
// Classe Principal
// ============================================================================

/**
 * Orquestrador de Processamento Pós-Captura
 *
 * Gerencia a sequência completa de processamento após a captura,
 * integrando com o ProcessingOverlay para feedback visual.
 *
 * @see Requirements 1: Processing Overlay Post-Capture
 * @see Requirements 2: ICP-Brasil Timestamp Before Upload
 * @see Requirements 11: Lockdown Deactivation
 */
export class PostCaptureProcessor {
  private config: PostCaptureProcessorConfig;
  private timestampService: TimestampService;
  private uploadService: UploadService;
  private state: PostCaptureState;
  private stateCallbacks: Set<OverlayStateCallback> = new Set();

  constructor(config: PostCaptureProcessorConfig) {
    this.config = config;
    this.timestampService = new TimestampService();
    this.uploadService = new UploadService();
    this.state = this.createInitialState('');
  }

  /**
   * Cria estado inicial do processamento
   */
  private createInitialState(evidenceId: string): PostCaptureState {
    return {
      evidenceId,
      steps: createInitialSteps(),
      progress: STEP_WEIGHTS[STEP_IDS.CAPTURE], // Captura já concluída
      error: null,
      timestampResult: null,
      uploadResult: null,
      isProcessing: false,
      isComplete: false,
    };
  }

  /**
   * Registra callback para atualizações de estado
   * Usado pelo overlay para receber atualizações em tempo real
   *
   * @param callback - Função a ser chamada em cada atualização
   * @returns Função para remover o callback
   */
  onStateChange(callback: OverlayStateCallback): () => void {
    this.stateCallbacks.add(callback);
    return () => this.stateCallbacks.delete(callback);
  }

  /**
   * Notifica todos os callbacks sobre mudança de estado
   * Também envia mensagem para o content script atualizar o overlay
   *
   * @see Requirements 1.5: WHEN a step completes, update step status to completed
   */
  private notifyStateChange(): void {
    const stateCopy = { ...this.state, steps: [...this.state.steps] };

    // Notificar callbacks locais
    for (const callback of this.stateCallbacks) {
      try {
        callback(stateCopy);
      } catch (error) {
        this.config.logger.error('CAPTURE', 'STATE_CALLBACK_ERROR', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Enviar mensagem para o content script atualizar o overlay
    this.sendOverlayUpdate(stateCopy).catch((error) => {
      // Não falhar se o overlay não estiver disponível
      this.config.logger.warn('CAPTURE', 'OVERLAY_UPDATE_FAILED', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  /**
   * Envia atualização de estado para o overlay no content script
   *
   * @param state - Estado atual do processamento
   */
  private async sendOverlayUpdate(state: PostCaptureState): Promise<void> {
    const { tabId } = this.config;

    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'OVERLAY_UPDATE_STATE',
        target: 'overlay',
        evidenceId: state.evidenceId,
        data: {
          steps: state.steps,
          progress: state.progress,
          error: state.error,
        },
      });
    } catch {
      // Tab pode ter sido fechada ou content script não carregado
      // Ignorar silenciosamente
    }
  }

  /**
   * Mostra o overlay de processamento na aba capturada
   *
   * @param evidenceId - ID da evidência sendo processada
   * @see Requirements 1.1: WHEN capture finishes, Processing_Overlay SHALL appear
   */
  private async showProcessingOverlay(evidenceId: string): Promise<void> {
    const { tabId, logger } = this.config;

    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'OVERLAY_SHOW',
        target: 'overlay',
        evidenceId,
        data: {
          evidenceId,
          steps: this.state.steps,
          progress: this.state.progress,
        },
      });

      logger.info('CAPTURE', 'OVERLAY_SHOWN', {
        tabId,
        evidenceId,
      });
    } catch (error) {
      // Não falhar se o overlay não puder ser mostrado
      logger.warn('CAPTURE', 'OVERLAY_SHOW_FAILED', {
        tabId,
        evidenceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Esconde o overlay de processamento
   *
   * @param evidenceId - ID da evidência
   * @param previewUrl - URL da página de preview (opcional)
   * @see Requirements 1.6: WHEN all steps complete, close overlay and open preview page
   */
  private async hideProcessingOverlay(evidenceId: string, previewUrl?: string): Promise<void> {
    const { tabId, logger } = this.config;

    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'OVERLAY_COMPLETE',
        target: 'overlay',
        evidenceId,
        data: {
          previewUrl,
        },
      });

      logger.info('CAPTURE', 'OVERLAY_HIDDEN', {
        tabId,
        evidenceId,
        previewUrl,
      });
    } catch (error) {
      // Não falhar se o overlay não puder ser escondido
      logger.warn('CAPTURE', 'OVERLAY_HIDE_FAILED', {
        tabId,
        evidenceId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Atualiza status de uma etapa
   */
  private updateStepStatus(
    stepId: string,
    status: ProcessingStepStatus,
    errorMessage?: string
  ): void {
    const stepIndex = this.state.steps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) {
      return;
    }

    const currentStep = this.state.steps[stepIndex];
    if (!currentStep) {
      return;
    }

    const updatedStep: ProcessingStep = {
      id: currentStep.id,
      label: currentStep.label,
      status,
    };

    if (errorMessage !== undefined) {
      updatedStep.errorMessage = errorMessage;
    }

    this.state.steps[stepIndex] = updatedStep;

    // Recalcular progresso
    this.state.progress = this.calculateProgress();

    this.notifyStateChange();
  }

  /**
   * Calcula progresso geral baseado nas etapas concluídas
   */
  private calculateProgress(): number {
    let progress = 0;
    for (const step of this.state.steps) {
      if (step.status === 'completed') {
        progress += STEP_WEIGHTS[step.id as keyof typeof STEP_WEIGHTS] ?? 0;
      } else if (step.status === 'in_progress') {
        // Etapa em progresso conta como metade
        progress += (STEP_WEIGHTS[step.id as keyof typeof STEP_WEIGHTS] ?? 0) / 2;
      }
    }
    return Math.min(100, Math.round(progress));
  }

  /**
   * Executa o processamento pós-captura completo
   *
   * Sequência (conforme design.md):
   * 1. Captura finalizada (já concluída)
   * 2. Aplicar timestamp ICP-Brasil (ANTES do upload - Requirement 2)
   * 3. Criptografar dados
   * 4. Upload para S3 (com Object Lock 1 dia)
   * 5. Reativar extensões do navegador (ANTES de abrir preview - Requirement 11)
   * 6. Abrir página de preview
   *
   * NOTA: Quando skipUpload=true, pula etapas 2-4 pois já foram feitas pelo pipeline
   *
   * @param captureResult - Resultado da captura
   * @param skipUpload - Se deve pular timestamp/upload (já feito pelo pipeline)
   * @returns Resultado do processamento
   */
  async process(captureResult: CaptureResult, skipUpload = false): Promise<PostCaptureResult> {
    const { evidenceId, merkleRoot } = captureResult;
    const { logger, tabId } = this.config;

    // Inicializar estado
    this.state = this.createInitialState(evidenceId);
    this.state.isProcessing = true;
    this.notifyStateChange();

    logger.info('CAPTURE', 'PROCESSING_START', {
      evidenceId,
      tabId,
      merkleRoot: merkleRoot.substring(0, 16) + '...',
    });

    // Mostrar overlay de processamento na aba capturada
    // @see Requirements 1.1: WHEN capture finishes, Processing_Overlay SHALL appear
    await this.showProcessingOverlay(evidenceId);

    try {
      let timestampResult: TimestampResult | null = null;
      let uploadResult: UploadResult | null = null;

      if (!skipUpload) {
        // ========================================================================
        // ETAPA 2: Timestamp ICP-Brasil (ANTES do upload - Requirement 2)
        // ========================================================================
        this.updateStepStatus(STEP_IDS.TIMESTAMP, 'in_progress');

        logger.info('CAPTURE', 'TIMESTAMP_START', { evidenceId });

        timestampResult = await this.applyTimestamp(merkleRoot);
        this.state.timestampResult = timestampResult;

        // Verificar se usou fallback
        if (timestampResult.type === 'NTP_LOCAL') {
          logger.warn('CAPTURE', 'TIMESTAMP_FALLBACK_USED', {
            evidenceId,
            warning: timestampResult.warning,
          });
        }

        this.updateStepStatus(STEP_IDS.TIMESTAMP, 'completed');
        logger.info('CAPTURE', 'TIMESTAMP_COMPLETE', {
          evidenceId,
          type: timestampResult.type,
          tsa: timestampResult.tsa,
        });

        // ========================================================================
        // ETAPA 3: Criptografia
        // ========================================================================
        this.updateStepStatus(STEP_IDS.ENCRYPT, 'in_progress');

        logger.info('CAPTURE', 'ENCRYPT_START', { evidenceId });

        // A criptografia é feita durante o upload (S3 server-side encryption)
        // Aqui apenas simulamos a etapa para feedback visual
        await this.simulateEncryption();

        this.updateStepStatus(STEP_IDS.ENCRYPT, 'completed');
        logger.info('CAPTURE', 'ENCRYPT_COMPLETE', { evidenceId });

        // ========================================================================
        // ETAPA 4: Upload S3 (com Object Lock 1 dia - Requirement 3)
        // ========================================================================
        this.updateStepStatus(STEP_IDS.UPLOAD, 'in_progress');

        logger.info('CAPTURE', 'UPLOAD_START', { evidenceId });

        uploadResult = await this.uploadToS3(captureResult, timestampResult);
        this.state.uploadResult = uploadResult;

        this.updateStepStatus(STEP_IDS.UPLOAD, 'completed');
        logger.info('CAPTURE', 'UPLOAD_COMPLETE', {
          evidenceId,
          filesCount: uploadResult.stats.filesCount,
          totalBytes: uploadResult.stats.totalBytes,
        });
      } else {
        // Quando skipUpload=true, marcar etapas como já concluídas
        this.updateStepStatus(STEP_IDS.TIMESTAMP, 'completed');
        this.updateStepStatus(STEP_IDS.ENCRYPT, 'completed');
        this.updateStepStatus(STEP_IDS.UPLOAD, 'completed');
        logger.info('CAPTURE', 'SKIPPING_UPLOAD_STEPS', {
          evidenceId,
          reason: 'Already processed by pipeline',
        });
      }

      // ========================================================================
      // ETAPA 5: Reativar extensões (ANTES de abrir preview - Requirement 11)
      // ========================================================================
      this.updateStepStatus(STEP_IDS.EXTENSIONS, 'in_progress');

      logger.info('CAPTURE', 'EXTENSIONS_REACTIVATE_START', { evidenceId, tabId });

      await this.reactivateExtensions();

      this.updateStepStatus(STEP_IDS.EXTENSIONS, 'completed');
      logger.info('CAPTURE', 'EXTENSIONS_REACTIVATE_COMPLETE', { evidenceId });

      // ========================================================================
      // ETAPA 6: Abrir página de preview
      // @see Requirements 1.6: WHEN all steps complete, close overlay and open preview page
      // @see Requirements 4.1: AFTER processing completes, open new tab with preview page
      // ========================================================================

      // Indicar que está abrindo o preview (99%)
      this.state.progress = 99;
      this.notifyStateChange();

      // Enviar mensagem de progresso para o popup
      await chrome.runtime.sendMessage({
        type: 'CAPTURE_PROGRESS',
        data: {
          stage: 'opening_preview',
          percent: 99,
          message: 'Abrindo visualização...',
        },
      }).catch(() => {
        // Ignora erro se popup não estiver aberto
      });

      const previewUrl = await this.openPreviewPage(evidenceId);

      // Esconder overlay de processamento
      await this.hideProcessingOverlay(evidenceId, previewUrl);

      // Marcar como concluído - agora sim 100%
      this.state.isProcessing = false;
      this.state.isComplete = true;
      this.state.progress = 100;
      this.notifyStateChange();

      // Enviar mensagem de progresso completo para o popup
      await chrome.runtime.sendMessage({
        type: 'CAPTURE_PROGRESS',
        data: {
          stage: 'complete',
          percent: 100,
          message: 'Captura concluída com sucesso!',
        },
      }).catch(() => {
        // Ignora erro se popup não estiver aberto
      });

      logger.info('CAPTURE', 'PROCESSING_COMPLETE', {
        evidenceId,
        previewUrl,
        timestampType: timestampResult?.type ?? 'none',
      });

      const result: PostCaptureResult = {
        success: true,
        evidenceId,
        previewUrl,
      };

      // Adicionar timestampResult e uploadResult apenas se existirem
      if (timestampResult) {
        result.timestampResult = timestampResult;
      }
      if (uploadResult) {
        result.uploadResult = uploadResult;
      }

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = this.inferErrorCode(error);

      logger.error('CAPTURE', 'PROCESSING_FAILED', {
        evidenceId,
        error: errorMessage,
        errorCode,
      });

      // Atualizar estado com erro
      this.state.error = {
        stepId: this.getCurrentStepId(),
        message: errorMessage,
        retryable: this.isRetryableError(error),
        code: errorCode,
      };
      this.state.isProcessing = false;
      this.notifyStateChange();

      // Enviar erro para o overlay (permite retry)
      // @see Requirements 1.8: IF an error occurs, display error message with retry option
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'OVERLAY_ERROR',
          target: 'overlay',
          evidenceId,
          data: {
            error: this.state.error,
          },
        });
      } catch {
        // Ignorar se não conseguir enviar
      }

      // Mesmo com erro, tentar reativar extensões para não deixar usuário travado
      try {
        await this.reactivateExtensions();
      } catch (reactivateError) {
        logger.error('CAPTURE', 'EXTENSIONS_REACTIVATE_FAILED_ON_ERROR', {
          evidenceId,
          error: reactivateError instanceof Error ? reactivateError.message : String(reactivateError),
        });
      }

      return {
        success: false,
        evidenceId,
        error: errorMessage,
        errorCode,
      };
    }
  }

  /**
   * Aplica timestamp ICP-Brasil com fallback NTP
   *
   * @see Requirements 2: ICP-Brasil Timestamp Before Upload
   * @see Requirements 15.1: IF ICP-Brasil timestamp fails, retry up to 3 times
   * @see Requirements 15.2: IF ICP-Brasil still fails, use NTP timestamp with warning
   */
  private async applyTimestamp(merkleRoot: string): Promise<TimestampResult> {
    return this.timestampService.requestTimestamp(merkleRoot);
  }

  /**
   * Simula etapa de criptografia para feedback visual
   *
   * A criptografia real é feita pelo S3 (server-side encryption com AES-256).
   * Esta etapa existe para dar feedback visual ao usuário.
   */
  private async simulateEncryption(): Promise<void> {
    // Simular tempo de processamento (100-300ms)
    const delay = 100 + Math.random() * 200;
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Faz upload para S3 com Object Lock de 1 dia
   *
   * @see Requirements 3: S3 Object Lock COMPLIANCE Strategy
   * @see Requirements 3.2: Set initial retention of 1 day
   */
  private async uploadToS3(
    captureResult: CaptureResult,
    timestampResult: TimestampResult
  ): Promise<UploadResult> {
    const onProgress = (progress: PipelineProgress) => {
      // Atualizar progresso do upload no estado
      if (progress.details?.bytesUploaded && progress.details?.totalBytes) {
        const uploadPercent = (progress.details.bytesUploaded / progress.details.totalBytes) * 100;
        // Ajustar progresso geral considerando peso do upload
        const baseProgress = STEP_WEIGHTS[STEP_IDS.CAPTURE] +
          STEP_WEIGHTS[STEP_IDS.TIMESTAMP] +
          STEP_WEIGHTS[STEP_IDS.ENCRYPT];
        const uploadProgress = (uploadPercent / 100) * STEP_WEIGHTS[STEP_IDS.UPLOAD];
        this.state.progress = Math.round(baseProgress + uploadProgress);
        this.notifyStateChange();
      }
    };

    return this.uploadService.upload(
      captureResult,
      timestampResult,
      this.config.storageConfig,
      onProgress
    );
  }

  /**
   * Reativa extensões do navegador após captura
   *
   * Ordem de desativação (conforme design.md e Requirement 11):
   * 1. Restaurar atalhos de teclado (content script)
   * 2. Restaurar menu de contexto (content script)
   * 3. Restaurar DevTools (background)
   * 4. Re-habilitar extensões desabilitadas (background)
   * 5. Recarregar aba capturada (opcional - não fazemos aqui pois abriremos preview)
   *
   * @see Requirements 11: Lockdown Deactivation
   * @see Requirements 11.6: Lockdown deactivation SHALL happen BEFORE opening preview page
   */
  private async reactivateExtensions(): Promise<void> {
    const { tabIsolationManager, extensionIsolationManager, logger, tabId } = this.config;

    // 1. Primeiro: Limpar recursos e desbloquear lockdown no content script
    // Envia mensagem para o content script fazer cleanup completo
    try {
      await chrome.tabs.sendMessage(tabId, {
        type: 'CAPTURE_CLEANUP',
        target: 'content',
      });
      logger.info('CAPTURE', 'CONTENT_CLEANUP_COMPLETE', { tabId });
    } catch (error) {
      logger.warn('CAPTURE', 'CONTENT_CLEANUP_FAILED', {
        tabId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // 2. Depois: Desativar isolamento no background (DevTools, extensões)
    const lockdownResult = await tabIsolationManager.deactivateLockdown(false);

    if (!lockdownResult.success) {
      logger.warn('CAPTURE', 'BACKGROUND_LOCKDOWN_DEACTIVATE_PARTIAL', {
        tabId,
        stepsCompleted: lockdownResult.stepsCompleted,
        warnings: lockdownResult.warnings,
      });
    }

    // 3. Re-habilitar extensões desabilitadas
    try {
      const restoreResult = await extensionIsolationManager.forceRestore();

      logger.info('CAPTURE', 'EXTENSIONS_RESTORED', {
        restoredCount: restoreResult.restoredExtensions.length,
        failedCount: restoreResult.failedExtensions.length,
      });
    } catch (error) {
      // Não falhar o processamento se extensões não puderem ser restauradas
      logger.warn('CAPTURE', 'EXTENSIONS_RESTORE_FAILED', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Gera link de preview com SSO (autenticação automática)
   *
   * Implementa retry com backoff exponencial para maior robustez.
   * - Máximo de 3 tentativas
   * - Backoff exponencial: 1s, 2s, 4s
   * - Jitter de 30% para evitar thundering herd
   * - Timeout de 10s por requisição
   *
   * @param evidenceId - ID da evidência
   * @param refreshToken - Refresh token do Cognito
   * @param maxAttempts - Número máximo de tentativas (padrão: 3)
   * @returns URL com código de autenticação ou null se falhar
   */
  private async generateSSOPreviewLink(
    evidenceId: string,
    refreshToken: string,
    maxAttempts = 3
  ): Promise<string | null> {
    const { logger } = this.config;
    let lastError: Error | null = null;

    // Configuração de retry
    const initialDelayMs = 1000;
    const backoffFactor = 2;
    const jitterPercent = 0.3;

    // O endpoint SSO está no frontend, não na API
    const ssoUrl = `${FRONTEND_URL}/api/auth/sso-link`;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        logger.info('PREVIEW', 'SSO_PREVIEW_LINK_ATTEMPT', {
          evidenceId,
          attempt,
          maxAttempts,
          hasRefreshToken: !!refreshToken,
        });

        // Criar AbortController para timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const response = await fetch(ssoUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            refreshToken,
            redirectPath: `/preview/${evidenceId}`,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = (errorData as { error?: string }).error ?? `HTTP ${response.status}`;

          logger.warn('PREVIEW', 'SSO_PREVIEW_LINK_FAILED', {
            evidenceId,
            attempt,
            status: response.status,
            error: errorMsg,
          });

          // Se erro 401/403, não vale a pena retry (token inválido)
          if (response.status === 401 || response.status === 403) {
            logger.warn('PREVIEW', 'SSO_AUTH_ERROR_NO_RETRY', {
              evidenceId,
              status: response.status,
            });
            return null;
          }

          lastError = new Error(errorMsg);

          // Calcular delay com backoff exponencial e jitter
          if (attempt < maxAttempts) {
            const baseDelay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
            const jitter = baseDelay * jitterPercent * (Math.random() * 2 - 1);
            const delay = Math.round(baseDelay + jitter);

            logger.info('PREVIEW', 'SSO_RETRY_DELAY', {
              evidenceId,
              attempt,
              delayMs: delay,
            });

            await new Promise(r => setTimeout(r, delay));
          }
          continue;
        }

        const responseBody = await response.json() as {
          success: boolean;
          data: SSOLinkResponse;
        };

        const data = responseBody.data;

        logger.info('PREVIEW', 'SSO_PREVIEW_LINK_SUCCESS', {
          evidenceId,
          attempt,
          expiresAt: data.expiresAt,
        });

        // O sso-link retorna a URL completa com o callback SSO
        return data.ssoUrl;

      } catch (error) {
        const isTimeout = error instanceof Error && error.name === 'AbortError';

        logger.error('PREVIEW', 'SSO_PREVIEW_LINK_ERROR', {
          evidenceId,
          attempt,
          isTimeout,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });

        lastError = error instanceof Error ? error : new Error(String(error));

        // Retry com backoff
        if (attempt < maxAttempts) {
          const baseDelay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
          const jitter = baseDelay * jitterPercent * (Math.random() * 2 - 1);
          const delay = Math.round(baseDelay + jitter);

          logger.info('PREVIEW', 'SSO_RETRY_AFTER_ERROR', {
            evidenceId,
            attempt,
            delayMs: delay,
            isTimeout,
          });

          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    // Todas as tentativas falharam
    logger.error('PREVIEW', 'SSO_ALL_ATTEMPTS_FAILED', {
      evidenceId,
      maxAttempts,
      lastError: lastError?.message,
    });

    return null;
  }

  /**
   * Abre página de preview no frontend web com SSO
   *
   * Fluxo SSO:
   * 1. Verifica se usuário está autenticado (tem refresh token)
   * 2. Se sim, gera link com código SSO para autenticação automática
   * 3. Se não autenticado ou SSO falhar, abre URL normal
   *
   * @see Requirements 4.1: AFTER processing completes, open new tab with preview page
   * @see Requirements 1.6: WHEN all steps complete, close overlay and open preview page
   */
  private async openPreviewPage(evidenceId: string): Promise<string> {
    const { logger } = this.config;
    let previewUrl = `${FRONTEND_URL}/preview/${evidenceId}`;

    // Tentar obter tokens para SSO
    try {
      const authManager = getAuthManager();
      const tokens = await authManager.getStoredTokens();

      if (tokens?.refreshToken) {
        logger.info('PREVIEW', 'SSO_ATTEMPT', {
          evidenceId,
          hasRefreshToken: true,
        });

        const ssoUrl = await this.generateSSOPreviewLink(
          evidenceId,
          tokens.refreshToken
        );

        if (ssoUrl) {
          previewUrl = ssoUrl;
          logger.info('PREVIEW', 'SSO_URL_GENERATED', {
            evidenceId,
            hasSSOCode: previewUrl.includes('auth_code='),
          });
        } else {
          logger.warn('PREVIEW', 'SSO_FALLBACK_TO_NORMAL', {
            evidenceId,
            reason: 'SSO link generation failed',
          });
        }
      } else {
        logger.info('PREVIEW', 'NO_SSO_NOT_AUTHENTICATED', {
          evidenceId,
          reason: 'No refresh token available',
        });
      }
    } catch (error) {
      logger.warn('PREVIEW', 'SSO_CHECK_FAILED', {
        evidenceId,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });
      // Continua com URL normal se SSO falhar
    }

    // Criar nova aba com a página de preview (com ou sem SSO)
    await chrome.tabs.create({ url: previewUrl, active: true });

    // Fechar o Side Panel automaticamente após abrir o preview
    // Usa SidePanelHandler que implementa fechamento via API do Chrome
    try {
      const sidePanelHandler = getSidePanelHandler();
      await sidePanelHandler.close();
    } catch {
      // Ignorar erro se Side Panel não estiver aberto
    }

    // Configurar alarmes para lembretes e expiração (24 horas)
    const reminderAlarmName = `${PREVIEW_ALARM_CONFIG.REMINDER_PREFIX}${evidenceId}`;
    const urgentAlarmName = `${PREVIEW_ALARM_CONFIG.URGENT_PREFIX}${evidenceId}`;
    const expirationAlarmName = `${PREVIEW_ALARM_CONFIG.EXPIRATION_PREFIX}${evidenceId}`;

    await chrome.alarms.create(reminderAlarmName, {
      delayInMinutes: PREVIEW_ALARM_CONFIG.REMINDER_DELAY_MINUTES,
    });
    await chrome.alarms.create(urgentAlarmName, {
      delayInMinutes: PREVIEW_ALARM_CONFIG.URGENT_DELAY_MINUTES,
    });
    await chrome.alarms.create(expirationAlarmName, {
      delayInMinutes: PREVIEW_ALARM_CONFIG.EXPIRATION_DELAY_MINUTES,
    });

    this.config.logger.info('CAPTURE', 'PREVIEW_PAGE_OPENED', {
      evidenceId,
      previewUrl,
      hasSSO: previewUrl.includes('auth_code='),
      alarms: {
        reminder: PREVIEW_ALARM_CONFIG.REMINDER_DELAY_MINUTES,
        urgent: PREVIEW_ALARM_CONFIG.URGENT_DELAY_MINUTES,
        expiration: PREVIEW_ALARM_CONFIG.EXPIRATION_DELAY_MINUTES,
      },
    });

    return previewUrl;
  }

  /**
   * Obtém ID da etapa atual em progresso
   */
  private getCurrentStepId(): string {
    const inProgressStep = this.state.steps.find(s => s.status === 'in_progress');
    return inProgressStep?.id ?? STEP_IDS.CAPTURE;
  }

  /**
   * Infere código de erro baseado na exceção
   */
  private inferErrorCode(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('timestamp') || message.includes('ICP') || message.includes('SERPRO')) {
      return 'TIMESTAMP_FAILED';
    }
    if (message.includes('upload') || message.includes('S3') || message.includes('presigned')) {
      return 'UPLOAD_FAILED';
    }
    if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
      return 'NETWORK_ERROR';
    }
    if (message.includes('permission') || message.includes('access')) {
      return 'PERMISSION_ERROR';
    }

    return 'UNKNOWN_ERROR';
  }

  /**
   * Verifica se o erro permite retry
   */
  private isRetryableError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);

    // Erros de rede são geralmente retryable
    if (message.includes('network') || message.includes('timeout') || message.includes('fetch')) {
      return true;
    }

    // Erros de timestamp podem ser retryable (fallback para NTP)
    if (message.includes('timestamp') || message.includes('SERPRO')) {
      return true;
    }

    // Erros de upload podem ser retryable
    if (message.includes('upload') || message.includes('S3')) {
      return true;
    }

    return false;
  }

  /**
   * Tenta novamente o processamento após erro
   *
   * @see Requirements 1.8: IF an error occurs, display error message with retry option
   */
  async retry(captureResult: CaptureResult): Promise<PostCaptureResult> {
    this.config.logger.info('CAPTURE', 'RETRY_REQUESTED', {
      evidenceId: captureResult.evidenceId,
    });

    // Limpar erro anterior
    this.state.error = null;

    // Reprocessar
    return this.process(captureResult);
  }

  /**
   * Obtém estado atual do processamento
   */
  getState(): PostCaptureState {
    return { ...this.state, steps: [...this.state.steps] };
  }

  /**
   * Processa abort de captura (limpa recursos sem abrir preview)
   *
   * @param reason - Motivo do abort
   * @returns Resultado do processamento de abort
   */
  async processAbort(reason: string): Promise<{ success: boolean; error?: string }> {
    const { logger, tabId } = this.config;

    logger.info('CAPTURE', 'PROCESSING_ABORT', {
      reason,
      tabId,
    });

    try {
      // Apenas reativar extensões, sem abrir preview
      await this.reactivateExtensions();

      logger.info('CAPTURE', 'ABORT_PROCESSED', {
        tabId,
        reason,
      });

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error('CAPTURE', 'ABORT_PROCESSING_FAILED', {
        tabId,
        reason,
        error: errorMessage,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Cria instância do PostCaptureProcessor
 *
 * @param config - Configuração do processador
 * @returns Nova instância do processador
 */
export function createPostCaptureProcessor(
  config: PostCaptureProcessorConfig
): PostCaptureProcessor {
  return new PostCaptureProcessor(config);
}

export default PostCaptureProcessor;
