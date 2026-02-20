/**
 * Tipos para captura de evidências digitais
 *
 * Define interfaces para screenshot, vídeo e metadados de captura
 *
 * @module CaptureTypes
 */

import type { ForensicMetadata } from './forensic-metadata.types';

/**
 * Tipo de armazenamento - escolhido ANTES da captura, irreversível
 */
export type StorageType = 'standard' | 'premium_5y' | 'premium_10y' | 'premium_20y';

/**
 * Tipo de captura
 */
export type CaptureType = 'screenshot' | 'video';

/**
 * Status da captura
 * 
 * Inclui status do pipeline unificado (timestamp, preview, blockchain)
 */
export type CaptureStatus =
  | 'initializing' // PISA em andamento
  | 'lockdown_active' // Lockdown ativado
  | 'capturing' // Captura em andamento
  // Status de timestamp (Pipeline Fase 2)
  | 'timestamping' // Solicitando timestamp ICP-Brasil
  | 'timestamp_fallback' // Usando fallback NTP
  | 'timestamp_failed' // Timestamp falhou
  // Status de upload (Pipeline Fase 3)
  | 'uploading' // Upload para S3
  // Status de preview (Pipeline Fase 4)
  | 'pending_review' // Aguardando aprovação do usuário
  | 'approved' // Aprovado pelo usuário
  | 'discarded' // Descartado pelo usuário
  | 'expired' // Expirou (timeout 24h)
  // Status de blockchain (Pipeline Fase 5)
  | 'registering_blockchain' // Registrando em blockchain
  | 'blockchain_partial' // Registro parcial
  | 'blockchain_complete' // Registro completo
  | 'blockchain_failed' // Registro falhou
  // Status de certificado (Pipeline Fase 6)
  | 'generating_pdf' // Gerando PDF
  | 'certified' // Certificado gerado
  | 'pdf_failed' // Geração de PDF falhou
  // Status finais
  | 'processing' // Backend processando
  | 'completed' // Concluído com sucesso
  | 'failed'; // Falhou

/**
 * Dados de uma captura
 */
export interface CaptureData {
  /** ID único da captura */
  id: string;
  /** Tipo de captura */
  type: CaptureType;
  /** Tipo de armazenamento escolhido */
  storageType: StorageType;
  /** Status atual */
  status: CaptureStatus;
  /** URL da página capturada */
  url: string;
  /** Título da página */
  title: string;
  /** Timestamp ISO 8601 */
  timestamp: string;

  // Hashes
  /** Hash da cadeia PISA */
  pisaHashCadeia?: string;
  /** Hash do screenshot */
  screenshotHash?: string;
  /** Hash do HTML */
  htmlHash?: string;
  /** Hash dos metadados */
  metadataHash?: string;
  /** Raiz da Merkle Tree */
  merkleRoot?: string;

  // Arquivos
  /** URL do screenshot */
  screenshotUrl?: string;
  /** 
   * URL do HTML (compatibilidade com screenshots)
   * Para vídeos, use htmlUrls para estrutura completa
   */
  htmlUrl?: string;
  /**
   * URLs dos HTMLs capturados (vídeos)
   * Estrutura completa com inicial, final e navegações
   */
  htmlUrls?: {
    initial: string;
    final: string;
    navigations: string[];
  };
  /** URL do vídeo */
  videoUrl?: string;

  // Certificação
  /** URL do certificado PDF */
  certificateUrl?: string;
  /** Hash da transação Polygon */
  polygonTxHash?: string;
  /** Hash da transação Arbitrum */
  arbitrumTxHash?: string;

  // Verificação
  /**
   * Código de verificação de 8 caracteres para acesso completo no verificador público.
   * IMPORTANTE: Este código é exibido apenas uma vez após a confirmação e não pode ser recuperado.
   * Deve ser armazenado de forma segura pelo usuário.
   */
  verificationCode?: string;

  // Erros
  /** Mensagem de erro (se falha) */
  error?: string;
}

/**
 * Hash do estado original do DOM para integridade forense
 */
export interface OriginalStateHash {
  /** Hash da estrutura relevante do DOM */
  domStructureHash: string;
  /** Hash dos elementos visíveis */
  visibleElementsHash: string;
  /** Timestamp da captura do hash */
  timestamp: number;
  /** Indicador de que foi capturado antes de qualquer modificação */
  capturedBefore: 'any-modification';
}

/**
 * Hash do estado restaurado do DOM após modificações
 */
export interface RestoredStateHash {
  /** Hash da estrutura do DOM após restauração */
  domStructureHash: string;
  /** Timestamp da captura do hash */
  timestamp: number;
  /** Se o hash corresponde ao original */
  matchesOriginal: boolean;
}

/**
 * Hashes de integridade para conformidade ISO 27037
 */
export interface IntegrityHashes {
  /** Hash do estado original do DOM */
  originalState: OriginalStateHash;
  /** Hash da imagem capturada */
  capturedImage: string;
  /** Hash do estado restaurado */
  restoredState: RestoredStateHash;
  /** Se a integridade foi verificada (original === restaurado) */
  integrityVerified: boolean;
}

/**
 * Modificação documentada do DOM
 */
export interface DOMModification {
  /** Tipo de modificação */
  type: 'hide' | 'modify-position' | 'modify-style' | 'remove-class' | 'add-class';
  /** Seletor do elemento modificado */
  selector: string;
  /** Propriedade modificada */
  property?: string;
  /** Valor original */
  originalValue?: string;
  /** Novo valor */
  newValue?: string;
  /** Timestamp da modificação */
  timestamp: number;
  /** Justificativa forense para a modificação */
  forensicReason: string;
}

/**
 * Captura RAW sem modificações
 */
export interface RawCapture {
  /** Dados da imagem em Base64 */
  imageData: string;
  /** Hash SHA-256 da imagem */
  hash: string;
  /** Timestamp da captura */
  capturedAt: number;
  /** Confirmação de que não houve modificações */
  modifications: [];
  /** Largura da imagem */
  width: number;
  /** Altura da imagem */
  height: number;
}

/**
 * Captura Enhanced com modificações documentadas
 */
export interface EnhancedCapture {
  /** Dados da imagem em Base64 */
  imageData: string;
  /** Hash SHA-256 da imagem */
  hash: string;
  /** Timestamp da captura */
  capturedAt: number;
  /** Lista de modificações aplicadas */
  modifications: DOMModification[];
  /** Largura da imagem */
  width: number;
  /** Altura da imagem */
  height: number;
}

/**
 * Resultado da captura Dual-Mode (RAW + Enhanced)
 */
export interface DualModeCapture {
  /** Captura RAW sem modificações */
  raw: RawCapture;
  /** Captura Enhanced com modificações */
  enhanced: EnhancedCapture;
  /** Comparação entre as capturas */
  comparison: {
    /** Se ambas as capturas estão disponíveis */
    bothAvailable: boolean;
    /** Se a RAW foi capturada primeiro */
    rawCapturedFirst: boolean;
    /** Diferença de tempo entre capturas em ms */
    timeDifferenceMs: number;
  };
}

/**
 * Resultado da captura de screenshot
 */
export interface ScreenshotCaptureResult {
  /** Se a captura foi bem-sucedida */
  success: boolean;
  /** Dados da imagem em Base64 (PNG para integridade forense) */
  imageData?: string;
  /** Largura da imagem em pixels */
  width?: number;
  /** Altura da imagem em pixels */
  height?: number;
  /** Hash SHA-256 da imagem */
  imageHash?: string;
  /** HTML da página */
  htmlContent?: string;
  /** Hash SHA-256 do HTML */
  htmlHash?: string;
  /** Metadados forenses completos */
  metadata?: ForensicMetadata;
  /** Hash SHA-256 dos metadados */
  metadataHash?: string;
  /** Mensagem de erro (se falha) */
  error?: string;
  /** Tempo total de captura em ms */
  durationMs?: number;
  /** Hashes de integridade (ISO 27037) */
  integrityHashes?: IntegrityHashes;
  /** Captura Dual-Mode quando disponível */
  dualModeCapture?: DualModeCapture;
  /** Escopo da captura - metadados sobre área capturada (ISO 27037) */
  captureScope?: CaptureScope;
}

/**
 * Metadados coletados durante a captura
 */
export interface CaptureMetadata {
  /** URL completa da página */
  url: string;
  /** Título da página */
  title: string;
  /** Timestamp ISO 8601 com timezone */
  timestamp: string;
  /** User-Agent do navegador */
  userAgent: string;
  /** Versão da extensão */
  extensionVersion: string;
  /** Dimensões do viewport */
  viewport: {
    width: number;
    height: number;
  };
  /** Dimensões da página completa */
  pageSize: {
    width: number;
    height: number;
  };
  /** Número de viewports capturados (stitching) */
  viewportsCaptured: number;
  /** Tempo de carregamento da página em ms */
  pageLoadTimeMs?: number;
  /** Headers HTTP (se disponíveis) */
  httpHeaders?: Record<string, string>;
  /** Cookies visíveis (não HttpOnly) */
  cookies?: string[];
  /** Logs do console (errors, warnings) */
  consoleLogs?: ConsoleLogEntry[];
}

/**
 * Entrada de log do console
 */
export interface ConsoleLogEntry {
  /** Nível do log */
  level: 'error' | 'warn' | 'info' | 'log';
  /** Mensagem */
  message: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * Configuração da captura de screenshot
 */
export interface ScreenshotCaptureConfig {
  /** Timeout para carregamento da página (padrão: 30000ms) */
  pageLoadTimeout: number;
  /** Timeout por viewport durante stitching (padrão: 10000ms) */
  viewportTimeout: number;
  /** Timeout para cálculo de hash (padrão: 5000ms) */
  hashTimeout: number;
  /** Qualidade da imagem (0-100, PNG ignora este valor) */
  quality: number;
  /** Formato da imagem (PNG recomendado para integridade forense) */
  format: 'webp' | 'png' | 'jpeg';
  /** Se deve coletar HTML */
  collectHtml: boolean;
  /** Se deve coletar metadados */
  collectMetadata: boolean;
  /** Altura máxima antes de dividir em múltiplas imagens (padrão: 50000px) */
  maxHeightBeforeSplit: number;

  // Configurações para páginas longas e infinite scroll
  /** Limite máximo de altura para captura em páginas fixas (padrão: 50000px) */
  maxCaptureHeight: number;
  /** Limite máximo de altura para páginas com infinite scroll (padrão: 30000px) */
  infiniteScrollMaxHeight: number;
  /** Número de viewports para scroll de detecção de infinite scroll (padrão: 3) */
  infiniteScrollDetectionViewports: number;
  /** Percentual de crescimento para considerar infinite scroll (padrão: 0.20 = 20%) */
  infiniteScrollGrowthThreshold: number;
  /** Timeout total máximo para captura em ms para páginas normais (padrão: 180000ms = 3min) */
  maxCaptureTimeMs: number;
  /** Timeout total máximo para captura em ms para páginas com infinite scroll (padrão: 360000ms = 6min) */
  maxCaptureTimeMsInfiniteScroll: number;
}

/**
 * Motivo do truncamento da captura
 */
export type CaptureTruncationReason =
  | 'infinite_scroll_detected'
  | 'max_height_exceeded'
  | 'timeout'
  | null;

/**
 * Escopo da captura - Metadados forenses sobre a área capturada (ISO 27037)
 *
 * Documenta decisões tomadas durante a captura para auditoria e conformidade.
 */
export interface CaptureScope {
  /** Altura total da página em pixels */
  totalPageHeight: number;
  /** Altura efetivamente capturada em pixels */
  capturedHeight: number;
  /** Se a captura foi truncada (não capturou toda a página) */
  wasTruncated: boolean;
  /** Motivo do truncamento, se aplicável */
  truncationReason: CaptureTruncationReason;
  /** Se foi detectado infinite scroll na página */
  infiniteScrollDetected: boolean;
  /** Percentual de crescimento do scrollHeight durante detecção */
  scrollHeightGrowth: number;
  /** Posição Y inicial da captura (sempre 0) */
  captureStartY: number;
  /** Posição Y final da captura */
  captureEndY: number;
  /** Timestamp da detecção de infinite scroll */
  timestamp: number;
}

/**
 * Estágios da captura de screenshot
 *
 * Fluxo completo:
 * 1. initializing - Preparando ambiente
 * 2. lockdown - Desativando extensões de terceiros
 * 3. reload - Recarregando página para integridade
 * 4. waiting_resources - Aguardando recursos carregarem
 * 5. capturing - Capturando viewports
 * 6. stitching - Unindo múltiplos viewports
 * 7. hashing - Calculando hash SHA-256
 * 8. timestamp - Solicitando carimbo ICP-Brasil
 * 9. uploading - Enviando para servidor seguro
 * 10. opening_preview - Abrindo página de preview
 * 11. complete - Concluído com sucesso
 */
export type ScreenshotCaptureStage =
  | 'initializing'
  | 'lockdown'
  | 'reload'
  | 'waiting_resources'
  | 'capturing'
  | 'stitching'
  | 'hashing'
  | 'timestamp'
  | 'uploading'
  | 'opening_preview'
  | 'complete';

/**
 * Progresso da captura de screenshot
 */
export interface ScreenshotCaptureProgress {
  /** Etapa atual */
  stage: ScreenshotCaptureStage;
  /** Progresso percentual (0-100) */
  percent: number;
  /** Mensagem descritiva */
  message: string;
  /** Viewport atual (durante stitching) */
  currentViewport?: number;
  /** Total de viewports */
  totalViewports?: number;
  /** Número de extensões desativadas (durante lockdown) */
  disabledExtensions?: number;
  /** Bytes enviados (durante upload) */
  uploadedBytes?: number;
  /** Total de bytes (durante upload) */
  totalBytes?: number;
}

/**
 * Callback para progresso da captura
 */
export type ScreenshotProgressCallback = (progress: ScreenshotCaptureProgress) => void;

/**
 * Informações de um viewport capturado
 */
export interface ViewportCapture {
  /** Posição Y do scroll */
  scrollY: number;
  /** Dados da imagem em Base64 */
  imageData: string;
  /** Largura do viewport */
  width: number;
  /** Altura do viewport (altura real a ser usada no stitching) */
  height: number;
  /** Altura real do viewport capturado (pode ser maior que height no último viewport) */
  actualViewportHeight?: number;
}

// ============================================================================
// Tipos para Captura de Vídeo
// ============================================================================

/**
 * Estado da gravação de vídeo
 * 
 * NOTA: Estado 'paused' foi removido como parte do redesign.
 * A remoção de pause/resume garante integridade temporal da evidência.
 */
export type VideoRecordingState = 'idle' | 'recording' | 'stopping' | 'stopped';

/**
 * Configuração da captura de vídeo
 */
export interface VideoCaptureConfig {
  /** Duração máxima em ms (padrão: 30 minutos = 1800000ms) */
  maxDurationMs: number;
  /** Formato do vídeo */
  format: 'webm';
  /** Codec de vídeo */
  videoCodec: string;
  /** Bitrate do vídeo em bps */
  videoBitrate: number;
  /** Taxa de frames por segundo */
  frameRate: number;
  /** Timeout para hash em ms */
  hashTimeout: number;
  /** Se deve coletar HTML no início e fim */
  collectHtml: boolean;
  /** Se deve coletar metadados */
  collectMetadata: boolean;
}

/**
 * Resultado da captura de vídeo
 */
export interface VideoCaptureResult {
  /** Se a captura foi bem-sucedida */
  success: boolean;
  /** Blob do vídeo gravado */
  videoBlob?: Blob;
  /** Dados do vídeo em Base64 */
  videoData?: string;
  /** Hash SHA-256 do vídeo */
  videoHash?: string;
  /** Duração da gravação em ms */
  durationMs?: number;
  /** HTML da página no início */
  htmlContentStart?: string;
  /** Hash do HTML inicial */
  htmlHashStart?: string;
  /** HTML da página no fim */
  htmlContentEnd?: string;
  /** Hash do HTML final */
  htmlHashEnd?: string;
  /** Metadados coletados */
  metadata?: VideoMetadata;
  /** Hash dos metadados */
  metadataHash?: string;
  /** Mensagem de erro (se falha) */
  error?: string;
  /** Se foi finalizado automaticamente por atingir limite */
  autoFinalized?: boolean;
  /**
   * Se a integridade da evidência foi comprometida
   * TRUE quando DevTools foi detectado durante gravação
   */
  integrityCompromised?: boolean;
  /**
   * Motivo do comprometimento da integridade (se aplicável)
   */
  integrityCompromiseReason?: 'devtools_detected' | 'dom_manipulation' | 'other';
}

/**
 * Metadados específicos de captura de vídeo
 */
export interface VideoMetadata extends CaptureMetadata {
  /** Duração da gravação em ms */
  recordingDurationMs: number;
  /** Formato do vídeo */
  videoFormat: string;
  /** Codec utilizado */
  videoCodec: string;
  /** Bitrate do vídeo */
  videoBitrate: number;
  /** Taxa de frames */
  frameRate: number;
  /** Tamanho do arquivo em bytes */
  fileSizeBytes: number;
  /** Se foi finalizado automaticamente */
  autoFinalized: boolean;
  /** Timestamp de início ISO 8601 */
  startTimestamp: string;
  /** Timestamp de fim ISO 8601 */
  endTimestamp: string;
}

/**
 * Progresso da captura de vídeo
 */
export interface VideoCaptureProgress {
  /** Estado atual da gravação */
  state: VideoRecordingState;
  /** Tempo decorrido em ms */
  elapsedMs: number;
  /** Tempo restante em ms (até limite máximo) */
  remainingMs: number;
  /** Progresso percentual (0-100) */
  percent: number;
  /** Mensagem descritiva */
  message: string;
  /** Aviso de tempo restante (quando próximo do limite) */
  timeWarning?: '5min' | '1min' | '30sec';
}

/**
 * Callback para progresso da captura de vídeo
 */
export type VideoProgressCallback = (progress: VideoCaptureProgress) => void;

/**
 * Motivo de finalização automática da gravação de vídeo
 *
 * @property max_duration - Tempo máximo de 30 minutos atingido
 * @property error - Erro durante gravação
 * @property security_violation - DevTools detectado ou outra violação de segurança
 */
export type AutoFinalizeReason = 'max_duration' | 'error' | 'security_violation';

/**
 * Callback para quando gravação é finalizada automaticamente
 */
export type VideoAutoFinalizeCallback = (reason: AutoFinalizeReason) => void;

/**
 * Opções para iniciar gravação de vídeo
 */
export interface VideoStartOptions {
  /** Callback de progresso */
  onProgress?: VideoProgressCallback;
  /** Callback de finalização automática */
  onAutoFinalize?: VideoAutoFinalizeCallback;
  /** Stream de mídia (para testes) */
  mediaStream?: MediaStream;
}


// ============================================================================
// Tipos para Extração de Frames
// ============================================================================

/**
 * Estado da extração de frames
 */
export type FrameExtractorState = 'idle' | 'extracting' | 'stopping' | 'stopped';

/**
 * Tipo de evento que disparou a captura do frame
 */
export type FrameEventType = 'initial' | 'periodic' | 'scroll' | 'click' | 'media_play' | 'final';

/**
 * Configuração do extrator de frames
 */
export interface FrameExtractorConfig {
  /** Intervalo de captura em ms (padrão: 3000ms = 3 segundos) */
  captureIntervalMs: number;
  /** Qualidade JPEG (0-1, padrão: 0.85 = 85%) */
  jpegQuality: number;
  /** Threshold de similaridade para deduplicação (0-1, padrão: 0.90 = 90%) */
  similarityThreshold: number;
  /** Se deve capturar em scroll */
  captureOnScroll: boolean;
  /** Se deve capturar em clique */
  captureOnClick: boolean;
  /** Se deve capturar em reprodução de mídia */
  captureOnMediaPlay: boolean;
  /** Timeout para hash em ms */
  hashTimeout: number;
  /** Tempo mínimo entre frames em ms */
  minTimeBetweenFrames: number;
}

/**
 * Frame extraído
 */
export interface ExtractedFrame {
  /** Número sequencial do frame */
  frameNumber: number;
  /** Timestamp da captura */
  timestamp: number;
  /** Tempo decorrido desde o início em ms */
  elapsedMs: number;
  /** Tipo de evento que disparou a captura */
  trigger: FrameEventType;
  /** Dados da imagem em Base64 (JPEG) */
  imageData: string;
  /** Largura do frame em pixels */
  width: number;
  /** Altura do frame em pixels */
  height: number;
  /** Posição de scroll no momento da captura */
  scrollPosition: {
    x: number;
    y: number;
  };
  /** Hash SHA-256 do frame (calculado após extração) */
  hash?: string;
}

/**
 * Resultado da extração de frames
 */
export interface FrameExtractionResult {
  /** Se a extração foi bem-sucedida */
  success: boolean;
  /** Lista de frames extraídos */
  frames: ExtractedFrame[];
  /** Total de frames extraídos */
  totalFrames?: number;
  /** Duração total da extração em ms */
  durationMs?: number;
  /** Número de frames descartados por similaridade */
  discardedFrames?: number;
  /** Mensagem de erro (se falha) */
  error?: string;
}

/**
 * Progresso da extração de frames
 */
export interface FrameExtractionProgress {
  /** Estado atual da extração */
  state: FrameExtractorState;
  /** Número de frames extraídos */
  frameCount: number;
  /** Número de frames descartados */
  discardedCount: number;
  /** Tempo decorrido em ms */
  elapsedMs: number;
  /** Mensagem descritiva */
  message: string;
}

/**
 * Callback para progresso da extração de frames
 */
export type FrameProgressCallback = (progress: FrameExtractionProgress) => void;

/**
 * Opções para iniciar extração de frames
 */
export interface FrameStartOptions {
  /** Callback de progresso */
  onProgress?: FrameProgressCallback;
}
