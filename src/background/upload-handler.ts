/**
 * Handler de upload para S3 via presigned URLs
 *
 * Implementa upload de arquivos de captura para S3 com retry automático,
 * progresso e notificação ao backend.
 *
 * Requisitos atendidos:
 * - 11.1: Solicitar presigned URL ao backend
 * - 11.2: Enviar tipo de arquivo e tamanho na solicitação
 * - 11.3: Enviar storage_type na solicitação
 * - 11.4: Upload via PUT para presigned URL
 * - 11.5: Content-Type correto no upload
 * - 11.6: Exibir progresso na UI
 * - 11.7: Retry automático (máximo 3 tentativas)
 * - 11.8: Notificar backend após upload
 * - 11.9: Permitir retry manual após falhas
 *
 * @module UploadHandler
 */

import { AuditLogger } from '../lib/audit-logger';
import { RetryHandler } from '../lib/retry-handler';
import { LexatoError, ErrorCodes } from '../lib/errors';
import { loggers } from '../lib/logger';
import type { StorageType } from '../types/capture.types';
import type { APIClient } from './api-client';

const log = loggers.upload;

// ============================================================================
// Tipos e Interfaces
// ============================================================================

/**
 * Tipo de arquivo para upload
 */
export type UploadFileType = 'screenshot' | 'video' | 'html' | 'metadata' | 'hashes' | 'frame';

/**
 * Configuração do UploadHandler
 */
export interface UploadHandlerConfig {
  /** Cliente API para comunicação com backend */
  apiClient: APIClient;
  /** Logger para auditoria */
  logger?: AuditLogger;
  /** Número máximo de tentativas de upload (padrão: 3) */
  maxRetries?: number;
  /** Timeout para upload em ms (padrão: 120000 = 2 minutos) */
  uploadTimeout?: number;
}

/**
 * Solicitação de presigned URL
 */
export interface PresignedUrlRequest {
  /** Tipo de arquivo */
  fileType: UploadFileType;
  /** Tamanho do arquivo em bytes */
  fileSize: number;
  /** Tipo de armazenamento */
  storageType: StorageType;
  /** ID da captura */
  captureId: string;
  /** Content-Type do arquivo */
  contentType: string;
  /** Nome do arquivo (opcional) */
  fileName?: string;
}

/**
 * Resposta de presigned URL do backend
 */
export interface PresignedUrlResponse {
  /** URL para upload (PUT) */
  uploadUrl: string;
  /** URL para download após upload */
  downloadUrl: string;
  /** Campos adicionais para o upload (se necessário) */
  fields?: Record<string, string>;
  /** Timestamp de expiração da URL */
  expiresAt: number;
  /** Key do objeto no S3 */
  objectKey: string;
}

/**
 * Arquivo para upload
 */
export interface UploadFile {
  /** Tipo de arquivo */
  type: UploadFileType;
  /** Dados do arquivo (Blob, ArrayBuffer ou string base64) */
  data: Blob | ArrayBuffer | string;
  /** Content-Type do arquivo */
  contentType: string;
  /** Nome do arquivo (opcional) */
  fileName?: string;
}

/**
 * Progresso do upload
 */
export interface UploadProgress {
  /** ID da captura */
  captureId: string;
  /** Tipo de arquivo sendo enviado */
  fileType: UploadFileType;
  /** Bytes enviados */
  loaded: number;
  /** Total de bytes */
  total: number;
  /** Progresso percentual (0-100) */
  percent: number;
  /** Tentativa atual */
  attempt: number;
  /** Máximo de tentativas */
  maxAttempts: number;
  /** Mensagem descritiva */
  message: string;
}

/**
 * Resultado do upload de um arquivo
 */
export interface UploadResult {
  /** Se o upload foi bem-sucedido */
  success: boolean;
  /** Tipo de arquivo */
  fileType: UploadFileType;
  /** URL de download do arquivo */
  downloadUrl?: string;
  /** Key do objeto no S3 */
  objectKey?: string;
  /** Número de tentativas realizadas */
  attempts: number;
  /** Mensagem de erro (se falha) */
  error?: string;
  /** Código de erro (se falha) */
  errorCode?: string;
}

/**
 * Resultado do upload de múltiplos arquivos
 */
export interface BatchUploadResult {
  /** Se todos os uploads foram bem-sucedidos */
  success: boolean;
  /** ID da captura */
  captureId: string;
  /** Resultados individuais */
  results: UploadResult[];
  /** Total de arquivos */
  totalFiles: number;
  /** Arquivos enviados com sucesso */
  successCount: number;
  /** Arquivos que falharam */
  failedCount: number;
  /** Mensagem de erro geral (se houver) */
  error?: string;
}

/**
 * Notificação de upload completo para o backend
 *
 * Inclui campos necessários para o preview:
 * - originalUrl: URL capturada
 * - pageTitle: Título da página
 * - captureType: Tipo de captura (SCREENSHOT/VIDEO)
 * - dimensions: Dimensões da imagem/vídeo
 * - contentHash: Hash SHA-256 do conteúdo principal
 */
export interface UploadCompleteNotification {
  /** ID da captura */
  captureId: string;
  /** Tipo de armazenamento */
  storageType: StorageType;
  /** Arquivos enviados */
  files: Array<{
    type: UploadFileType;
    objectKey: string;
    downloadUrl: string;
    contentType: string;
    sizeBytes: number;
  }>;
  /** Hash combinado de todos os arquivos */
  combinedHash?: string;
  /** Timestamp de conclusão */
  completedAt: string;

  // Campos para preview
  /** URL original capturada */
  originalUrl?: string;
  /** Título da página capturada */
  pageTitle?: string;
  /** Tipo de captura */
  captureType?: 'SCREENSHOT' | 'VIDEO';
  /** Dimensões da captura */
  dimensions?: { width: number; height: number };
  /** Hash SHA-256 do conteúdo principal */
  contentHash?: string;
}

/**
 * Callback para progresso do upload
 */
export type UploadProgressCallback = (progress: UploadProgress) => void;

// ============================================================================
// Constantes
// ============================================================================

/**
 * Configuração padrão do UploadHandler
 */
const DEFAULT_CONFIG = {
  /** Máximo de tentativas de upload (Requisito 11.7) */
  MAX_RETRIES: 3,
  /** Timeout para upload em ms (2 minutos) */
  UPLOAD_TIMEOUT_MS: 120000,
  /** Endpoint para solicitar presigned URL */
  PRESIGNED_URL_ENDPOINT: '/upload/presign',
  /** Endpoint para notificar upload completo */
  UPLOAD_COMPLETE_ENDPOINT: '/upload/complete',
};

/**
 * Mapeamento de tipo de arquivo para Content-Type padrão
 *
 * NOTA: Screenshots usam PNG para integridade forense em provas digitais.
 * PNG oferece compressão sem perdas, preservando cada pixel original,
 * garantindo hash consistente e validade jurídica.
 */
const DEFAULT_CONTENT_TYPES: Record<UploadFileType, string> = {
  screenshot: 'image/png',
  video: 'video/webm',
  html: 'text/html',
  metadata: 'application/json',
  hashes: 'application/json',
  frame: 'image/jpeg',
};

/**
 * Mensagens de progresso em português
 */
const PROGRESS_MESSAGES = {
  REQUESTING_URL: 'Solicitando URL de upload...',
  UPLOADING: 'Enviando arquivo...',
  RETRYING: 'Tentando novamente...',
  COMPLETE: 'Upload concluído',
  FAILED: 'Falha no upload',
  NOTIFYING: 'Notificando servidor...',
};

// ============================================================================
// Classe UploadHandler
// ============================================================================

/**
 * UploadHandler - Gerencia upload de arquivos para S3
 *
 * Funcionalidades:
 * - Solicita presigned URL ao backend (Requisito 11.1, 11.2)
 * - Envia storage_type na solicitação (Requisito 11.3)
 * - Upload via PUT com Content-Type correto (Requisito 11.4, 11.5)
 * - Exibe progresso na UI (Requisito 11.6)
 * - Retry automático com máximo 3 tentativas (Requisito 11.7)
 * - Notifica backend após upload (Requisito 11.8)
 * - Permite retry manual após falhas (Requisito 11.9)
 */
export class UploadHandler {
  private apiClient: APIClient;
  private logger: AuditLogger;
  private maxRetries: number;
  private uploadTimeout: number;
  private retryHandler: RetryHandler;

  /**
   * Cria nova instância do UploadHandler
   *
   * @param config - Configuração do handler
   */
  constructor(config: UploadHandlerConfig) {
    this.apiClient = config.apiClient;
    this.logger = config.logger ?? new AuditLogger();
    this.maxRetries = config.maxRetries ?? DEFAULT_CONFIG.MAX_RETRIES;
    this.uploadTimeout = config.uploadTimeout ?? DEFAULT_CONFIG.UPLOAD_TIMEOUT_MS;

    // Configurar retry handler para uploads
    this.retryHandler = new RetryHandler({
      maxAttempts: this.maxRetries,
      initialDelayMs: 1000,
      maxDelayMs: 10000,
      backoffFactor: 2,
      jitterFactor: 0.3,
    });
  }

  // ==========================================================================
  // Métodos Públicos
  // ==========================================================================

  /**
   * Solicita presigned URL ao backend (Requisito 11.1, 11.2, 11.3)
   *
   * @param request - Dados da solicitação
   * @returns Resposta com presigned URL
   */
  async requestPresignedUrl(request: PresignedUrlRequest): Promise<PresignedUrlResponse> {
    log.debug('Solicitando presigned URL', {
      fileType: request.fileType,
      fileSize: request.fileSize,
      storageType: request.storageType,
      captureId: request.captureId,
    });

    this.logger.info('UPLOAD', 'REQUESTING_PRESIGNED_URL', {
      fileType: request.fileType,
      fileSize: request.fileSize,
      storageType: request.storageType,
      captureId: request.captureId,
      contentType: request.contentType,
    });

    try {
      const normalizedContentType = this.normalizeContentType(request.contentType);

      const payload = {
        evidenceId: request.captureId,
        contentType: normalizedContentType,
        contentLength: request.fileSize,
        storageType: request.storageType,
        titulo: `Captura ${request.fileType} - ${request.captureId}`,
        metadata: {
          captureId: request.captureId,
          fileType: request.fileType,
          ...(request.fileName ? { fileName: request.fileName } : {}),
        },
      };

      log.debug('Payload para presign', { payload });

      const response = await this.apiClient.post<{
        evidenceId: string;
        uploadUrl: string;
        downloadUrl?: string;
        bucket: string;
        key: string;
        expiresAt: string;
        expiresInSeconds: number;
        conditions: {
          contentType: string;
          maxContentLength: number;
        };
      }>(
        DEFAULT_CONFIG.PRESIGNED_URL_ENDPOINT,
        payload
      );

      if (!response.success || !response.data) {
        throw new LexatoError(ErrorCodes.STORAGE_PRESIGNED_URL_FAILED, {
          customMessage: response.error ?? 'Falha ao obter URL de upload',
        });
      }

      const presignedResponse: PresignedUrlResponse = {
        uploadUrl: response.data.uploadUrl,
        downloadUrl: response.data.downloadUrl ?? `https://${response.data.bucket}.s3.amazonaws.com/${response.data.key}`,
        expiresAt: new Date(response.data.expiresAt).getTime(),
        objectKey: response.data.key,
      };

      this.logger.info('UPLOAD', 'PRESIGNED_URL_RECEIVED', {
        fileType: request.fileType,
        expiresAt: presignedResponse.expiresAt,
        evidenceId: response.data.evidenceId,
      });

      return presignedResponse;
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : typeof error === 'object' && error !== null
          ? JSON.stringify(error)
          : String(error);

      this.logger.error('UPLOAD', 'PRESIGNED_URL_FAILED', {
        fileType: request.fileType,
        error: errorMessage,
      });

      log.error('Falha ao obter presigned URL', error, {
        fileType: request.fileType,
        captureId: request.captureId,
      });

      if (error instanceof LexatoError) {
        throw error;
      }

      throw new LexatoError(ErrorCodes.STORAGE_PRESIGNED_URL_FAILED, {
        originalError: error instanceof Error ? error : undefined,
      });
    }
  }

  /**
   * Normaliza Content-Type removendo charset e parâmetros extras
   */
  private normalizeContentType(contentType: string): string {
    return (contentType.split(';')[0] ?? contentType).trim();
  }

  /**
   * Faz upload de um arquivo para S3 (Requisito 11.4, 11.5, 11.6, 11.7)
   *
   * @param captureId - ID da captura
   * @param storageType - Tipo de armazenamento
   * @param file - Arquivo para upload
   * @param onProgress - Callback de progresso
   * @returns Resultado do upload
   */
  async uploadFile(
    captureId: string,
    storageType: StorageType,
    file: UploadFile,
    onProgress?: UploadProgressCallback
  ): Promise<UploadResult> {
    const fileSize = this.getFileSize(file.data);
    const rawContentType = file.contentType || DEFAULT_CONTENT_TYPES[file.type];
    const contentType = this.normalizeContentType(rawContentType);

    log.info('Upload iniciado', {
      captureId,
      fileType: file.type,
      fileSize,
      contentType,
    });

    this.logger.info('UPLOAD', 'UPLOAD_STARTED', {
      captureId,
      fileType: file.type,
      fileSize,
      contentType,
    });

    // Notificar progresso inicial
    this.notifyProgress(onProgress, {
      captureId,
      fileType: file.type,
      loaded: 0,
      total: fileSize,
      percent: 0,
      attempt: 1,
      maxAttempts: this.maxRetries,
      message: PROGRESS_MESSAGES.REQUESTING_URL,
    });

    let attempts = 0;
    let lastError: Error | undefined;

    // Retry loop (Requisito 11.7)
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      attempts = attempt;

      try {
        // 1. Solicitar presigned URL
        const presignedUrl = await this.requestPresignedUrl({
          fileType: file.type,
          fileSize,
          storageType,
          captureId,
          contentType,
          ...(file.fileName ? { fileName: file.fileName } : {}),
        });

        // 2. Fazer upload via PUT (Requisito 11.4, 11.5)
        await this.uploadToS3(
          presignedUrl.uploadUrl,
          file.data,
          contentType,
          (loaded, total) => {
            this.notifyProgress(onProgress, {
              captureId,
              fileType: file.type,
              loaded,
              total,
              percent: Math.round((loaded / total) * 100),
              attempt,
              maxAttempts: this.maxRetries,
              message: PROGRESS_MESSAGES.UPLOADING,
            });
          }
        );

        // Upload bem-sucedido
        this.logger.info('UPLOAD', 'UPLOAD_COMPLETED', {
          captureId,
          fileType: file.type,
          attempts,
          objectKey: presignedUrl.objectKey,
        });

        log.info('Upload concluído', {
          captureId,
          fileType: file.type,
          attempts,
          objectKey: presignedUrl.objectKey,
        });

        this.notifyProgress(onProgress, {
          captureId,
          fileType: file.type,
          loaded: fileSize,
          total: fileSize,
          percent: 100,
          attempt,
          maxAttempts: this.maxRetries,
          message: PROGRESS_MESSAGES.COMPLETE,
        });

        return {
          success: true,
          fileType: file.type,
          downloadUrl: presignedUrl.downloadUrl,
          objectKey: presignedUrl.objectKey,
          attempts,
        };
      } catch (error) {
        let errorMessage: string;
        if (error instanceof LexatoError) {
          errorMessage = error.message;
          lastError = error;
        } else if (error instanceof Error) {
          errorMessage = error.message;
          lastError = error;
        } else if (typeof error === 'object' && error !== null) {
          errorMessage = JSON.stringify(error);
          lastError = new Error(errorMessage);
        } else {
          errorMessage = String(error);
          lastError = new Error(errorMessage);
        }

        this.logger.warn('UPLOAD', 'UPLOAD_ATTEMPT_FAILED', {
          captureId,
          fileType: file.type,
          attempt,
          maxAttempts: this.maxRetries,
          error: errorMessage,
        });

        log.warn(`Tentativa ${attempt}/${this.maxRetries} falhou`, {
          captureId,
          fileType: file.type,
          error: errorMessage,
        });

        // Se não é a última tentativa, aguardar antes de retry
        if (attempt < this.maxRetries) {
          const delay = this.retryHandler.calculateDelay(attempt - 1);

          this.notifyProgress(onProgress, {
            captureId,
            fileType: file.type,
            loaded: 0,
            total: fileSize,
            percent: 0,
            attempt: attempt + 1,
            maxAttempts: this.maxRetries,
            message: `${PROGRESS_MESSAGES.RETRYING} (tentativa ${attempt + 1}/${this.maxRetries})`,
          });

          await this.sleep(delay);
        }
      }
    }

    // Todas as tentativas falharam
    this.logger.error('UPLOAD', 'UPLOAD_FAILED', {
      captureId,
      fileType: file.type,
      attempts,
      error: lastError?.message,
    });

    log.error('Upload falhou após todas as tentativas', lastError, {
      captureId,
      fileType: file.type,
      attempts,
    });

    this.notifyProgress(onProgress, {
      captureId,
      fileType: file.type,
      loaded: 0,
      total: fileSize,
      percent: 0,
      attempt: attempts,
      maxAttempts: this.maxRetries,
      message: PROGRESS_MESSAGES.FAILED,
    });

    const errorCode =
      lastError instanceof LexatoError ? lastError.code : ErrorCodes.STORAGE_UPLOAD_FAILED;

    return {
      success: false,
      fileType: file.type,
      attempts,
      error: lastError?.message ?? 'Falha no upload após múltiplas tentativas',
      errorCode,
    };
  }

  /**
   * Faz upload de múltiplos arquivos
   */
  async uploadFiles(
    captureId: string,
    storageType: StorageType,
    files: UploadFile[],
    onProgress?: UploadProgressCallback
  ): Promise<BatchUploadResult> {
    this.logger.info('UPLOAD', 'BATCH_UPLOAD_STARTED', {
      captureId,
      fileCount: files.length,
      storageType,
    });

    log.info('Batch upload iniciado', {
      captureId,
      fileCount: files.length,
      storageType,
    });

    const results: UploadResult[] = [];
    let successCount = 0;
    let failedCount = 0;

    for (const file of files) {
      const result = await this.uploadFile(captureId, storageType, file, onProgress);
      results.push(result);

      if (result.success) {
        successCount++;
      } else {
        failedCount++;
      }
    }

    const success = failedCount === 0;

    this.logger.info('UPLOAD', 'BATCH_UPLOAD_COMPLETED', {
      captureId,
      totalFiles: files.length,
      successCount,
      failedCount,
      success,
    });

    log.info('Batch upload concluído', {
      captureId,
      totalFiles: files.length,
      successCount,
      failedCount,
      success,
    });

    return {
      success,
      captureId,
      results,
      totalFiles: files.length,
      successCount,
      failedCount,
      ...(success ? {} : { error: `${failedCount} arquivo(s) falharam no upload` }),
    };
  }

  /**
   * Notifica backend após upload bem-sucedido (Requisito 11.8)
   */
  async notifyUploadComplete(notification: UploadCompleteNotification): Promise<boolean> {
    this.logger.info('UPLOAD', 'NOTIFYING_BACKEND', {
      captureId: notification.captureId,
      fileCount: notification.files.length,
    });

    try {
      const response = await this.apiClient.post<{ acknowledged: boolean }>(
        DEFAULT_CONFIG.UPLOAD_COMPLETE_ENDPOINT,
        notification
      );

      if (!response.success) {
        throw new Error(response.error ?? 'Falha ao notificar backend');
      }

      this.logger.info('UPLOAD', 'BACKEND_NOTIFIED', {
        captureId: notification.captureId,
        acknowledged: response.data?.acknowledged,
      });

      return true;
    } catch (error) {
      this.logger.error('UPLOAD', 'BACKEND_NOTIFICATION_FAILED', {
        captureId: notification.captureId,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      });

      log.error('Falha ao notificar backend', error, {
        captureId: notification.captureId,
      });

      return false;
    }
  }

  /**
   * Permite retry manual de um upload que falhou (Requisito 11.9)
   */
  async retryUpload(
    captureId: string,
    storageType: StorageType,
    file: UploadFile,
    onProgress?: UploadProgressCallback
  ): Promise<UploadResult> {
    this.logger.info('UPLOAD', 'MANUAL_RETRY_STARTED', {
      captureId,
      fileType: file.type,
    });

    log.info('Retry manual iniciado', {
      captureId,
      fileType: file.type,
    });

    return this.uploadFile(captureId, storageType, file, onProgress);
  }

  // ==========================================================================
  // Métodos Privados
  // ==========================================================================

  /**
   * Faz upload para S3 via PUT usando fetch
   */
  private async uploadToS3(
    uploadUrl: string,
    data: Blob | ArrayBuffer | string,
    contentType: string,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<void> {
    const blob = this.toBlob(data, contentType);
    const total = blob.size;

    log.debug('Iniciando upload S3', {
      blobSize: blob.size,
      contentType,
    });

    // Notificar início do upload (0%)
    if (onProgress) {
      onProgress(0, total);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.uploadTimeout);

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
        },
        body: blob,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let responseBody = '';
        try {
          responseBody = await response.text();
        } catch {
          // Não foi possível ler o corpo
        }

        log.error('S3 retornou erro', undefined, {
          status: response.status,
          statusText: response.statusText,
          responseBody: responseBody.substring(0, 500),
        });

        throw new LexatoError(ErrorCodes.STORAGE_UPLOAD_FAILED, {
          customMessage: `Upload falhou com status ${response.status}: ${response.statusText}`,
        });
      }

      log.debug('Upload S3 concluído com sucesso');

      // Notificar conclusão do upload (100%)
      if (onProgress) {
        onProgress(total, total);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LexatoError(ErrorCodes.NETWORK_TIMEOUT, {
          customMessage: 'Upload excedeu o tempo limite',
        });
      }

      if (error instanceof LexatoError) {
        throw error;
      }

      throw new LexatoError(ErrorCodes.STORAGE_UPLOAD_FAILED, {
        customMessage: error instanceof Error ? error.message : 'Erro de rede durante upload',
        originalError: error instanceof Error ? error : undefined,
      });
    }
  }

  /**
   * Converte dados para Blob
   */
  private toBlob(data: Blob | ArrayBuffer | string, contentType: string): Blob {
    if (data instanceof Blob) {
      return data;
    }

    if (data instanceof ArrayBuffer) {
      return new Blob([data], { type: contentType });
    }

    // String - verificar se é base64
    if (typeof data === 'string') {
      // Verificar se é base64 com prefixo data:
      const base64Match = data.match(/^data:([^;]+);base64,(.+)$/);
      if (base64Match?.[1] && base64Match[2]) {
        const binaryString = atob(base64Match[2]);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return new Blob([bytes], { type: base64Match[1] });
      }

      // Base64 puro
      try {
        const binaryString = atob(data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return new Blob([bytes], { type: contentType });
      } catch {
        // Não é base64, tratar como texto
        return new Blob([data], { type: contentType });
      }
    }

    throw new LexatoError(ErrorCodes.VALIDATION_INVALID_INPUT, {
      customMessage: 'Tipo de dados não suportado para upload',
    });
  }

  /**
   * Obtém tamanho do arquivo em bytes
   */
  private getFileSize(data: Blob | ArrayBuffer | string): number {
    if (data instanceof Blob) {
      return data.size;
    }

    if (data instanceof ArrayBuffer) {
      return data.byteLength;
    }

    if (typeof data === 'string') {
      // Converter para Blob para obter tamanho EXATO
      const blob = this.toBlob(data, 'application/octet-stream');
      return blob.size;
    }

    return 0;
  }

  /**
   * Notifica callback de progresso
   */
  private notifyProgress(
    callback: UploadProgressCallback | undefined,
    progress: UploadProgress
  ): void {
    if (callback) {
      try {
        callback(progress);
      } catch (error) {
        this.logger.warn('UPLOAD', 'PROGRESS_CALLBACK_ERROR', {
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }
  }

  /**
   * Aguarda por um período de tempo
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ==========================================================================
  // Getters
  // ==========================================================================

  /**
   * Obtém configuração de máximo de tentativas
   */
  getMaxRetries(): number {
    return this.maxRetries;
  }

  /**
   * Obtém timeout de upload
   */
  getUploadTimeout(): number {
    return this.uploadTimeout;
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Cria instância do UploadHandler
 */
export function createUploadHandler(config: UploadHandlerConfig): UploadHandler {
  return new UploadHandler(config);
}

export default UploadHandler;
