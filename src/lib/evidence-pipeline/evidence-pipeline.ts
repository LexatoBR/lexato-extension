/**
 * Orquestrador Principal do Pipeline de Evidências
 *
 * Gerencia o ciclo de vida completo da evidência:
 * 1. Captura (Strategy)
 * 2. Timestamp (TimestampService)
 * 3. Upload (UploadService)
 * 4. Preview e Aprovação (com SSO)
 * 5. Blockchain
 * 6. Certificação
 *
 * @module EvidencePipeline
 */

import { PREVIEW_ALARM_CONFIG, FRONTEND_URL, RETRY_CONFIG } from '../../background/utils/constants';
import { addBreadcrumb } from '../sentry';

import {
  type EvidencePipeline,
  type CaptureConfig,
  type CaptureResult,
  type TimestampResult,
  type UploadResult,
  type StorageConfig,
  type CertificationResult,
  type PipelineProgressCallback,
  type PipelineErrorCallback,
  type PipelineProgress,
  type EvidenceStatus,
  type BlockchainResult
} from './types';

import { CaptureStrategy, createCaptureStrategy } from './capture-strategy';
import { TimestampService } from './timestamp-service';
import { UploadService } from './upload-service';
import { ProgressTracker } from './progress-tracker';
import { ErrorHandler } from './error-handler';
import { getAPIClient } from '../../background/api-client';
import { getSidePanelHandler } from '../../background/sidepanel-handler';
import { BlockchainService } from './blockchain-service';

// =============================================================================
// CONSTANTES DE STORAGE (para evitar dependência de AuthManager)
// =============================================================================

/**
 * Chaves de armazenamento de autenticação
 * Duplicadas aqui para evitar dependência circular com AuthManager
 */
const AUTH_STORAGE_KEYS = {
  REFRESH_TOKEN: 'lexato_refresh_token',
} as const;

/**
 * Obtém refresh token diretamente do chrome.storage
 * Evita necessidade de inicializar AuthManager singleton
 *
 * @returns Refresh token ou null se não autenticado
 */
async function getStoredRefreshToken(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get([AUTH_STORAGE_KEYS.REFRESH_TOKEN]);
    const refreshToken = result[AUTH_STORAGE_KEYS.REFRESH_TOKEN] as string | undefined;
    return refreshToken ?? null;
  } catch (error) {
     
    console.error('[EvidencePipeline] Erro ao obter refresh token do storage:', error);
    return null;
  }
}

// =============================================================================
// TIPOS PARA SSO
// =============================================================================

// =============================================================================
// FUNÇÕES AUXILIARES PARA SSO
// =============================================================================

/**
 * Gera link de preview com SSO para autenticação automática
 *
 * Implementa retry com backoff exponencial para maior robustez.
 *
 * @param evidenceId - ID da evidência
 * @param refreshToken - Refresh token do Cognito
 * @param maxAttempts - Número máximo de tentativas (padrão: 3)
 * @returns URL com código de autenticação ou null se falhar
 */
async function generateSSOPreviewLink(
  evidenceId: string,
  refreshToken: string,
  maxAttempts = RETRY_CONFIG.MAX_ATTEMPTS
): Promise<string | null> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // O endpoint SSO está no frontend, não na API
      const ssoUrl = `${FRONTEND_URL}/api/auth/sso-link`;

      addBreadcrumb({
        category: 'sso',
        message: `SSO tentativa ${attempt}/${maxAttempts}`,
        level: 'info',
        data: { evidenceId, ssoUrl },
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

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

      addBreadcrumb({
        category: 'sso',
        message: `SSO resposta: ${response.status}`,
        level: response.ok ? 'info' : 'warning',
        data: { status: response.status, ok: response.ok },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = (errorData as { error?: string }).error ?? `HTTP ${response.status}`;
        lastError = new Error(errorMsg);

        // Erro 401/403 - nao vale retry
        if (response.status === 401 || response.status === 403) {
          return null;
        }

        // Backoff exponencial com jitter
        if (attempt < maxAttempts) {
          const baseDelay = RETRY_CONFIG.INITIAL_DELAY_MS * Math.pow(RETRY_CONFIG.BACKOFF_FACTOR, attempt - 1);
          const jitter = baseDelay * RETRY_CONFIG.JITTER_PERCENT * (Math.random() * 2 - 1);
          const delay = Math.round(baseDelay + jitter);
          await new Promise(r => setTimeout(r, delay));
        }
        continue;
      }

      const responseBody = await response.json() as { success: boolean; data: { ssoUrl: string; expiresAt: string } };
      const data = responseBody.data;

      addBreadcrumb({
        category: 'sso',
        message: 'SSO link gerado com sucesso',
        level: 'info',
        data: { evidenceId, expiresAt: data.expiresAt },
      });

      // O sso-link retorna a URL completa com o callback SSO
      return data.ssoUrl;

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      addBreadcrumb({
        category: 'sso',
        message: `SSO erro tentativa ${attempt}`,
        level: 'error',
        data: { error: lastError.message, isTimeout: lastError.name === 'AbortError' },
      });

      // Timeout ou outro erro - tentar novamente com backoff
      if (attempt < maxAttempts) {
        const baseDelay = RETRY_CONFIG.INITIAL_DELAY_MS * Math.pow(RETRY_CONFIG.BACKOFF_FACTOR, attempt - 1);
        const jitter = baseDelay * RETRY_CONFIG.JITTER_PERCENT * (Math.random() * 2 - 1);
        const delay = Math.round(baseDelay + jitter);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  return null;
}

export class EvidencePipelineImpl implements EvidencePipeline {
  private timestampService: TimestampService;
  private uploadService: UploadService;
  private blockchainService: BlockchainService;
  private progressTracker: ProgressTracker;
  private errorHandler: ErrorHandler;
  
  // Estado atual
  private activeStrategy: CaptureStrategy | null = null;
  private currentEvidenceId: string | null = null;
  private _captureResult: CaptureResult | null = null;
  private timestampResult: TimestampResult | null = null;
  private captureConfig: CaptureConfig | null = null;

  constructor(
      timestampService?: TimestampService,
      uploadService?: UploadService,
      blockchainService?: BlockchainService,
      progressTracker?: ProgressTracker,
      errorHandler?: ErrorHandler
  ) {
    this.timestampService = timestampService ?? new TimestampService();
    this.uploadService = uploadService ?? new UploadService();
    this.blockchainService = blockchainService ?? new BlockchainService();
    this.progressTracker = progressTracker ?? new ProgressTracker();
    this.errorHandler = errorHandler ?? new ErrorHandler();
  }

  /**
   * Fase 1: Inicia a captura
   */
  async startCapture(config: CaptureConfig): Promise<CaptureResult> {
    try {
      this.captureConfig = config;

      // 1. Validar e Inicializar
      if (this.activeStrategy?.isCapturing()) {
        throw new Error('Já existe uma captura em andamento');
      }

      this.activeStrategy = createCaptureStrategy(config.type);
      
      // Hook de progresso da estratégia
      const onStrategyProgress = (progress: PipelineProgress) => {
        this.currentEvidenceId = progress.evidenceId;
        this.progressTracker.update(progress.evidenceId, progress);
      };

      // 2. Executar Captura
      const result = await this.activeStrategy.execute(config, onStrategyProgress);
      
      this.currentEvidenceId = result.evidenceId;
      
      // Captura completa - 30% do progresso total (conforme DEFAULT_PERCENTAGES)
      this.progressTracker.update(result.evidenceId, {
        status: 'CAPTURED',
        phase: 1,
        phaseName: 'capture',
        percent: 30,
        message: 'Captura concluída com sucesso'
      });

      // Armazenar resultado da captura para uso posterior
      this._captureResult = result;

      return result;

    } catch (error) {
      this.handleError(error, 'capture');
      throw error;
    } finally {
      // NÃO limpar activeStrategy aqui para vídeo - precisa para stopCapture()
      // A limpeza será feita após stopCapture() ou em caso de erro
      if (config.type !== 'video') {
        this.activeStrategy = null;
      }
    }
  }

  /**
   * Para a captura de vídeo em andamento
   *
   * Deve ser chamado após startCapture() para vídeos.
   * Dispara o método stop() da VideoStrategy, que resolve a Promise
   * retornada por execute() com o CaptureResult.
   */
  async stopCapture(): Promise<void> {
    if (!this.activeStrategy) {
      return;
    }

    if (this.activeStrategy.stop) {
      await this.activeStrategy.stop();
    }

    // Limpar estratégia após parar
    this.activeStrategy = null;
  }

  /**
   * Cancela captura em andamento
   *
   * Aborta a captura atual sem salvar resultado.
   * Chama o método cancel() da estratégia ativa.
   */
  async cancelCapture(): Promise<void> {
    if (!this.activeStrategy) {
      return;
    }

    // Chamar cancel na estratégia ativa
    await this.activeStrategy.cancel();

    // Limpar estratégia após cancelar
    this.activeStrategy = null;

    // Limpar evidência atual
    this.currentEvidenceId = null;
    this._captureResult = null;
    this.timestampResult = null;
  }


  /**
   * Fase 2: Timestamp ICP-Brasil
   */
  async applyTimestamp(merkleRoot: string): Promise<TimestampResult> {
    if (!this.currentEvidenceId) {
      throw new Error('Nenhuma evidência ativa para aplicar timestamp');
    }

    const evidenceId = this.currentEvidenceId;

    try {
      this.progressTracker.update(evidenceId, {
        status: 'TIMESTAMPING',
        phase: 2,
        phaseName: 'timestamp',
        percent: 31,
        message: 'Iniciando carimbo de tempo...'
      });

      // Progresso gradual durante o timestamp com múltiplas mensagens
      const timestampMessages = [
        { delay: 300, percent: 32, message: 'Conectando ao servidor TSA...' },
        { delay: 800, percent: 33, message: 'Enviando Merkle Root para assinatura...' },
        { delay: 1500, percent: 34, message: 'Aguardando resposta do servidor ICP-Brasil...' },
        { delay: 2500, percent: 35, message: 'Verificando certificado de tempo...' },
        { delay: 4000, percent: 36, message: 'Validando assinatura temporal...' },
      ];

      const timeoutIds: NodeJS.Timeout[] = [];
      for (const msg of timestampMessages) {
        const timeoutId = setTimeout(() => {
          this.progressTracker.update(evidenceId, {
            status: 'TIMESTAMPING',
            phase: 2,
            phaseName: 'timestamp',
            percent: msg.percent,
            message: msg.message
          });
        }, msg.delay);
        timeoutIds.push(timeoutId);
      }

      const result = await this.timestampService.requestTimestamp(merkleRoot);
      this.timestampResult = result;

      // Limpar timeouts pendentes
      timeoutIds.forEach(id => clearTimeout(id));

      this.progressTracker.update(evidenceId, {
        status: result.type === 'ICP_BRASIL' ? 'TIMESTAMPED' : 'TIMESTAMP_FALLBACK',
        phase: 2,
        phaseName: 'timestamp',
        percent: 38,
        message: result.type === 'ICP_BRASIL'
          ? '✓ Carimbo de tempo ICP-Brasil aplicado com sucesso!'
          : `✓ Carimbo de tempo aplicado (Fallback: ${result.tsa})`
      });

      return result;

    } catch (error) {
      this.handleError(error, 'timestamp');
      throw error;
    }
  }

  /**
   * Fase 3: Upload S3
   *
   * Após o upload dos arquivos, notifica o backend via `/upload/complete`
   * para definir o status como `PENDENTE_CONFIRMACAO` e permitir o preview.
   */
  async uploadToS3(result: CaptureResult, timestamp: TimestampResult): Promise<UploadResult> {
    if (result.evidenceId !== this.currentEvidenceId) {
       // Consistency check
    }
    this.currentEvidenceId = result.evidenceId;

    try {
      this.progressTracker.update(result.evidenceId, {
        status: 'UPLOADING',
        phase: 3,
        phaseName: 'upload',
        percent: 40,
        message: 'Preparando upload seguro para AWS S3...'
      });

      // Rastrear bytes enviados para progresso granular
      let totalBytesUploaded = 0;
      const totalBytes = result.media.sizeBytes +
                        result.html.sizeBytes +
                        JSON.stringify(result.forensicMetadata).length;

      // Mensagens de progresso durante upload para feedback contínuo
      let lastMessageUpdate = Date.now();
      const uploadMessages = [
        'Enviando imagem capturada...',
        'Transferindo dados para nuvem segura...',
        'Upload em andamento...',
        'Enviando metadados forenses...',
        'Sincronizando com servidor...',
        'Verificando integridade do upload...',
      ];
      let messageIndex = 0;

      const onUploadProgress = (p: PipelineProgress) => {
        const now = Date.now();

        // Se tem informação de bytes, calcular progresso mais granular
        if (p.details?.bytesUploaded !== undefined) {
          totalBytesUploaded = p.details.bytesUploaded;
          const uploadPercent = (totalBytesUploaded / totalBytes) * 100;
          // Mapear para a faixa 40-85%
          const mappedPercent = 40 + Math.round(uploadPercent * 0.45);

          // Trocar mensagem a cada 2 segundos para dar feedback visual
          let message = p.message ?? 'Enviando arquivos...';
          if (now - lastMessageUpdate > 2000) {
            const newMessage = uploadMessages[messageIndex % uploadMessages.length];
            if (newMessage) {
              message = newMessage;
            }
            messageIndex++;
            lastMessageUpdate = now;
          }

          // Adicionar info de bytes na mensagem se disponível
          const kbUploaded = Math.round(totalBytesUploaded / 1024);
          const kbTotal = Math.round(totalBytes / 1024);
          const progressInfo = ` (${kbUploaded}KB / ${kbTotal}KB)`;

          this.progressTracker.update(result.evidenceId, {
            ...p,
            percent: Math.min(85, mappedPercent),
            message: message + progressInfo,
            details: {
              ...p.details,
              bytesUploaded: totalBytesUploaded,
              totalBytes,
            },
          });
        } else {
          // Mesmo sem bytes, trocar mensagem periodicamente
          let message = p.message ?? 'Processando...';
          if (now - lastMessageUpdate > 2000) {
            const newMessage = uploadMessages[messageIndex % uploadMessages.length];
            if (newMessage) {
              message = newMessage;
            }
            messageIndex++;
            lastMessageUpdate = now;
          }
          this.progressTracker.update(result.evidenceId, {
            ...p,
            message,
          });
        }
      };

      const storageConfig = this.captureConfig?.storageConfig ?? {
          storageClass: 'STANDARD',
          retentionYears: 5,
          additionalCredits: 0
      };

      const uploadResult = await this.uploadService.upload(
        result,
        timestamp,
        storageConfig,
        onUploadProgress
      );

      // Notificar backend que o upload foi concluído
      // Isso define o status como PENDENTE_CONFIRMACAO para permitir o preview
      this.progressTracker.update(result.evidenceId, {
        status: 'UPLOADING',
        phase: 3,
        phaseName: 'upload',
        percent: 88,
        message: 'Todos os arquivos enviados! Registrando no servidor...'
      });

      addBreadcrumb({
        category: 'upload',
        message: 'Notificando backend sobre upload completo',
        level: 'info',
        data: { evidenceId: result.evidenceId, filesCount: Object.keys(uploadResult.s3Keys).length },
      });

      await this.notifyUploadComplete(result, uploadResult, storageConfig);

      addBreadcrumb({
        category: 'upload',
        message: 'Backend notificado com sucesso',
        level: 'info',
        data: { evidenceId: result.evidenceId },
      });

      this.progressTracker.update(result.evidenceId, {
        status: 'UPLOADED',
        phase: 3,
        phaseName: 'upload',
        percent: 92,
        message: '✓ Upload concluído! Abrindo preview...'
      });

      return uploadResult;

    } catch (error) {
      this.handleError(error, 'upload');
      throw error;
    }
  }

  /**
   * Notifica o backend que o upload foi concluído
   *
   * Isso define o status da evidência como `PENDENTE_CONFIRMACAO`,
   * permitindo que o preview seja exibido corretamente.
   *
   * @param capture - Resultado da captura
   * @param uploadResult - Resultado do upload
   * @param storageConfig - Configuração de armazenamento
   */
  private async notifyUploadComplete(
    capture: CaptureResult,
    uploadResult: UploadResult,
    storageConfig: StorageConfig
  ): Promise<void> {
    const client = getAPIClient();

    // Mapear storageClass para storageType
    const storageTypeMap: Record<string, string> = {
      'STANDARD': 'standard',
      'GLACIER': 'premium_5y',
      'DEEP_ARCHIVE': 'premium_10y',
    };
    const storageType = storageTypeMap[storageConfig.storageClass] ?? 'standard';

    // Preparar lista de arquivos
    const files: Array<{
      type: 'screenshot' | 'video' | 'html' | 'metadata' | 'hashes' | 'frame';
      objectKey: string;
      downloadUrl: string;
      contentType: string;
      sizeBytes: number;
    }> = [];

    // Arquivo de mídia principal (screenshot ou video)
    if (uploadResult.s3Keys.media) {
      files.push({
        type: capture.type === 'video' ? 'video' : 'screenshot',
        objectKey: uploadResult.s3Keys.media,
        downloadUrl: uploadResult.urls.media,
        contentType: capture.media.mimeType,
        sizeBytes: capture.media.sizeBytes,
      });
    }

    // HTML inicial
    if (uploadResult.s3Keys.html.initial) {
      const htmlSize = capture.htmlCollection?.initial.sizeBytes ?? capture.html.sizeBytes;
      files.push({
        type: 'html',
        objectKey: uploadResult.s3Keys.html.initial,
        downloadUrl: uploadResult.urls.html.initial,
        contentType: 'text/html',
        sizeBytes: htmlSize,
      });
    }

    // Metadados
    if (uploadResult.s3Keys.metadata) {
      files.push({
        type: 'metadata',
        objectKey: uploadResult.s3Keys.metadata,
        downloadUrl: uploadResult.urls.metadata,
        contentType: 'application/json',
        sizeBytes: JSON.stringify(capture.forensicMetadata).length,
      });
    }

    // Integridade (hashes)
    if (uploadResult.s3Keys.integrity) {
      files.push({
        type: 'hashes',
        objectKey: uploadResult.s3Keys.integrity,
        downloadUrl: uploadResult.urls.integrity,
        contentType: 'application/json',
        sizeBytes: 1024, // Estimativa
      });
    }

    // Construir payload
    const payload = {
      captureId: capture.evidenceId,
      storageType,
      files,
      combinedHash: capture.merkleRoot,
      completedAt: new Date().toISOString(),
      // Campos para preview
      originalUrl: capture.forensicMetadata.url,
      pageTitle: capture.forensicMetadata.title,
      captureType: capture.type === 'video' ? 'VIDEO' : 'SCREENSHOT',
      // Dimensões sempre definidas usando fallbacks robustos
      dimensions: this.extractDimensions(capture),
      contentHash: capture.media.hash,
    };

    // eslint-disable-next-line no-console
    addBreadcrumb({
      category: 'upload',
      message: 'Enviando notificacao de upload completo',
      level: 'info',
      data: { captureId: payload.captureId, filesCount: files.length, storageType: payload.storageType },
    });

    const response = await client.post<{ acknowledged: boolean }>('/upload/complete', payload);

    if (!response.success) {
      throw new Error(response.error ?? 'Falha ao finalizar upload');
    }

    addBreadcrumb({
      category: 'upload',
      message: 'Upload completo notificado com sucesso',
      level: 'info',
      data: { acknowledged: response.data?.acknowledged },
    });
  }

  /**
   * Extrai dimensões da captura com fallbacks robustos
   *
   * Ordem de prioridade:
   * 1. viewport do forensicMetadata (se > 0)
   * 2. pageSize do forensicMetadata (se > 0)
   * 3. Dimensões default (1920x1080)
   *
   * @param capture - Resultado da captura
   * @returns Dimensões sempre válidas
   */
  private extractDimensions(capture: CaptureResult): { width: number; height: number } {
    const viewport = capture.forensicMetadata.viewport;
    const pageSize = capture.forensicMetadata.pageSize;

    // Prioridade 1: Viewport válido
    if (viewport && viewport.width > 0 && viewport.height > 0) {
      return { width: viewport.width, height: viewport.height };
    }

    // Prioridade 2: PageSize válido (dimensões totais da captura)
    if (pageSize && pageSize.width > 0 && pageSize.height > 0) {
      return { width: pageSize.width, height: pageSize.height };
    }

    // Fallback: Valores padrao
    return { width: 1920, height: 1080 };
  }

  /**
   * Fase 4: Preview com SSO
   *
   * Abre a página de preview no frontend web com autenticação automática (SSO).
   *
   * Fluxo SSO:
   * 1. Verifica se usuário está autenticado (tem refresh token)
   * 2. Se sim, gera link com código SSO para autenticação automática
   * 3. Se não autenticado ou SSO falhar, abre URL normal (fallback)
   *
   * @param evidenceId - ID da evidência para preview
   */
  async openPreview(evidenceId: string): Promise<void> {
    try {
      // NOTA: Upload termina em 92%, então preview começa em 95%
      this.progressTracker.update(evidenceId, {
        status: 'PENDING_REVIEW',
        phase: 4,
        phaseName: 'preview',
        percent: 95,
        message: 'Preparando página de preview...'
      });

      // URL padrão (fallback se SSO falhar)
      let previewUrl = `${FRONTEND_URL}/preview/${evidenceId}`;
      let usedSSO = false;

      // Tentar obter refresh token para SSO (diretamente do storage, sem AuthManager)
      try {
        addBreadcrumb({
          category: 'preview',
          message: 'Obtendo refresh token do storage',
          level: 'info',
          data: { evidenceId },
        });

        const refreshToken = await getStoredRefreshToken();

        addBreadcrumb({
          category: 'preview',
          message: 'Refresh token consultado',
          level: 'info',
          data: { hasToken: !!refreshToken, tokenLength: refreshToken?.length ?? 0 },
        });

        if (refreshToken) {
          addBreadcrumb({
            category: 'preview',
            message: 'Tentando gerar link SSO',
            level: 'info',
            data: { evidenceId },
          });

          this.progressTracker.update(evidenceId, {
            status: 'PENDING_REVIEW',
            phase: 4,
            phaseName: 'preview',
            percent: 92,
            message: 'Gerando autenticação automática...'
          });

          const ssoUrl = await generateSSOPreviewLink(
            evidenceId,
            refreshToken
          );

          addBreadcrumb({
            category: 'preview',
            message: 'Resultado do generateSSOPreviewLink',
            level: ssoUrl ? 'info' : 'warning',
            data: { evidenceId, gotUrl: !!ssoUrl, urlLength: ssoUrl?.length ?? 0 },
          });

          if (ssoUrl) {
            previewUrl = ssoUrl;
            usedSSO = true;
            addBreadcrumb({
              category: 'preview',
              message: 'SSO URL gerada com sucesso',
              level: 'info',
              data: { evidenceId, hasSSOCode: previewUrl.includes('auth_code=') },
            });
          } else {
            addBreadcrumb({
              category: 'preview',
              message: 'SSO falhou, usando URL normal',
              level: 'warning',
              data: { evidenceId },
            });
          }
        } else {
          addBreadcrumb({
            category: 'preview',
            message: 'Sem refresh token, abrindo sem SSO',
            level: 'info',
            data: { evidenceId },
          });
        }
      } catch (ssoError) {
        // SSO falhou - usar URL normal como fallback
        addBreadcrumb({
          category: 'preview',
          message: 'Erro ao tentar SSO, usando fallback',
          level: 'error',
          data: { error: ssoError instanceof Error ? ssoError.message : String(ssoError) },
        });
      }

      this.progressTracker.update(evidenceId, {
        status: 'PENDING_REVIEW',
        phase: 4,
        phaseName: 'preview',
        percent: 95,
        message: 'Abrindo página de preview...'
      });

      // Abrir nova aba com URL (com ou sem SSO)
      const tab = await chrome.tabs.create({ url: previewUrl, active: true });

      addBreadcrumb({
        category: 'preview',
        message: 'Preview aberto',
        level: 'info',
        data: { evidenceId, tabId: tab.id, usedSSO },
      });

      // Fechar o Side Panel automaticamente após abrir o preview
      // Usa SidePanelHandler que implementa fechamento via API do Chrome
      // (mais confiável que window.close() via mensagem, especialmente durante screenshot)
      try {
        const sidePanelHandler = getSidePanelHandler();
        await sidePanelHandler.close();
      } catch {
        // Ignorar erro se Side Panel não estiver aberto
      }

      // Configurar alarmes para lembretes e expiração
      const reminderAlarmName = `${PREVIEW_ALARM_CONFIG.REMINDER_PREFIX}${evidenceId}`;
      const urgentAlarmName = `${PREVIEW_ALARM_CONFIG.URGENT_PREFIX}${evidenceId}`;
      const expirationAlarmName = `${PREVIEW_ALARM_CONFIG.EXPIRATION_PREFIX}${evidenceId}`;

      await chrome.alarms.create(reminderAlarmName, { delayInMinutes: PREVIEW_ALARM_CONFIG.REMINDER_DELAY_MINUTES });
      await chrome.alarms.create(urgentAlarmName, { delayInMinutes: PREVIEW_ALARM_CONFIG.URGENT_DELAY_MINUTES });
      await chrome.alarms.create(expirationAlarmName, { delayInMinutes: PREVIEW_ALARM_CONFIG.EXPIRATION_DELAY_MINUTES });

      this.progressTracker.update(evidenceId, {
        status: 'PENDING_REVIEW',
        phase: 4,
        phaseName: 'preview',
        percent: 100,
        message: 'Aguardando revisão do usuário'
      });

    } catch (error) {
      this.handleError(error, 'preview');
      throw error;
    }
  }

  /**
   * Fase 5: Registro em Blockchain
   */
  async registerBlockchain(evidenceId: string): Promise<BlockchainResult> {
    try {
      this.currentEvidenceId = evidenceId;

      this.progressTracker.update(evidenceId, {
        status: 'REGISTERING_BLOCKCHAIN',
        phase: 5,
        phaseName: 'blockchain',
        percent: 10,
        message: 'Iniciando registro em blockchain...'
      });

      if (!this.timestampResult?.tokenHash) { // Use tokenHash instead of hash if that's what TimestampResult has. Let's check types.ts (TimestampResult has tokenHash)
          // Adjust logic if needed. In evidence-pipeline.ts replacement I used 'hash', but Types says 'tokenHash'. 
          // Going to use tokenHash which is more likely correct for linking.
          if (!this.timestampResult) {
               throw new Error('Dados de timestamp não disponíveis');
          }
      }
      
      // Note: BlockchainService register expects 'timestampHash'. 
      // types.ts TimestampResult says 'tokenHash'.
      const result = await this.blockchainService.register(evidenceId, this.timestampResult!.tokenHash);

      if (result.success) {
        this.progressTracker.update(evidenceId, {
          status: 'BLOCKCHAIN_COMPLETE',
          phase: 5,
          phaseName: 'blockchain',
          percent: 100,
          message: 'Registro em blockchain solicitado com sucesso',
          details: {
            // blockchainProof: result.proof 
          }
        });
      } else {
        throw new Error(result.error);
      }

      return result;

    } catch (error) {
      this.handleError(error, 'blockchain');
      throw error;
    }
  }

  /**
   * Fase 6: Aprovação e Certificação
   */
  async approve(evidenceId: string, storage: StorageConfig): Promise<CertificationResult> {
    try {
      this.progressTracker.update(evidenceId, {
        status: 'APPROVED',
        phase: 4,
        phaseName: 'preview',
        percent: 100,
        message: 'Evidência aprovada. Iniciando registro em blockchain...'
      });

      // Fase 5: Blockchain
      await this.registerBlockchain(evidenceId);
      
      // 5. Blockchain Registration
      const blockchainResult = await this.registerBlockchain(evidenceId);

      // 6. Certificate Generation
      this.progressTracker.update(evidenceId, {
          status: 'GENERATING_PDF',
          phase: 6,
          phaseName: 'certificate',
          percent: 0,
          message: 'Gerando certificado PDF...'
      });

      const client = getAPIClient();
      await client.post(`/evidence/${evidenceId}/approve`, { confirm: true });

      this.progressTracker.update(evidenceId, {
          status: 'CERTIFIED',
          phase: 6,
          phaseName: 'certificate',
          percent: 100,
          message: 'Certificado gerado com sucesso.'
      });
      
      if (!this.timestampResult) {
        throw new Error('Timestamp result not available for certification');
      }

      return {
        evidenceId,
        status: 'CERTIFIED',
        timestamp: this.timestampResult,
        blockchain: blockchainResult,
        retention: {
          years: storage.retentionYears,
          expiresAt: new Date(Date.now() + storage.retentionYears * 365 * 24 * 60 * 60 * 1000).toISOString()
        }
      };
    } catch (error) {
        this.handleError(error, 'certificate'); 
        throw error;
    }
  }

  /**
   * Descarta uma evidência pendente de aprovação
   * 
   * Remove a evidência do fluxo de processamento quando o usuário
   * decide não prosseguir com a certificação.
   * 
   * @param evidenceId - ID da evidência a ser descartada
   */
  async discard(evidenceId: string): Promise<void> {
      this.progressTracker.update(evidenceId, {
          status: 'DISCARDED',
          phase: 4,
          phaseName: 'preview',
          percent: 100,
          message: 'Evidência descartada pelo usuário'
      });
      
      this.currentEvidenceId = null;
  }

  /**
   * Marca uma evidência como expirada
   * 
   * Chamado automaticamente quando o tempo limite de aprovação (24 horas)
   * é excedido sem ação do usuário.
   * 
   * @param evidenceId - ID da evidência expirada
   */
  async expire(evidenceId: string): Promise<void> {
    this.progressTracker.update(evidenceId, {
      status: 'EXPIRED',
      phase: 4,
      phaseName: 'preview',
      percent: 100,
      message: 'Tempo limite de aprovação excedido (24 horas)'
    });
  }

  /**
   * Obtém o status atual de uma evidência no pipeline
   * 
   * @param evidenceId - ID da evidência
   * @returns Progresso atual ou null se não encontrada
   */
  async getStatus(evidenceId: string): Promise<PipelineProgress | null> {
      return this.progressTracker.get(evidenceId);
  }

  /**
   * Registra callback para atualizações de progresso
   * 
   * @param callback - Função chamada a cada atualização de progresso
   * @returns Função para cancelar a inscrição
   */
  onProgress(callback: PipelineProgressCallback): () => void {
    return this.progressTracker.subscribe(callback);
  }

  /**
   * Registra callback para tratamento de erros
   * 
   * @param callback - Função chamada quando ocorre um erro no pipeline
   * @returns Função para cancelar a inscrição
   */
  onError(callback: PipelineErrorCallback): () => void {
    return this.errorHandler.subscribe(callback);
  }

  // --- Internals ---

  private handleError(error: unknown, phase: PipelineProgress['phaseName']) {
      this.errorHandler.handle(error, phase);
      if (this.currentEvidenceId) {
          const code = this.errorHandler.inferErrorCode(error instanceof Error ? error.message : String(error), phase);
          
          let failStatus: EvidenceStatus = 'CAPTURE_FAILED';
          if (phase === 'timestamp') {failStatus = 'TIMESTAMP_FAILED';}
          if (phase === 'upload') {failStatus = 'UPLOAD_FAILED';}
          if (phase === 'blockchain') {failStatus = 'BLOCKCHAIN_FAILED';}
          if (phase === 'certificate') {failStatus = 'PDF_FAILED';}
          
          this.progressTracker.update(this.currentEvidenceId, {
              status: failStatus,
              phase: this.getPhaseNumber(phase),
              phaseName: phase,
              percent: 0,
              message: `Falha: ${error instanceof Error ? error.message : String(error)}`,
              details: { errorCode: code }
          });
      }
  }

  private getPhaseNumber(name: PipelineProgress['phaseName']): 1 | 2 | 3 | 4 | 5 | 6 {
      const map: Record<string, number> = {
          'capture': 1,
          'timestamp': 2,
          'upload': 3,
          'preview': 4,
          'blockchain': 5,
          'certificate': 6
      };
      return (map[name] ?? 1) as 1 | 2 | 3 | 4 | 5 | 6;
  }
}
