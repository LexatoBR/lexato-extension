/**
 * Serviço de Upload Unificado
 *
 * Gerencia o upload seguro das evidências para o S3.
 * Orquestra o envio dos artefatos obrigatórios:
 *
 * Estrutura no S3:
 * evidences/{evidenceId}/
 * ├── video.webm (ou screenshot.png)
 * ├── html/
 * │   ├── initial.html
 * │   ├── final.html
 * │   └── navigation/
 * │       ├── 001_{timestamp}.html
 * │       └── ...
 * ├── forensic-metadata.json
 * ├── integrity.json
 * ├── timestamp.tsr (ou timestamp.json)
 * └── certificate.pdf (após aprovação)
 *
 * @module UploadService
 */

import { getAPIClient, type APIClient } from '../../background/api-client';
import { AuditLogger } from '../audit-logger';
import { calcularHashSHA256Base64, calcularHashSHA256Blob } from './crypto-helper';
import { MultipartUploadService, type VideoPreviewData } from '../multipart-upload';
import type {
  CaptureResult,
  TimestampResult,
  UploadResult,
  PipelineProgressCallback,
  StorageConfig,
  HtmlSnapshot,
} from './types';

/**
 * Limite para upload simples (5MB)
 * Acima disso, usa Multipart Upload
 */
const MULTIPART_THRESHOLD = 5 * 1024 * 1024;

/**
 * Normaliza o contentType removendo parâmetros como codecs
 * 
 * O MediaRecorder gera blobs com mimeType como 'video/webm;codecs=vp9'
 * mas a API espera apenas 'video/webm' para validação.
 * 
 * @param contentType - Tipo de conteúdo original (pode incluir parâmetros)
 * @returns Tipo de conteúdo normalizado (apenas tipo/subtipo)
 * 
 * @example
 * normalizeContentType('video/webm;codecs=vp9') // 'video/webm'
 * normalizeContentType('image/png') // 'image/png'
 */
function normalizeContentType(contentType: string): string {
  // Remove parâmetros após o ponto-e-vírgula (ex: codecs=vp9)
  const normalized = contentType.split(';')[0]?.trim() ?? contentType;
  return normalized;
}

/**
 * Interface para resposta de URL pré-assinada
 * IMPORTANTE: Campos devem corresponder ao schema do backend (PresignUploadResponseSchema)
 */
interface PresignedUrlResponse {
  evidenceId: string;
  uploadUrl: string;
  bucket: string;
  key: string;
  expiresAt: string;
  expiresInSeconds: number;
  conditions: {
    contentType: string;
    maxContentLength: number;
  };
}

/**
 * Serviço responsável pelo upload seguro de evidências digitais para o S3.
 * 
 * Gerencia uploads simples (PUT com presigned URL) e multipart para arquivos grandes.
 * Suporta cancelamento, progresso granular e validação de integridade via SHA-256.
 * 
 * @example
 * const uploadService = new UploadService();
 * const resultado = await uploadService.upload(captura, timestamp, config, onProgress);
 */
export class UploadService {
  private _client: APIClient | null;
  private logger: AuditLogger;
  private multipartService: MultipartUploadService;
  private isCancelled = false;
  private activeUploads: AbortController[] = [];
  /** Dados de preview armazenados para enviar ao backend durante upload multipart */
  private videoPreviewData: VideoPreviewData | null = null;

  /**
   * Cria uma nova instância do serviço de upload.
   * @param client - Cliente API opcional (lazy initialization se não fornecido)
   * @param logger - Logger de auditoria opcional
   */
  constructor(client?: APIClient, logger?: AuditLogger) {
    this._client = client ?? null;
    this.logger = logger ?? new AuditLogger();
    this.multipartService = new MultipartUploadService();
  }

  /**
   * Obtém o cliente API (lazy initialization)
   */
  private get client(): APIClient {
    this._client ??= getAPIClient();
    return this._client;
  }

  /**
   * Realiza o upload completo da evidência para o S3.
   * 
   * Envia todos os artefatos obrigatórios: mídia (vídeo/screenshot), HTMLs,
   * metadados forenses, dados de integridade e carimbo de tempo.
   * 
   * @param capture - Resultado da captura contendo mídia e metadados
   * @param timestamp - Resultado do carimbo de tempo ICP-Brasil
   * @param storageConfig - Configuração de armazenamento (classe S3)
   * @param onProgress - Callback opcional para acompanhamento do progresso
   * @returns Resultado do upload com URLs e chaves S3
   * @throws Error se o upload falhar ou for cancelado
   */
  async upload(
    capture: CaptureResult,
    timestamp: TimestampResult,
    storageConfig: StorageConfig,
    onProgress?: PipelineProgressCallback
  ): Promise<UploadResult> {
    this.isCancelled = false;

    // Armazenar dados de preview para envio durante /video/complete
    // Isso garante que os campos necessários para o preview sejam salvos no Supabase
    const previewData: VideoPreviewData = {
      originalUrl: capture.forensicMetadata.url,
      pageTitle: capture.forensicMetadata.title,
      contentHash: capture.media.hash,
      fileSize: capture.media.sizeBytes,
      metadata: {
        videoCapture: {
          totalChunks: capture.videoData?.totalChunks,
          durationMs: capture.videoData?.durationSeconds ? capture.videoData.durationSeconds * 1000 : undefined,
        },
      },
    };

    // Adicionar dimensions apenas se disponíveis (evita undefined com exactOptionalPropertyTypes)
    if (capture.forensicMetadata.viewport?.width && capture.forensicMetadata.viewport?.height) {
      previewData.dimensions = {
        width: capture.forensicMetadata.viewport.width,
        height: capture.forensicMetadata.viewport.height,
      };
    }

    // Adicionar durationMs apenas se disponível
    if (capture.videoData?.durationSeconds) {
      previewData.durationMs = capture.videoData.durationSeconds * 1000;
    }

    this.videoPreviewData = previewData;

    // Criar logger com contexto do upload para rastreabilidade
    const uploadLogger = this.logger.withContext({
      captureId: capture.evidenceId,
      type: capture.type,
    });

    // Determinar método de upload antecipadamente
    const uploadMethod = capture.media.sizeBytes >= MULTIPART_THRESHOLD ? 'multipart' : 'simple';
    
    uploadLogger.info('UPLOAD', 'UPLOAD_START', { 
      evidenceId: capture.evidenceId,
      method: uploadMethod,
      mediaSizeBytes: capture.media.sizeBytes,
      mediaType: capture.media.mimeType,
      storageClass: storageConfig.storageClass,
      threshold: MULTIPART_THRESHOLD,
    });

    const startTime = Date.now();
    let totalBytesUploaded = 0;
    let filesCount = 0;

    // Preparar metadados com timestamp ICP-Brasil para PDF Worker
    const enhancedMetadata = {
      ...capture.forensicMetadata,
      tsr_timestamp: timestamp.appliedAt,
      tsr_authority: timestamp.tsa,
      tsr_token: timestamp.tokenBase64,
    };

    // Preparar blobs
    const metadataBlob = new Blob([JSON.stringify(enhancedMetadata, null, 2)], {
      type: 'application/json',
    });

    const integrityData = {
      evidenceId: capture.evidenceId,
      mediaHash: capture.media.hash,
      htmlHashes: {
        initial: capture.htmlCollection?.initial.hash ?? capture.html.hash,
        final: capture.htmlCollection?.final.hash,
        navigations: capture.htmlCollection?.navigations.map((n) => ({
          sequence: n.sequence,
          url: n.url,
          hash: n.hash,
        })),
        combined: capture.htmlCollection?.combinedHash,
      },
      metadataHash: capture.metadataHash,
      merkleRoot: capture.merkleRoot,
      timestamp: {
        type: timestamp.type,
        tokenHash: timestamp.tokenHash,
        appliedAt: timestamp.appliedAt,
        tsa: timestamp.tsa,
      },
      generatedAt: new Date().toISOString(),
    };

    const integrityBlob = new Blob([JSON.stringify(integrityData, null, 2)], {
      type: 'application/json',
    });

    // Timestamp blob
    let timestampBlob: Blob;
    if (timestamp.tokenBase64) {
      // Converter Base64 para ArrayBuffer para criar o blob TSR
      const binaryString = atob(timestamp.tokenBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      timestampBlob = new Blob([bytes.buffer], { type: 'application/timestamp-reply' });
    } else {
      timestampBlob = new Blob([JSON.stringify(timestamp, null, 2)], { type: 'application/json' });
    }

    // Calcular tamanho total para progresso
    const htmlTotalSize = capture.htmlCollection?.totalSizeBytes ?? capture.html.sizeBytes;
    const totalBytes =
      capture.media.sizeBytes +
      htmlTotalSize +
      metadataBlob.size +
      integrityBlob.size +
      timestampBlob.size;

    // Helper para atualizar progresso
    const updateProgress = (bytes: number, message?: string) => {
      totalBytesUploaded += bytes;
      if (onProgress) {
        // Calcular progresso dentro da fase de upload (40% a 85%)
        // A fase de upload tem 45% do progresso total (85 - 40)
        const uploadPhaseStart = 40;
        const uploadPhaseEnd = 85;
        const uploadPhaseRange = uploadPhaseEnd - uploadPhaseStart;

        // Calcular percentual dentro da fase de upload
        const uploadPercent = (totalBytesUploaded / totalBytes) * 100;
        // Mapear para o range da fase
        const mappedPercent = uploadPhaseStart + (uploadPercent * uploadPhaseRange / 100);

        onProgress({
          evidenceId: capture.evidenceId,
          status: 'UPLOADING',
          phase: 3,
          phaseName: 'upload',
          percent: Math.min(uploadPhaseEnd, Math.round(mappedPercent)),
          message:
            message ??
            `Enviando arquivos... (${Math.round(totalBytesUploaded / 1024)}KB / ${Math.round(totalBytes / 1024)}KB)`,
          updatedAt: new Date().toISOString(),
          details: {
            bytesUploaded: totalBytesUploaded,
            totalBytes,
          },
        });
      }
    };

    try {
      const urls: UploadResult['urls'] = {
        media: '',
        html: { initial: '', final: '', navigations: [] },
        metadata: '',
        integrity: '',
        timestamp: '',
      };

      const s3Keys: UploadResult['s3Keys'] = {
        media: '',
        html: { initial: '', final: '', navigations: [] },
        metadata: '',
        integrity: '',
        timestamp: '',
      };

      // 1. Upload da Mídia Principal (maior arquivo)
      const isVideo = capture.type === 'video';
      const mediaExtension = isVideo ? 'webm' : 'png';
      const mediaFilename = isVideo ? 'video' : 'screenshot';
      const mediaSizeKB = Math.round(capture.media.sizeBytes / 1024);

      updateProgress(0, isVideo
        ? `[1/5] Enviando vídeo (${mediaSizeKB}KB)...`
        : `[1/5] Enviando screenshot (${mediaSizeKB}KB)...`);

      // Key relativa - backend adiciona prefixo evidences/{evidenceId}/
      const mediaKey = `${mediaFilename}.${mediaExtension}`;
      s3Keys.media = `evidences/${capture.evidenceId}/${mediaKey}`;

      urls.media = await this.uploadFile(
        capture.media.blob,
        mediaKey,
        capture.evidenceId,
        capture.media.mimeType,
        storageConfig.storageClass,
        (bytes) => updateProgress(bytes, `[1/5] Screenshot enviado ✓`)
      );
      filesCount++;

      // 2. Upload dos HTMLs
      updateProgress(0, '[2/5] Enviando código HTML da página...');

      if (capture.htmlCollection) {
        // 2a. HTML Inicial
        const initialHtmlKey = 'html/initial.html';
        s3Keys.html.initial = `evidences/${capture.evidenceId}/${initialHtmlKey}`;
        urls.html.initial = await this.uploadHtmlSnapshot(
          capture.htmlCollection.initial,
          initialHtmlKey,
          capture.evidenceId
        );
        updateProgress(capture.htmlCollection.initial.sizeBytes, '[2/5] HTML inicial enviado...');
        filesCount++;

        // 2b. HTML Final
        const finalHtmlKey = 'html/final.html';
        s3Keys.html.final = `evidences/${capture.evidenceId}/${finalHtmlKey}`;
        urls.html.final = await this.uploadHtmlSnapshot(
          capture.htmlCollection.final,
          finalHtmlKey,
          capture.evidenceId
        );
        updateProgress(capture.htmlCollection.final.sizeBytes, '[2/5] HTML final enviado ✓');
        filesCount++;

        // 2c. HTMLs de Navegação
        const navigations = capture.htmlCollection.navigations;
        const totalNavs = navigations.length;
        for (let i = 0; i < totalNavs; i++) {
          const nav = navigations[i];
          if (!nav) {
            continue;
          }

          const seq = String(nav.sequence ?? 0).padStart(3, '0');
          const navTimestamp = nav.capturedAt.replace(/[:.]/g, '-');
          const navKey = `html/navigation/${seq}_${navTimestamp}.html`;

          s3Keys.html.navigations.push(`evidences/${capture.evidenceId}/${navKey}`);
          const navUrl = await this.uploadHtmlSnapshot(nav, navKey, capture.evidenceId);
          urls.html.navigations.push(navUrl);
          updateProgress(nav.sizeBytes, `[2/5] Navegação ${i + 1}/${totalNavs} enviada...`);
          filesCount++;
        }
      } else {
        // Fallback: HTML único (compatibilidade com screenshots)
        const singleHtmlKey = 'html/initial.html';
        s3Keys.html.initial = `evidences/${capture.evidenceId}/${singleHtmlKey}`;
        const htmlBlob = new Blob([capture.html.content], { type: 'text/html' });
        urls.html.initial = await this.uploadSimple(
          htmlBlob,
          singleHtmlKey,
          capture.evidenceId,
          'text/html'
        );
        updateProgress(capture.html.sizeBytes, '[2/5] HTML enviado ✓');
        filesCount++;
      }

      // 3. Upload dos Metadados Forenses
      updateProgress(0, '[3/5] Enviando metadados forenses...');
      const metadataKey = 'forensic-metadata.json';
      s3Keys.metadata = `evidences/${capture.evidenceId}/${metadataKey}`;
      urls.metadata = await this.uploadSimple(
        metadataBlob,
        metadataKey,
        capture.evidenceId,
        'application/json'
      );
      updateProgress(metadataBlob.size, '[3/5] Metadados enviados ✓');
      filesCount++;

      // 4. Upload do Arquivo de Integridade
      updateProgress(0, '[4/5] Enviando dados de integridade...');
      const integrityKey = 'integrity.json';
      s3Keys.integrity = `evidences/${capture.evidenceId}/${integrityKey}`;
      urls.integrity = await this.uploadSimple(
        integrityBlob,
        integrityKey,
        capture.evidenceId,
        'application/json'
      );
      updateProgress(integrityBlob.size, '[4/5] Integridade enviada ✓');
      filesCount++;

      // 5. Upload do Timestamp
      updateProgress(0, '[5/5] Enviando carimbo de tempo...');
      const timestampExtension = timestamp.type === 'ICP_BRASIL' ? 'tsr' : 'json';
      const timestampKey = `timestamp.${timestampExtension}`;
      s3Keys.timestamp = `evidences/${capture.evidenceId}/${timestampKey}`;
      urls.timestamp = await this.uploadSimple(
        timestampBlob,
        timestampKey,
        capture.evidenceId,
        timestampBlob.type
      );
      updateProgress(timestampBlob.size, '[5/5] Carimbo de tempo enviado ✓');
      filesCount++;

      uploadLogger.info('UPLOAD', 'UPLOAD_COMPLETE', {
        evidenceId: capture.evidenceId,
        method: uploadMethod,
        filesCount,
        totalBytes: totalBytesUploaded,
        durationMs: Date.now() - startTime,
        s3Keys: Object.keys(s3Keys).length,
      });

      return {
        evidenceId: capture.evidenceId,
        urls,
        s3Keys,
        uploadMethod,
        stats: {
          totalBytes: totalBytesUploaded,
          durationMs: Date.now() - startTime,
          filesCount,
        },
      };
    } catch (error) {
      uploadLogger.error('UPLOAD', 'UPLOAD_FAILED', {
        evidenceId: capture.evidenceId,
        method: uploadMethod,
        filesUploaded: filesCount,
        bytesUploaded: totalBytesUploaded,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Upload de um snapshot HTML
   */
  private async uploadHtmlSnapshot(
    snapshot: HtmlSnapshot,
    key: string,
    captureId: string
  ): Promise<string> {
    const blob = new Blob([snapshot.content], { type: 'text/html' });
    return this.uploadSimple(blob, key, captureId, 'text/html');
  }

  /**
   * Decide entre upload simples ou multipart
   *
   * IMPORTANTE: Multipart upload só é usado para vídeos (video/webm).
   * Screenshots (image/png) SEMPRE usam upload simples, independente do tamanho,
   * pois os endpoints de multipart (/video/start, /video/chunk, /video/complete)
   * são específicos para vídeos e resultariam em arquivo com nome incorreto.
   */
  private async uploadFile(
    file: Blob,
    key: string,
    captureId: string,
    contentType: string,
    storageClass: string,
    onProgress: (bytes: number) => void
  ): Promise<string> {
    // Normaliza content type removendo parâmetros (ex: video/webm;codecs=vp9 -> video/webm)
    const normalizedType = contentType.split(';')[0]?.trim() ?? contentType;

    // Verifica se é vídeo - apenas vídeos usam multipart upload
    // Screenshots (image/*) sempre usam upload simples
    const isVideo = normalizedType.startsWith('video/');

    if (isVideo && file.size >= MULTIPART_THRESHOLD) {
      this.logger.info('UPLOAD', 'USING_MULTIPART', {
        captureId,
        key,
        sizeBytes: file.size,
        contentType: normalizedType,
        threshold: MULTIPART_THRESHOLD,
      });
      return this.uploadMultipart(file, captureId, storageClass, onProgress);
    } else {
      if (!isVideo && file.size >= MULTIPART_THRESHOLD) {
        this.logger.info('UPLOAD', 'USING_SIMPLE_FOR_LARGE_IMAGE', {
          captureId,
          key,
          sizeBytes: file.size,
          contentType: normalizedType,
          reason: 'Multipart upload é apenas para vídeos',
        });
      }
      const url = await this.uploadSimple(file, key, captureId, contentType);
      onProgress(file.size);
      return url;
    }
  }

  /**
   * Realiza upload simples (PUT com presigned URL)
   */
  private async uploadSimple(
    file: Blob,
    key: string,
    captureId: string,
    contentType: string
  ): Promise<string> {
    if (this.isCancelled) {
      throw new Error('Upload cancelado');
    }

    const stopTimer = this.logger.startTimer('uploadSimple');

    // Normalizar contentType para remover parâmetros como codecs
    // Ex: 'video/webm;codecs=vp9' -> 'video/webm'
    const normalizedContentType = normalizeContentType(contentType);

    this.logger.info('UPLOAD', 'SIMPLE_UPLOAD_START', {
      captureId,
      key,
      contentType: normalizedContentType,
      originalContentType: contentType !== normalizedContentType ? contentType : undefined,
      sizeBytes: file.size,
    });

    // Calcular SHA-256 para Object Lock Compliance
    const checksumSha256 = await calcularHashSHA256Base64(file);

    // 1. Obter Presigned URL (usar contentType normalizado para validação da API)
    const response = await this.client.post<PresignedUrlResponse>('/upload/presign', {
      evidenceId: captureId,
      key,
      contentType: normalizedContentType,
      contentLength: file.size,
      checksumSha256,
      storageType: 'standard', // TODO: obter do storageConfig quando disponível
    });

    if (!response.success || !response.data) {
      this.logger.error('UPLOAD', 'PRESIGNED_URL_FAILED', {
        captureId,
        key,
        error: response.error ?? 'Resposta inválida',
      });
      throw new Error(response.error ?? 'Falha ao obter URL de upload');
    }

    const { uploadUrl } = response.data;

    this.logger.info('UPLOAD', 'PRESIGNED_URL_RECEIVED', {
      captureId,
      key,
      urlLength: uploadUrl.length,
      urlPrefix: uploadUrl.substring(0, 50),
    });

    // 2. Fazer PUT com header SHA-256
    // Usar contentType normalizado também no PUT para consistência
    const controller = new AbortController();
    this.activeUploads.push(controller);

    try {
      const putResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': normalizedContentType,
          'x-amz-checksum-sha256': checksumSha256,
        },
        body: file,
        signal: controller.signal,
      });

      if (!putResponse.ok) {
        const errorText = await putResponse.text().catch(() => 'Erro ao ler resposta');
        this.logger.error('UPLOAD', 'S3_PUT_FAILED', {
          captureId,
          key,
          status: putResponse.status,
          statusText: putResponse.statusText,
          errorBody: errorText.substring(0, 500),
        });
        throw new Error(`Erro no upload S3: ${putResponse.status} - ${putResponse.statusText}`);
      }

      const durationMs = stopTimer();
      this.logger.info('UPLOAD', 'SIMPLE_UPLOAD_COMPLETE', {
        captureId,
        key,
        sizeBytes: file.size,
        durationMs,
      });

      return uploadUrl.split('?')[0] ?? uploadUrl;
    } finally {
      const index = this.activeUploads.indexOf(controller);
      if (index > -1) {
        this.activeUploads.splice(index, 1);
      }
    }
  }

  /**
   * Wrapper para Multipart Upload
   */
  private async uploadMultipart(
    file: Blob,
    captureId: string,
    storageClass: string,
    onProgress: (bytes: number) => void
  ): Promise<string> {
    const stopTimer = this.logger.startTimer('uploadMultipart');
    const totalParts = Math.ceil(file.size / (1 * 1024 * 1024));

    // Mapear storageClass (formato interno) para storageType (formato API)
    const storageTypeMap: Record<string, string> = {
      'STANDARD': 'standard',
      'GLACIER': 'premium_5y',
      'DEEP_ARCHIVE': 'premium_10y',
    };
    const storageType = storageTypeMap[storageClass] ?? 'standard';

    this.logger.info('UPLOAD', 'MULTIPART_UPLOAD_START', {
      captureId,
      sizeBytes: file.size,
      totalParts,
      storageClass,
      storageType,
    });

    // 1. Iniciar
    await this.multipartService.initiate(captureId, storageType);
    this.logger.info('UPLOAD', 'MULTIPART_INITIATED', { captureId });

    // 2. Dividir em chunks de 1MB para streaming
    const STREAMING_CHUNK_SIZE = 1 * 1024 * 1024;
    const totalChunks = Math.ceil(file.size / STREAMING_CHUNK_SIZE);
    let uploadedParts = 0;

    for (let i = 0; i < totalChunks; i++) {
      if (this.isCancelled) {
        this.logger.warn('UPLOAD', 'MULTIPART_ABORT_REQUESTED', {
          captureId,
          partsUploaded: uploadedParts,
          totalParts: totalChunks,
        });
        await this.multipartService.abort(captureId);
        this.logger.info('UPLOAD', 'MULTIPART_ABORTED', { captureId });
        throw new Error('Upload cancelado');
      }

      const start = i * STREAMING_CHUNK_SIZE;
      const end = Math.min(start + STREAMING_CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      const hash = await calcularHashSHA256Blob(chunk);
      const result = await this.multipartService.addChunk(chunk, hash, null, captureId);

      if (result) {
        uploadedParts++;

        // Reportar progresso IMEDIATAMENTE após cada chunk
        // Isso garante feedback visual contínuo
        onProgress(chunk.size);

        // Reportar progresso mais granular para o usuário
        const progressPercent = Math.round((uploadedParts / totalChunks) * 100);

        // Log a cada 10 parts para não poluir
        if (uploadedParts % 10 === 0 || uploadedParts === totalChunks) {
          this.logger.info('UPLOAD', 'MULTIPART_PART_UPLOADED', {
            captureId,
            partNumber: uploadedParts,
            totalParts: totalChunks,
            partSizeBytes: chunk.size,
            progressPercent,
          });
        }
      }
    }

    // 3. Completar com dados de preview
    this.logger.info('UPLOAD', 'MULTIPART_COMPLETING', {
      captureId,
      partsUploaded: uploadedParts,
      hasPreviewData: !!this.videoPreviewData,
      previewDataContentHash: this.videoPreviewData?.contentHash?.substring(0, 16) + '...',
    });

    // Passar dados de preview para /video/complete
    // Isso garante que contentHash, originalUrl, etc. sejam salvos no Supabase
    const result = await this.multipartService.complete(captureId, this.videoPreviewData ?? undefined);

    // Limpar dados de preview após uso
    this.videoPreviewData = null;

    const durationMs = stopTimer();
    this.logger.info('UPLOAD', 'MULTIPART_UPLOAD_COMPLETE', {
      captureId,
      sizeBytes: file.size,
      partsUploaded: uploadedParts,
      durationMs,
      url: result.url,
    });

    return result.url;
  }

  /**
   * Cancela todos os uploads em andamento.
   * 
   * Aborta uploads simples via AbortController e multipart via API.
   * Operação segura - pode ser chamada mesmo sem uploads ativos.
   * 
   * @returns Promise que resolve quando o cancelamento for concluído
   */
  async cancelar(): Promise<void> {
    this.logger.info('UPLOAD', 'CANCEL_REQUESTED', {
      activeUploads: this.activeUploads.length,
      multipartInProgress: this.multipartService.isInProgress(),
    });
    
    this.isCancelled = true;
    this.activeUploads.forEach((c) => c.abort());
    this.activeUploads = [];
    
    this.logger.info('UPLOAD', 'CANCEL_COMPLETE', {});
  }

  /**
   * Verifica se há uploads em andamento.
   * 
   * @returns `true` se houver uploads simples ou multipart ativos
   */
  isUploading(): boolean {
    return this.activeUploads.length > 0 || this.multipartService.isInProgress();
  }

  // --- Helpers ---

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i] ?? 0);
    }
    return btoa(binary);
  }
}
