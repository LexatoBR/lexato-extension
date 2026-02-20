/**
 * Tipos do Pipeline Unificado de Evidências
 *
 * Define interfaces para o fluxo unificado de captura, upload,
 * preview, aprovação e certificação de evidências digitais.
 *
 * @module EvidencePipelineTypes
 */

import type { ForensicMetadata } from '../../types/forensic-metadata.types';

// ============================================================================
// Tipos Base
// ============================================================================

/**
 * Tipo de captura suportado
 */
export type CaptureType = 'screenshot' | 'video';

/**
 * Prazo de retenção em anos
 */
export type RetentionYears = 5 | 10 | 20;

/**
 * Status da evidência no pipeline
 *
 * Ordem das 6 fases (RFC 3161):
 * Captura → Timestamp ICP-Brasil → Upload S3 → Preview → Blockchain → Certificado
 *
 * IMPORTANTE: O timestamp ICP-Brasil é aplicado IMEDIATAMENTE após a captura,
 * ANTES de qualquer upload, garantindo prova de existência no momento mais
 * próximo da coleta conforme MP 2.200-2/2001.
 */
export type EvidenceStatus =
  // Fase 1: Captura
  | 'INITIALIZING'
  | 'CAPTURING'
  | 'CAPTURED'
  | 'CAPTURE_FAILED'
  // Fase 2: Timestamp ICP-Brasil (ANTES do upload - RFC 3161)
  | 'TIMESTAMPING'
  | 'TIMESTAMPED'
  | 'TIMESTAMP_FALLBACK'
  | 'TIMESTAMP_FAILED'
  // Fase 3: Upload S3
  | 'UPLOADING'
  | 'UPLOADED'
  | 'UPLOAD_FAILED'
  // Fase 4: Preview/Aprovação
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'DISCARDED'
  | 'EXPIRED'
  // Fase 5: Blockchain
  | 'REGISTERING_BLOCKCHAIN'
  | 'BLOCKCHAIN_PARTIAL'
  | 'BLOCKCHAIN_COMPLETE'
  | 'BLOCKCHAIN_FAILED'
  // Fase 6: Certificado
  | 'GENERATING_PDF'
  | 'CERTIFIED'
  | 'PDF_FAILED';

// ============================================================================
// Configurações
// ============================================================================

/**
 * Configuração de armazenamento escolhida pelo usuário
 */
export interface StorageConfig {
  /** Classe de armazenamento S3 */
  storageClass: 'STANDARD' | 'GLACIER' | 'DEEP_ARCHIVE';

  /** Prazo de retenção em anos (5 = padrão, 10 = recomendado, 20 = máximo) */
  retentionYears: RetentionYears;

  /** Custo adicional em créditos (calculado no backend) */
  additionalCredits?: number;
}

/**
 * Configuração para iniciar captura
 */
export interface CaptureConfig {
  /** ID da aba a capturar */
  tabId: number;

  /** ID da janela */
  windowId: number;

  /** Tipo de captura */
  type: CaptureType;

  /** Configuração de armazenamento inicial (pode ser alterada no preview) */
  storageConfig: StorageConfig;

  /** ID de correlação para logs */
  correlationId?: string;

  /**
   * Stream ID pré-capturado via tabCapture no clique do ícone da extensão.
   * Quando disponível, evita o picker do getDisplayMedia na captura de vídeo.
   * Se ausente ou expirado, o offscreen faz fallback para getDisplayMedia.
   */
  preCapturedStreamId?: string | undefined;

  /** Dados de isolamento para passar ao content script */
  isolation?: {
    snapshotHash: string;
    disabledExtensions: string[];
    nonDisabledExtensions: string[];
  };
}

// ============================================================================
// Resultados
// ============================================================================

/**
 * Snapshot de HTML capturado em um momento específico
 */
export interface HtmlSnapshot {
  /** Tipo do snapshot */
  type: 'initial' | 'navigation' | 'final';
  /** URL da página no momento da captura */
  url: string;
  /** Título da página */
  title: string;
  /** Conteúdo HTML completo */
  content: string;
  /** Hash SHA-256 do HTML */
  hash: string;
  /** Tamanho em bytes */
  sizeBytes: number;
  /** Timestamp ISO 8601 */
  capturedAt: string;
  /** Número de sequência (para navegações) */
  sequence?: number;
}

/**
 * Coleção de HTMLs capturados durante a evidência
 */
export interface HtmlCollection {
  /** HTML no início da captura */
  initial: HtmlSnapshot;
  /** HTML no fim da captura */
  final: HtmlSnapshot;
  /** HTMLs de navegações durante a captura (recarregamentos, mudanças de URL) */
  navigations: HtmlSnapshot[];
  /** Hash combinado de todos os HTMLs (Merkle Root dos hashes) */
  combinedHash: string;
  /** Tamanho total em bytes */
  totalSizeBytes: number;
}

/**
 * Resultado unificado de captura (screenshot ou vídeo)
 */
export interface CaptureResult {
  /** ID único da evidência (UUID v4 gerado na extensão) */
  evidenceId: string;

  /** Tipo de captura realizada */
  type: CaptureType;

  /** URL da página capturada (URL inicial) */
  url: string;

  /** Título da página (título inicial) */
  title: string;

  /** Dados da mídia principal */
  media: {
    /** Blob da mídia (PNG para screenshot, WebM para vídeo) */
    blob: Blob;
    /** Hash SHA-256 da mídia */
    hash: string;
    /** MIME type */
    mimeType: string;
    /** Tamanho em bytes */
    sizeBytes: number;
  };

  /**
   * HTML da página (compatibilidade com screenshots)
   * Para vídeos, contém o HTML inicial
   * @deprecated Use htmlCollection para acesso completo aos HTMLs
   */
  html: {
    /** Conteúdo HTML */
    content: string;
    /** Hash SHA-256 do HTML */
    hash: string;
    /** Tamanho em bytes */
    sizeBytes: number;
  };

  /**
   * Coleção completa de HTMLs capturados
   * Inclui HTML inicial, final e de todas as navegações
   */
  htmlCollection?: HtmlCollection;

  /** Metadados forenses completos */
  forensicMetadata: ForensicMetadata;

  /** Hash SHA-256 dos metadados (JSON stringified) */
  metadataHash: string;

  /** Merkle Root de todos os hashes */
  merkleRoot: string;

  /** Timestamps */
  timestamps: {
    /** Início da captura (ISO 8601) */
    startedAt: string;
    /** Fim da captura (ISO 8601) */
    endedAt: string;
    /** Duração em milissegundos */
    durationMs: number;
  };

  /** Dados específicos de vídeo (apenas para type === 'video') */
  videoData?: {
    /** Número total de chunks */
    totalChunks: number;
    /** Hashes de cada chunk (para Merkle Tree) */
    chunkHashes: string[];
    /** Duração do vídeo em segundos */
    durationSeconds: number;
    /** Taxa de frames */
    frameRate?: number;
  };

  /** Dados de isolamento de extensões */
  isolation: {
    /** Modo de isolamento usado */
    mode: 'full' | 'partial' | 'none';
    /** Extensões desativadas durante captura */
    disabledExtensions: string[];
    /** Extensões que não puderam ser desativadas */
    nonDisabledExtensions: string[];
    /** Hash do snapshot de isolamento */
    snapshotHash?: string;
  };
}

/**
 * Resultado do upload para S3
 *
 * Estrutura de arquivos no S3:
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
 */
export interface UploadResult {
  /** ID da evidência */
  evidenceId: string;

  /** URLs dos arquivos no S3 */
  urls: {
    /** URL da mídia principal (video.webm ou screenshot.png) */
    media: string;
    /** URLs dos HTMLs */
    html: {
      /** HTML inicial */
      initial: string;
      /** HTML final */
      final: string;
      /** HTMLs de navegação */
      navigations: string[];
    };
    /** URL dos metadados forenses */
    metadata: string;
    /** URL do arquivo de integridade (hashes) */
    integrity: string;
    /** URL do token timestamp ICP-Brasil (RFC 3161) */
    timestamp: string;
  };

  /** Chaves S3 */
  s3Keys: {
    media: string;
    html: {
      initial: string;
      final: string;
      navigations: string[];
    };
    metadata: string;
    integrity: string;
    timestamp: string;
  };

  /** Método de upload usado */
  uploadMethod: 'simple' | 'multipart';

  /** Estatísticas do upload */
  stats: {
    /** Tamanho total em bytes */
    totalBytes: number;
    /** Duração do upload em ms */
    durationMs: number;
    /** Número de parts (se multipart) */
    partsCount?: number;
    /** Número de arquivos enviados */
    filesCount: number;
  };
}

/**
 * Resultado do carimbo de tempo ICP-Brasil (RFC 3161)
 *
 * Aplicado IMEDIATAMENTE após a captura, ANTES do upload,
 * para garantir prova de existência no momento mais próximo da coleta.
 */
export interface TimestampResult {
  /** Tipo de timestamp obtido */
  type: 'ICP_BRASIL' | 'NTP_LOCAL';

  /** Token RFC 3161 em formato Base64 (DER encoded) - apenas para ICP_BRASIL */
  tokenBase64?: string;

  /** Hash SHA-256 do token */
  tokenHash: string;

  /** Momento em que o timestamp foi aplicado (ISO 8601) */
  appliedAt: string;

  /** Autoridade de Timestamp (TSA) */
  tsa: 'SERPRO' | 'LOCAL';

  /** Merkle Root que foi carimbado */
  merkleRoot: string;

  /** Precisão do timestamp (ms) - apenas para ICP_BRASIL */
  accuracy?: number;

  /** Aviso se fallback foi usado */
  warning?: string;
}

/**
 * Prova de registro em blockchain
 */
export interface BlockchainProof {
  /** Hash da transação na rede Polygon */
  txHashPolygon?: string;
  /** Hash da transação na rede Arbitrum */
  txHashArbitrum?: string;
  /** Bloco na rede Polygon */
  blockNumberPolygon?: number;
  /** Bloco na rede Arbitrum */
  blockNumberArbitrum?: number;
  /** Timestamp do registro */
  registeredAt: string;
}

/**
 * Resultado do registro em blockchain
 */
export interface BlockchainResult {
  /** Se o registro foi iniciado com sucesso */
  success: boolean;
  /** Provas de registro (se síncrono ou recuperado) */
  proof?: BlockchainProof;
  /** Status do processo */
  status: 'pending' | 'processing' | 'completed' | 'partial' | 'failed';
  /** Mensagem de erro se houver */
  error?: string;
}

/**
 * Resultado final da certificação
 */
export interface CertificationResult {
  /** ID da evidência */
  evidenceId: string;

  /** Status final */
  status: 'CERTIFIED' | 'PARTIAL' | 'FAILED';

  /** URL do certificado PDF */
  certificateUrl?: string;

  /** Carimbo ICP-Brasil */
  timestamp?: TimestampResult;

  /** Registros blockchain */
  blockchain?: BlockchainResult;

  /** Prazo de armazenamento escolhido */
  retention: {
    years: RetentionYears;
    expiresAt: string;
  };

  /** Erro (se falhou) */
  error?: string;
}

// ============================================================================
// Progresso
// ============================================================================

/**
 * Progresso do pipeline
 *
 * Fases na ordem correta (RFC 3161):
 * 1. capture - Captura de mídia e metadados
 * 2. timestamp - Carimbo ICP-Brasil (ANTES do upload)
 * 3. upload - Upload para S3
 * 4. preview - Revisão e aprovação do usuário
 * 5. blockchain - Triplo registro (Polygon + Arbitrum + Optimism)
 * 6. certificate - Geração do PDF
 */
export interface PipelineProgress {
  /** ID da evidência */
  evidenceId: string;

  /** Status atual */
  status: EvidenceStatus;

  /** Fase atual (1-6) */
  phase: 1 | 2 | 3 | 4 | 5 | 6;

  /** Nome da fase */
  phaseName: 'capture' | 'timestamp' | 'upload' | 'preview' | 'blockchain' | 'certificate';

  /** Progresso percentual (0-100) */
  percent: number;

  /** Mensagem descritiva */
  message: string;

  /** Timestamp da última atualização */
  updatedAt: string;

  /** Detalhes específicos da fase */
  details?: {
    /** Para upload: bytes enviados */
    bytesUploaded?: number;
    /** Para upload: total de bytes */
    totalBytes?: number;
    /** Para vídeo: chunks processados */
    chunksProcessed?: number;
    /** Para vídeo: total de chunks */
    totalChunks?: number;
    /** Para blockchain: rede atual */
    currentNetwork?: 'polygon' | 'arbitrum';
    /** Para timestamp: tentativa atual (1-3) */
    attempt?: number;
    /** Para timestamp: TSA usada */
    tsa?: 'SERPRO' | 'LOCAL';
    /** Para erros: código do erro */
    errorCode?: string;
  };
}

// ============================================================================
// Callbacks
// ============================================================================

/**
 * Callback de progresso do pipeline
 */
export type PipelineProgressCallback = (progress: PipelineProgress) => void;

/**
 * Callback de erro do pipeline
 */
export type PipelineErrorCallback = (error: PipelineError) => void;

// ============================================================================
// Erros
// ============================================================================

/**
 * Erro do pipeline
 */
export interface PipelineError {
  /** Código do erro */
  code: PipelineErrorCode;

  /** Mensagem de erro */
  message: string;

  /** Fase onde ocorreu o erro */
  phase: PipelineProgress['phaseName'];

  /** Se o erro é recuperável */
  recoverable: boolean;

  /** Detalhes adicionais */
  details?: Record<string, unknown>;

  /** Stack trace (apenas em dev) */
  stack?: string;
}

/**
 * Códigos de erro do pipeline
 */
export type PipelineErrorCode =
  // Erros de captura
  | 'CAPTURE_TAB_ACCESS_DENIED'
  | 'CAPTURE_URL_BLOCKED'
  | 'CAPTURE_TIMEOUT'
  | 'CAPTURE_ISOLATION_FAILED'
  | 'CAPTURE_MEDIA_ERROR'
  // Erros de upload
  | 'UPLOAD_PRESIGNED_URL_FAILED'
  | 'UPLOAD_S3_ERROR'
  | 'UPLOAD_TIMEOUT'
  | 'UPLOAD_INTEGRITY_MISMATCH'
  // Erros de preview
  | 'PREVIEW_EXPIRED'
  | 'PREVIEW_DISCARDED'
  // Erros de certificação
  | 'TIMESTAMP_SERPRO_ERROR'
  | 'TIMESTAMP_INVALID_RESPONSE'
  | 'BLOCKCHAIN_POLYGON_FAILED'
  | 'BLOCKCHAIN_ARBITRUM_FAILED'
  | 'BLOCKCHAIN_BOTH_FAILED'
  // Erros gerais
  | 'AUTH_REQUIRED'
  | 'INSUFFICIENT_CREDITS'
  | 'NETWORK_ERROR'
  | 'UNKNOWN_ERROR';

// ============================================================================
// Estratégia de Captura (Strategy Pattern)
// ============================================================================

/**
 * Interface para estratégias de captura
 */
export interface CaptureStrategy {
  /** Tipo de captura que esta estratégia implementa */
  readonly type: CaptureType;

  /**
   * Executa a captura
   *
   * @param config - Configuração da captura
   * @param onProgress - Callback de progresso
   * @returns Resultado da captura
   */
  execute(config: CaptureConfig, onProgress?: PipelineProgressCallback): Promise<CaptureResult>;

  /**
   * Para a captura em andamento (usado para vídeo)
   * Resolve a Promise retornada por execute() com o CaptureResult
   */
  stop?(): Promise<void>;

  /**
   * Cancela captura em andamento
   */
  cancel(): Promise<void>;

  /**
   * Verifica se há captura em andamento
   */
  isCapturing(): boolean;
}

// ============================================================================
// Serviço de Upload (Unificado)
// ============================================================================

/**
 * Interface para serviço de upload unificado
 */
export interface UploadService {
  /**
   * Faz upload de uma evidência para S3
   *
   * Decide automaticamente entre upload simples (<5MB) ou multipart (>=5MB)
   *
   * @param result - Resultado da captura
   * @param onProgress - Callback de progresso
   * @returns Resultado do upload
   */
  upload(result: CaptureResult, onProgress?: PipelineProgressCallback): Promise<UploadResult>;

  /**
   * Cancela upload em andamento
   */
  cancel(): Promise<void>;

  /**
   * Verifica se há upload em andamento
   */
  isUploading(): boolean;
}

// ============================================================================
// Pipeline Principal
// ============================================================================

/**
 * Interface do pipeline de evidências
 *
 * Ordem das 6 fases (RFC 3161):
 * 1. startCapture() - Captura de mídia e metadados
 * 2. applyTimestamp() - Carimbo ICP-Brasil (ANTES do upload)
 * 3. uploadToS3() - Upload para S3
 * 4. openPreview() - Revisão e aprovação do usuário
 * 5. approve() - Triplo registro blockchain (Polygon + Arbitrum + Optimism) + certificado
 * 6. (interno) - Geração do PDF
 */
export interface EvidencePipeline {
  /**
   * Inicia captura de evidência (Fase 1)
   *
   * @param config - Configuração da captura
   * @returns Resultado da captura com hashes e Merkle Root
   */
  startCapture(config: CaptureConfig): Promise<CaptureResult>;

  /**
   * Para a captura de vídeo em andamento
   * Deve ser chamado após startCapture() para vídeos
   */
  stopCapture(): Promise<void>;

  /**
   * Cancela captura em andamento
   * Aborta a operação sem salvar resultado
   */
  cancelCapture(): Promise<void>;

  /**
   * Aplica timestamp ICP-Brasil (Fase 2)
   *
   * CRÍTICO: Deve ser chamado IMEDIATAMENTE após startCapture(),
   * ANTES de qualquer upload, para garantir prova de existência
   * no momento mais próximo da coleta (RFC 3161).
   *
   * @param merkleRoot - Merkle Root da captura
   * @returns Resultado do timestamp (ICP-Brasil ou fallback NTP)
   */
  applyTimestamp(merkleRoot: string): Promise<TimestampResult>;

  /**
   * Faz upload da evidência para S3 (Fase 3)
   *
   * @param result - Resultado da captura
   * @param timestamp - Resultado do timestamp ICP-Brasil
   * @returns Resultado do upload
   */
  uploadToS3(result: CaptureResult, timestamp: TimestampResult): Promise<UploadResult>;

  /**
   * Abre página de preview para aprovação (Fase 4)
   *
   * @param evidenceId - ID da evidência
   */
  openPreview(evidenceId: string): Promise<void>;

  /**
   * Aprova evidência e inicia certificação (Fases 5 e 6)
   *
   * @param evidenceId - ID da evidência
   * @param storage - Configuração de armazenamento escolhida
   */
  approve(evidenceId: string, storage: StorageConfig): Promise<CertificationResult>;

  /**
   * Descarta evidência
   *
   * @param evidenceId - ID da evidência
   */
  discard(evidenceId: string): Promise<void>;

  /**
   * Expira evidência após timeout (chamado por alarmes)
   *
   * @param evidenceId - ID da evidência
   */
  expire(evidenceId: string): Promise<void>;

  /**
   * Obtém status atual de uma evidência
   *
   * @param evidenceId - ID da evidência
   */
  getStatus(evidenceId: string): Promise<PipelineProgress | null>;

  /**
   * Registra callback de progresso
   *
   * @param callback - Função a ser chamada em cada atualização
   * @returns Função para remover o listener
   */
  onProgress(callback: PipelineProgressCallback): () => void;

  /**
   * Registra callback de erro
   *
   * @param callback - Função a ser chamada em caso de erro
   * @returns Função para remover o listener
   */
  onError(callback: PipelineErrorCallback): () => void;
}
