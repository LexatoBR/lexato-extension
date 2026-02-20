/**
 * Serviço de upload multipart para S3
 *
 * Gerencia upload de chunks de vídeo com:
 * - Retry com backoff exponencial (máx 3 tentativas)
 * - Validação de hash antes do upload
 * - Gerenciamento de parts para completar upload
 * - Cálculo de checksum SHA-256 para validação de integridade
 * - Buffering automático para atingir tamanho mínimo de part (5MB)
 *
 * ============================================================================
 * CHECKSUMS E OBJECT LOCK
 * ============================================================================
 *
 * O bucket de evidências utiliza S3 Object Lock no modo
 * COMPLIANCE para garantir integridade forense das provas digitais (WORM).
 *
 * O S3 suporta múltiplos algoritmos de checksum para validação de integridade:
 * - CRC-64/NVME (padrão novo da AWS)
 * - CRC-32, CRC-32C
 * - SHA-1, SHA-256 (recomendado para segurança)
 * - MD5 (legado, descontinuado)
 *
 * IMPLEMENTAÇÃO ATUAL: Usa x-amz-checksum-sha256 (SHA-256 em base64)
 * 
 * SHA-256 foi escolhido por:
 * - Maior segurança criptográfica que MD5
 * - Suporte nativo via Web Crypto API (mais rápido)
 * - Recomendação AWS para novos uploads
 * - Compatibilidade com Object Lock
 *
 * @see https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity.html
 * @see https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html
 * ============================================================================
 *
 * @module MultipartUploadService
 * @see Requirements 2.4, 2.5, 2.6, 10.3, 11.1, 11.2
 */

import { getAPIClient } from '../background/api-client';
import { calcularHashSHA256Base64, calcularHashSHA256BlobIncremental } from './evidence-pipeline/crypto-helper';
import { loggers } from './logger';
import type { UploadProgress, UploadStatus } from '../sidepanel/types';

const log = loggers.upload.withPrefix('[Multipart]');

// ============================================================================
// CONSTANTES
// ============================================================================

/**
 * Tamanho mínimo de part para S3 Multipart Upload (5MB)
 * S3 exige que todas as parts (exceto a última) tenham no mínimo 5MB.
 * @see https://docs.aws.amazon.com/AmazonS3/latest/userguide/qfacts.html
 */
export const MIN_PART_SIZE = 5 * 1024 * 1024;

// ============================================================================
// NORMALIZAÇÃO DE RESPOSTA DA API
// ============================================================================

/**
 * Extrai dados de resposta da API, suportando formato nestado
 */
export function extrairDadosNestados(responseData: unknown): Record<string, unknown> {
  const outer = responseData as Record<string, unknown>;
  const inner = outer?.['data'] as Record<string, unknown> | undefined;
  return inner && typeof inner === 'object' ? inner : outer;
}

function criarNormalizador<T extends Record<string, unknown>>(
  campos: Record<keyof T, string[]>
): (responseData: unknown) => T {
  return (responseData: unknown): T => {
    const data = extrairDadosNestados(responseData);
    const outer = responseData as Record<string, unknown>;
    const resultado = {} as T;
    for (const [campoDestino, possiveisNomes] of Object.entries(campos)) {
      for (const nome of possiveisNomes as string[]) {
        const valor = data?.[nome] ?? outer?.[nome];
        if (valor !== undefined && valor !== null) {
          (resultado as Record<string, unknown>)[campoDestino] = valor;
          break;
        }
      }
      if ((resultado as Record<string, unknown>)[campoDestino] === undefined) {
        (resultado as Record<string, unknown>)[campoDestino] = '';
      }
    }
    return resultado;
  };
}

export const normalizarRespostaStart = criarNormalizador<{
  uploadId: string;
  captureId: string;
  s3Key: string;
}>({ uploadId: ['uploadId'], captureId: ['captureId'], s3Key: ['s3Key'] });

export const normalizarRespostaChunk = criarNormalizador<{
  presignedUrl: string;
  checksumSha256: string;
}>({ presignedUrl: ['presignedUrl'], checksumSha256: ['checksumSha256'] });

export const normalizarRespostaComplete = criarNormalizador<{
  url: string;
  s3Key: string;
}>({ url: ['url'], s3Key: ['key', 's3Key'] });

// ============================================================================
// INTERFACES E TIPOS
// ============================================================================

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface UploadPart {
  partNumber: number;
  etag: string;
}

export interface InitiateUploadResult {
  uploadId: string;
  captureId: string;
  s3Key: string;
}

export interface UploadPartResult {
  partNumber: number;
  etag: string;
  attempts: number;
}

export interface CompleteUploadResult {
  url: string;
  s3Key: string;
  totalParts: number;
}

/**
 * Dados de preview para enviar ao backend ao completar upload de vídeo
 * Esses campos são necessários para a página de preview funcionar corretamente
 */
export interface VideoPreviewData {
  /** URL original capturada */
  originalUrl?: string;
  /** Título da página */
  pageTitle?: string;
  /** Hash SHA-256 do vídeo completo (Merkle root dos chunks) */
  contentHash?: string;
  /** Dimensões do vídeo */
  dimensions?: {
    width: number;
    height: number;
  };
  /** Tamanho total do vídeo em bytes */
  fileSize?: number;
  /** Duração do vídeo em milissegundos */
  durationMs?: number;
  /** Metadados adicionais */
  metadata?: Record<string, unknown>;
}

interface ChunkPendente {
  blob: Blob;
  hash: string;
  previousHash: string | null;
}

// ============================================================================
// CLASSE DE ERRO
// ============================================================================

export class MultipartUploadError extends Error {
  attempts: number;
  recoverable: boolean;

  constructor(message: string, attempts = 0, recoverable = true) {
    super(message);
    this.name = 'MultipartUploadError';
    this.attempts = attempts;
    this.recoverable = recoverable;
  }
}

// ============================================================================
// EXECUTOR DE RETRY
// ============================================================================

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

class RetryExecutor {
  constructor(private config: RetryConfig) {}

  async execute<T>(operation: () => Promise<T>, errorMessage: string): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (!this.isRecoverableError(error)) {
          throw new MultipartUploadError(`${errorMessage}: ${lastError.message}`, attempt, false);
        }
        if (attempt < this.config.maxAttempts) {
          const delay = this.calculateBackoffDelay(attempt);
          await this.sleep(delay);
        }
      }
    }

    throw new MultipartUploadError(
      `${errorMessage} após ${this.config.maxAttempts} tentativas: ${lastError?.message}`,
      this.config.maxAttempts,
      false
    );
  }

  private calculateBackoffDelay(attempt: number): number {
    const exponentialDelay = this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1);
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelayMs);
    return Math.floor(cappedDelay * (0.9 + Math.random() * 0.2));
  }

  private isRecoverableError(error: unknown): boolean {
    if (error instanceof TypeError) {
      return true;
    }
    if (error instanceof Error) {
      const message = error.message;
      const statusMatch = message.match(/retornou (\d{3})/);
      if (statusMatch?.[1]) {
        const status = parseInt(statusMatch[1], 10);
        if (status >= 400 && status < 500 && status !== 429) {
          return false;
        }
        if (status >= 500) {
          return true;
        }
      }
      const lowerMsg = message.toLowerCase();
      if (lowerMsg.includes('timeout') || lowerMsg.includes('network') || lowerMsg.includes('fetch')) {
        return true;
      }
    }
    return true;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// SERVIÇO PRINCIPAL
// ============================================================================

export class MultipartUploadService {
  private uploadId: string | null = null;
  private captureId: string | null = null;
  private s3Key: string | null = null;
  private parts: UploadPart[] = [];
  private chunkBuffer: ChunkPendente[] = [];
  private bufferSize = 0;
  private nextPartNumber = 1;
  private retryExecutor: RetryExecutor;
  
  /**
   * Mutex para serializar operações de flush do buffer.
   * Evita race condition onde múltiplos chunks disparam flushBuffer()
   * concorrentemente e usam o mesmo partNumber.
   */
  private flushMutex: Promise<void> = Promise.resolve();
  private isFlushingBuffer = false;

  // ============================================================================
  // Rastreamento de Progresso de Upload (Requisito 7.8)
  // ============================================================================

  /** Total de bytes recebidos para upload */
  private totalBytesReceived = 0;
  /** Total de bytes já enviados ao S3 */
  private bytesUploaded = 0;
  /** Status atual do upload */
  private uploadStatus: UploadStatus = 'idle';
  /** Callback para notificar progresso */
  private onProgressCallback: ((progress: UploadProgress) => void) | null = null;

  constructor(retryConfig: Partial<RetryConfig> = {}) {
    this.retryExecutor = new RetryExecutor({ ...DEFAULT_RETRY_CONFIG, ...retryConfig });
  }

  // Persistência
  private async saveState(): Promise<void> {
    if (!this.captureId) {
      return;
    }
    await chrome.storage.local.set({
      [`upload_state_${this.captureId}`]: {
        uploadId: this.uploadId,
        s3Key: this.s3Key,
        parts: this.parts,
        captureId: this.captureId,
        nextPartNumber: this.nextPartNumber,
      },
    });
  }

  async loadState(captureId: string): Promise<boolean> {
    const key = `upload_state_${captureId}`;
    const result = await chrome.storage.local.get(key);
    const state = result[key];
    if (state) {
      this.uploadId = state.uploadId;
      this.s3Key = state.s3Key;
      this.parts = state.parts ?? [];
      this.captureId = state.captureId;
      this.nextPartNumber = state.nextPartNumber ?? this.parts.length + 1;
      return true;
    }
    return false;
  }

  private async clearState(): Promise<void> {
    if (!this.captureId) {
      return;
    }
    await chrome.storage.local.remove(`upload_state_${this.captureId}`);
  }

  private reset(): void {
    this.uploadId = null;
    this.captureId = null;
    this.s3Key = null;
    this.parts = [];
    this.chunkBuffer = [];
    this.bufferSize = 0;
    this.nextPartNumber = 1;
    this.flushMutex = Promise.resolve();
    this.isFlushingBuffer = false;
    // Reset de progresso
    this.totalBytesReceived = 0;
    this.bytesUploaded = 0;
    this.uploadStatus = 'idle';
  }

  private async garantirEstadoCarregado(captureId?: string): Promise<void> {
    if (!this.uploadId && captureId) {
      await this.loadState(captureId);
    }
    if (!this.captureId && captureId) {
      this.captureId = captureId;
    }
  }

  private validarEstadoUpload(partNumber: number): void {
    if (!this.uploadId || !this.captureId) {
      throw new MultipartUploadError('Upload não foi iniciado', 0, false);
    }
    if (partNumber < 1) {
      throw new MultipartUploadError('Número da part deve ser >= 1', 0, false);
    }
  }

  /**
   * Inicia upload multipart
   */
  async initiate(captureId: string, storageType: string): Promise<InitiateUploadResult> {
    if (!captureId) {
      log.error('[MultipartUpload] Erro: captureId é obrigatório');
      throw new MultipartUploadError('ID da captura é obrigatório', 0, false);
    }

    try {
      const apiClient = getAPIClient();
      const result = await apiClient.post<InitiateUploadResult>(
        '/video/start',
        { captureId, storageType },
        { authenticated: true }
      );

      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Falha desconhecida na API');
      }

      const dados = normalizarRespostaStart(result.data);
      this.uploadId = dados.uploadId;
      this.captureId = dados.captureId || captureId;
      this.s3Key = dados.s3Key;
      this.parts = [];
      this.nextPartNumber = 1;
      
      // Inicializa rastreamento de progresso
      this.totalBytesReceived = 0;
      this.bytesUploaded = 0;
      this.setUploadStatus('uploading');

      await this.saveState();

      if (!this.uploadId) {
        throw new Error('API retornou sucesso mas uploadId está vazio');
      }

      log.info('[MultipartUpload] Upload iniciado', {
        uploadId: this.uploadId.substring(0, 20) + '...',
        captureId: this.captureId,
      });

      return { uploadId: this.uploadId, captureId: this.captureId, s3Key: this.s3Key };
    } catch (error) {
      log.error('[MultipartUpload] Falha ao iniciar upload:', error instanceof Error ? error.message : String(error));
      this.setUploadStatus('failed');
      throw new MultipartUploadError(
        `Falha ao iniciar upload multipart: ${error instanceof Error ? error.message : String(error)}`,
        1,
        false
      );
    }
  }

  /**
   * Adiciona chunk ao buffer e envia quando atingir tamanho mínimo (5MB)
   * 
   * Usa mutex interno para evitar race condition quando múltiplos chunks
   * chegam rapidamente e disparam flushBuffer() concorrentemente.
   */
  async addChunk(
    chunk: Blob,
    hash: string,
    previousHash: string | null = null,
    captureId?: string
  ): Promise<UploadPartResult | null> {
    await this.garantirEstadoCarregado(captureId);

    this.chunkBuffer.push({ blob: chunk, hash, previousHash });
    this.bufferSize += chunk.size;
    
    // Rastreia bytes recebidos para progresso
    this.totalBytesReceived += chunk.size;
    this.notifyProgress();

    log.info('[MultipartUpload] Chunk adicionado ao buffer', {
      chunkSize: chunk.size,
      bufferSize: this.bufferSize,
      bufferCount: this.chunkBuffer.length,
      minRequired: MIN_PART_SIZE,
    });

    // Verifica se deve fazer flush, mas usa mutex para serializar
    if (this.bufferSize >= MIN_PART_SIZE && !this.isFlushingBuffer) {
      return this.flushBufferWithMutex();
    }
    return null;
  }

  /**
   * Executa flushBuffer() com mutex para evitar race conditions.
   * Garante que apenas uma operação de flush ocorra por vez.
   */
  private async flushBufferWithMutex(): Promise<UploadPartResult | null> {
    // Encadeia a operação no mutex existente
    const previousMutex = this.flushMutex;
    let resolveCurrentMutex: () => void;
    
    this.flushMutex = new Promise<void>((resolve) => {
      resolveCurrentMutex = resolve;
    });

    try {
      // Aguarda operação anterior completar
      await previousMutex;
      return await this.flushBufferInternal();
    } finally {
      resolveCurrentMutex!();
    }
  }

  /**
   * Força envio do buffer atual (uso público)
   */
  async flushBuffer(): Promise<UploadPartResult | null> {
    return this.flushBufferWithMutex();
  }

  /**
   * Implementação interna do flush - NÃO chamar diretamente, usar flushBuffer()
   */
  private async flushBufferInternal(): Promise<UploadPartResult | null> {
    // Double-check após adquirir o mutex
    if (this.chunkBuffer.length === 0) {
      return null;
    }

    this.isFlushingBuffer = true;

    try {
      // Captura o partNumber ANTES de qualquer operação assíncrona
      const currentPartNumber = this.nextPartNumber;
      this.nextPartNumber++;

      const blobs = this.chunkBuffer.map((c) => c.blob);
      const combinedBlob = new Blob(blobs, { type: 'video/webm' });
      const primeiroChunk = this.chunkBuffer[0];

      // CORREÇÃO FORENSE: Calcula hash SHA-256 do blob COMPLETO, não concatenação de hashes
      // Isso garante que o hash corresponde exatamente ao conteúdo enviado ao S3
      // Ver: NIST SP 800-106, ISO 27037 - requisitos de integridade forense
      const hashCombinado = await calcularHashSHA256BlobIncremental(combinedBlob);
      
      // Guarda tamanho para atualizar progresso após upload
      const blobSize = combinedBlob.size;

      // Limpa o buffer ANTES do upload para evitar reprocessamento
      const chunksParaEnviar = this.chunkBuffer.length;
      this.chunkBuffer = [];
      this.bufferSize = 0;

      log.info('[MultipartUpload] Enviando buffer combinado', {
        partNumber: currentPartNumber,
        totalChunks: chunksParaEnviar,
        totalSize: blobSize,
        nextPartNumber: this.nextPartNumber,
      });

      const result = await this.uploadPart(
        combinedBlob, 
        currentPartNumber, 
        hashCombinado, 
        primeiroChunk?.previousHash ?? null
      );
      
      // Atualiza bytes enviados e notifica progresso
      this.bytesUploaded += blobSize;
      this.notifyProgress();

      await this.saveState();

      return result;
    } finally {
      this.isFlushingBuffer = false;
    }
  }

  /**
   * Faz upload de uma part diretamente
   */
  async uploadPart(
    chunk: Blob,
    partNumber: number,
    hash: string,
    previousHash: string | null = null,
    captureId?: string
  ): Promise<UploadPartResult> {
    await this.garantirEstadoCarregado(captureId);
    this.validarEstadoUpload(partNumber);

    const checksumSha256 = await calcularHashSHA256Base64(chunk);
    console.warn(`[MultipartUpload] SHA-256 calculado para part ${partNumber}:`, checksumSha256.substring(0, 10) + '...');

    const { presignedUrl, returnedChecksum } = await this.obterPresignedUrl(partNumber, hash, previousHash, checksumSha256, chunk.size);
    const result = await this.enviarParaS3(chunk, partNumber, presignedUrl, returnedChecksum);

    this.parts.push({ partNumber: result.partNumber, etag: result.etag });
    await this.saveState();

    return result;
  }

  private async obterPresignedUrl(
    partNumber: number,
    hash: string,
    previousHash: string | null,
    checksumSha256: string,
    sizeBytes: number
  ): Promise<{ presignedUrl: string; returnedChecksum: string }> {
    try {
      const apiClient = getAPIClient();
      
      // Log detalhado do payload enviado
      const payload = {
        captureId: this.captureId,
        uploadId: this.uploadId,
        partNumber,
        chunkHash: hash,
        sizeBytes,
        checksumSha256,
        previousChunkHash: previousHash,
      };
      
      log.info('[MultipartUpload] Enviando requisição para /video/chunk', {
        partNumber,
        sizeBytes,
        checksumSha256: checksumSha256.substring(0, 20) + '...',
        captureId: this.captureId,
        uploadId: this.uploadId?.substring(0, 20) + '...',
      });
      
      const response = await apiClient.post<{ presignedUrl: string; checksumSha256: string }>(
        '/video/chunk',
        payload,
        { authenticated: true }
      );

      log.info('[MultipartUpload] Resposta de /video/chunk', {
        success: response.success,
        hasData: !!response.data,
        error: response.error,
      });

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Falha ao obter URL de upload');
      }

      const dados = normalizarRespostaChunk(response.data);
      const presignedUrl = dados.presignedUrl;
      const returnedChecksum = dados.checksumSha256 || checksumSha256;

      if (!presignedUrl || typeof presignedUrl !== 'string') {
        throw new Error('API não retornou presignedUrl válida');
      }

      try {
        new URL(presignedUrl);
      } catch {
        throw new Error(`presignedUrl inválida: ${presignedUrl.substring(0, 50)}...`);
      }

      console.warn(`[MultipartUpload] Presigned URL obtida para part ${partNumber}`, {
        urlLength: presignedUrl.length,
        checksumRetornado: returnedChecksum.substring(0, 20) + '...',
      });
      return { presignedUrl, returnedChecksum };
    } catch (error) {
      log.error('[MultipartUpload] Erro ao obter presigned URL', {
        partNumber,
        erro: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new MultipartUploadError(
        `Falha ao obter URL de upload: ${error instanceof Error ? error.message : String(error)}`,
        0,
        false
      );
    }
  }

  private async enviarParaS3(
    chunk: Blob,
    partNumber: number,
    presignedUrl: string,
    checksumSha256: string
  ): Promise<UploadPartResult> {
    let attempts = 0;

    return this.retryExecutor.execute(async () => {
      attempts++;
      console.warn(`[MultipartUpload] Tentativa ${attempts} de upload da part ${partNumber}...`);

      const fetchResponse = await fetch(presignedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/webm', 'x-amz-checksum-sha256': checksumSha256 },
        body: chunk,
        credentials: 'omit',
        mode: 'cors',
      });

      if (!fetchResponse.ok) {
        const errorText = await fetchResponse.text();
        console.error(`[MultipartUpload] S3 retornou erro ${fetchResponse.status}:`, errorText);
        throw new Error(`S3 retornou ${fetchResponse.status}: ${errorText.substring(0, 200)}`);
      }

      const etag = fetchResponse.headers.get('etag');
      console.warn(`[MultipartUpload] Part ${partNumber} enviada com sucesso`, { status: fetchResponse.status, etag });

      if (!etag) {
        throw new Error('ETag não retornado pelo S3');
      }

      return { partNumber, etag: etag.replace(/"/g, ''), attempts };
    }, `Falha ao fazer upload da part ${partNumber}`);
  }

  /**
   * Completa upload multipart
   *
   * @param captureId - ID da captura (opcional se já carregado do estado)
   * @param previewData - Dados de preview opcionais para enviar ao backend
   */
  async complete(captureId?: string, previewData?: VideoPreviewData): Promise<CompleteUploadResult> {
    if (this.chunkBuffer.length > 0) {
      log.info('[MultipartUpload] Enviando buffer pendente antes de completar...');
      await this.flushBuffer();
    }

    await this.garantirEstadoCarregado(captureId);

    if (!this.uploadId || !this.captureId) {
      throw new MultipartUploadError('Upload não foi iniciado', 0, false);
    }
    if (this.parts.length === 0) {
      throw new MultipartUploadError('Nenhuma part foi enviada', 0, false);
    }

    // Atualiza status para 'completing'
    this.setUploadStatus('completing');

    const sortedParts = [...this.parts].sort((a, b) => a.partNumber - b.partNumber);

    // Monta payload com dados obrigatórios e opcionais de preview
    const payload: Record<string, unknown> = {
      captureId: this.captureId,
      uploadId: this.uploadId,
      parts: sortedParts,
    };

    // Adiciona dados de preview se fornecidos
    if (previewData) {
      if (previewData.originalUrl) {
        payload['originalUrl'] = previewData.originalUrl;
      }
      if (previewData.pageTitle) {
        payload['pageTitle'] = previewData.pageTitle;
      }
      if (previewData.contentHash) {
        payload['contentHash'] = previewData.contentHash;
      }
      if (previewData.dimensions) {
        payload['dimensions'] = previewData.dimensions;
      }
      if (previewData.fileSize !== undefined) {
        payload['fileSize'] = previewData.fileSize;
      }
      if (previewData.durationMs !== undefined) {
        payload['durationMs'] = previewData.durationMs;
      }
      if (previewData.metadata) {
        payload['metadata'] = previewData.metadata;
      }

      log.info('[MultipartUpload] Enviando dados de preview:', {
        hasOriginalUrl: !!previewData.originalUrl,
        hasContentHash: !!previewData.contentHash,
        hasDimensions: !!previewData.dimensions,
        fileSize: previewData.fileSize,
        durationMs: previewData.durationMs,
      });
    }

    try {
      const apiClient = getAPIClient();
      const response = await apiClient.post<CompleteUploadResult>(
        '/video/complete',
        payload,
        { authenticated: true }
      );

      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Falha ao completar upload');
      }

      const dados = normalizarRespostaComplete(response.data);
      log.info('[MultipartUpload] Upload completado com sucesso', { totalParts: this.parts.length, s3Key: dados.s3Key });

      // Atualiza status para 'completed'
      this.setUploadStatus('completed');

      await this.clearState();
      return { url: dados.url, s3Key: dados.s3Key, totalParts: this.parts.length };
    } catch (error) {
      // Atualiza status para 'failed'
      this.setUploadStatus('failed');
      throw new MultipartUploadError(
        `Falha ao completar upload multipart: ${error instanceof Error ? error.message : String(error)}`,
        0,
        false
      );
    }
  }

  /**
   * Aborta upload multipart
   */
  async abort(captureId?: string): Promise<void> {
    await this.garantirEstadoCarregado(captureId);
    if (!this.uploadId || !this.captureId) {
      return;
    }

    try {
      const apiClient = getAPIClient();
      await apiClient.post('/video/cancel', { captureId: this.captureId, uploadId: this.uploadId }, { authenticated: true });
      log.info('[MultipartUpload] Upload abortado com sucesso');
    } catch (error) {
      log.error('[MultipartUpload] Erro ao abortar upload (best-effort):', error);
    } finally {
      await this.clearState();
      this.reset();
    }
  }

  // Getters
  getPartsCount(): number { return this.parts.length; }
  getParts(): UploadPart[] { return [...this.parts]; }
  isInProgress(): boolean { return this.uploadId !== null; }
  getUploadId(): string | null { return this.uploadId; }
  getS3Key(): string | null { return this.s3Key; }
  getBufferSize(): number { return this.bufferSize; }
  getBufferCount(): number { return this.chunkBuffer.length; }

  // ============================================================================
  // Métodos de Progresso de Upload (Requisito 7.8)
  // ============================================================================

  /**
   * Obtém o progresso atual do upload
   * 
   * Retorna informações sobre chunks enviados, bytes transferidos e status.
   * Usado pelo Side Panel para exibir progresso ao usuário.
   * 
   * @returns Objeto UploadProgress com estado atual
   * @see Requisito 7.8: Side Panel exibe progresso (chunks uploaded / total)
   */
  getProgress(): UploadProgress {
    // Estima total de chunks baseado no buffer atual e parts enviadas
    // Como não sabemos o tamanho total do vídeo antecipadamente,
    // usamos parts.length + 1 se há buffer pendente
    const chunksTotal = this.parts.length + (this.bufferSize > 0 ? 1 : 0);
    
    return {
      chunksUploaded: this.parts.length,
      chunksTotal,
      bytesUploaded: this.bytesUploaded,
      bytesTotal: this.totalBytesReceived,
      status: this.uploadStatus,
    };
  }

  /**
   * Registra callback para notificação de progresso
   * 
   * O callback é chamado sempre que há mudança no progresso do upload:
   * - Quando um chunk é adicionado ao buffer
   * - Quando uma part é enviada ao S3
   * - Quando o status muda (uploading, completing, completed, failed)
   * 
   * @param callback - Função a ser chamada com UploadProgress
   * @see Requisito 7.8: Enviar UPLOAD_PROGRESS para Side Panel
   */
  onProgress(callback: (progress: UploadProgress) => void): void {
    this.onProgressCallback = callback;
  }

  /**
   * Notifica progresso via callback registrado
   * @internal
   */
  private notifyProgress(): void {
    if (this.onProgressCallback) {
      this.onProgressCallback(this.getProgress());
    }
  }

  /**
   * Atualiza status do upload e notifica
   * @internal
   */
  private setUploadStatus(status: UploadStatus): void {
    this.uploadStatus = status;
    this.notifyProgress();
  }
}

export default MultipartUploadService;
