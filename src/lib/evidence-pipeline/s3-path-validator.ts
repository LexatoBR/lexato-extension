/**
 * Validador de Paths S3 para Evidências
 *
 * Valida que os paths S3 seguem os padrões esperados antes de operações.
 * Isso previne erros de configuração e garante consistência no armazenamento.
 *
 * Padrões esperados:
 * - evidences/{uuid}/video.webm
 * - evidences/{uuid}/screenshot.png
 * - evidences/{uuid}/html/initial.html
 * - evidences/{uuid}/html/final.html
 * - evidences/{uuid}/html/navigation/{seq}_{timestamp}.html
 * - evidences/{uuid}/forensic-metadata.json
 * - evidences/{uuid}/integrity.json
 * - evidences/{uuid}/timestamp.{tsr|json}
 * - evidences/{uuid}/certificate.pdf
 *
 * @module S3PathValidator
 * @see Requirements 4.5
 */

import { isValidUUIDv4 } from './crypto-helper';

/**
 * Resultado da validação de path S3
 */
export interface S3PathValidationResult {
  /** Se o path é válido */
  valid: boolean;
  /** Mensagem de erro se inválido */
  error?: string;
  /** Componentes extraídos do path */
  components?: {
    /** ID da evidência (UUID) */
    evidenceId: string;
    /** Tipo do arquivo */
    fileType: S3FileType;
    /** Nome do arquivo */
    filename: string;
  };
}

/**
 * Tipos de arquivo permitidos no S3
 */
export type S3FileType =
  | 'video'
  | 'screenshot'
  | 'html-initial'
  | 'html-final'
  | 'html-navigation'
  | 'metadata'
  | 'integrity'
  | 'timestamp'
  | 'certificate';

/**
 * Padrões de path por tipo de arquivo
 */
const PATH_PATTERNS: Record<S3FileType, RegExp> = {
  video: /^evidences\/([a-f0-9-]{36})\/video\.webm$/,
  screenshot: /^evidences\/([a-f0-9-]{36})\/screenshot\.png$/,
  'html-initial': /^evidences\/([a-f0-9-]{36})\/html\/initial\.html$/,
  'html-final': /^evidences\/([a-f0-9-]{36})\/html\/final\.html$/,
  'html-navigation': /^evidences\/([a-f0-9-]{36})\/html\/navigation\/\d{3}_[\d-T]+\.html$/,
  metadata: /^evidences\/([a-f0-9-]{36})\/forensic-metadata\.json$/,
  integrity: /^evidences\/([a-f0-9-]{36})\/integrity\.json$/,
  timestamp: /^evidences\/([a-f0-9-]{36})\/timestamp\.(tsr|json)$/,
  certificate: /^evidences\/([a-f0-9-]{36})\/certificate\.pdf$/,
};

/**
 * Padrão geral para qualquer path de evidência válido
 */
const GENERAL_EVIDENCE_PATTERN = /^evidences\/([a-f0-9-]{36})\/.+$/;

/**
 * Prefixo obrigatório para buckets de evidências
 */
const EVIDENCE_BUCKET_PREFIX = 'lexato-evidence-';

/**
 * Sufixos de ambiente permitidos
 */
const ALLOWED_BUCKET_SUFFIXES: Record<string, string[]> = {
  development: ['dev', 'local'],
  staging: ['staging'],
  production: ['prod', 'production'],
};

/**
 * Valida um path S3 de evidência
 *
 * @param path - Path S3 para validar (ex: "evidences/uuid/video.webm")
 * @returns Resultado da validação com componentes extraídos
 *
 * @example
 * ```typescript
 * const result = validarS3Path('evidences/f47ac10b-58cc-4372-a567-0e02b2c3d479/video.webm');
 * if (result.valid) {
 *   console.log(result.components?.evidenceId); // f47ac10b-58cc-4372-a567-0e02b2c3d479
 *   console.log(result.components?.fileType);   // video
 * }
 * ```
 */
export function validarS3Path(path: string): S3PathValidationResult {
  // Validar entrada
  if (!path || typeof path !== 'string') {
    return {
      valid: false,
      error: 'Path não pode ser vazio',
    };
  }

  // Normalizar path (remover barras duplicadas, trim)
  const normalizedPath = path.trim().replace(/\/+/g, '/').replace(/^\//, '');

  // Verificar padrão geral
  const generalMatch = normalizedPath.match(GENERAL_EVIDENCE_PATTERN);
  if (!generalMatch) {
    return {
      valid: false,
      error: `Path não segue padrão esperado: evidences/{uuid}/... Recebido: ${normalizedPath}`,
    };
  }

  const evidenceId = generalMatch[1];
  if (!evidenceId) {
    return {
      valid: false,
      error: 'Não foi possível extrair evidenceId do path',
    };
  }

  // Validar UUID
  if (!isValidUUIDv4(evidenceId)) {
    return {
      valid: false,
      error: `evidenceId não é um UUID v4 válido: ${evidenceId}`,
    };
  }

  // Identificar tipo de arquivo
  let fileType: S3FileType | null = null;
  for (const [type, pattern] of Object.entries(PATH_PATTERNS)) {
    if (pattern.test(normalizedPath)) {
      fileType = type as S3FileType;
      break;
    }
  }

  // Extrair nome do arquivo
  const filename = normalizedPath.split('/').pop() ?? '';

  // Se não corresponde a nenhum padrão conhecido, ainda pode ser válido
  // (ex: arquivos adicionais no futuro)
  if (!fileType) {
    return {
      valid: true,
      components: {
        evidenceId,
        fileType: 'metadata', // fallback
        filename,
      },
    };
  }

  return {
    valid: true,
    components: {
      evidenceId,
      fileType,
      filename,
    },
  };
}

/**
 * Valida um nome de bucket S3
 *
 * @param bucket - Nome do bucket para validar
 * @param environment - Ambiente atual (development, staging, production)
 * @returns true se o bucket é válido para o ambiente
 *
 * @example
 * ```typescript
 * validarS3Bucket('lexato-evidence-staging', 'staging'); // true
 * validarS3Bucket('lexato-evidence-prod', 'staging');    // false
 * validarS3Bucket('outro-bucket', 'production');         // false
 * ```
 */
export function validarS3Bucket(bucket: string, environment?: string): boolean {
  if (!bucket || typeof bucket !== 'string') {
    return false;
  }

  // Validar formato geral do bucket
  // Regras AWS: 3-63 caracteres, lowercase, números, hífens
  const bucketPattern = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
  if (!bucketPattern.test(bucket)) {
    return false;
  }

  // Verificar se é um bucket de evidências com prefixo correto
  if (!bucket.startsWith(EVIDENCE_BUCKET_PREFIX)) {
    return false;
  }

  // Se ambiente especificado, validar sufixo contra lista permitida
  if (environment) {
    const allowedSuffixes = ALLOWED_BUCKET_SUFFIXES[environment];
    if (allowedSuffixes) {
      const suffix = bucket.slice(EVIDENCE_BUCKET_PREFIX.length);
      if (!allowedSuffixes.some(s => suffix === s || suffix.startsWith(s))) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Constrói um path S3 válido para evidência
 *
 * @param evidenceId - UUID da evidência
 * @param fileType - Tipo do arquivo
 * @param options - Opções adicionais (sequência para navegação, extensão para timestamp)
 * @returns Path S3 construído
 *
 * @example
 * ```typescript
 * construirS3Path('f47ac10b...', 'video');
 * // Retorna: 'evidences/f47ac10b.../video.webm'
 *
 * construirS3Path('f47ac10b...', 'html-navigation', { sequence: 1, timestamp: '2026-01-17T10-30-00' });
 * // Retorna: 'evidences/f47ac10b.../html/navigation/001_2026-01-17T10-30-00.html'
 * ```
 */
export function construirS3Path(
  evidenceId: string,
  fileType: S3FileType,
  options?: {
    sequence?: number;
    timestamp?: string;
    extension?: 'tsr' | 'json';
  }
): string {
  // Validar evidenceId
  if (!isValidUUIDv4(evidenceId)) {
    throw new Error(`evidenceId inválido: ${evidenceId}`);
  }

  const base = `evidences/${evidenceId}`;

  switch (fileType) {
    case 'video':
      return `${base}/video.webm`;
    case 'screenshot':
      return `${base}/screenshot.png`;
    case 'html-initial':
      return `${base}/html/initial.html`;
    case 'html-final':
      return `${base}/html/final.html`;
    case 'html-navigation': {
      const seq = String(options?.sequence ?? 0).padStart(3, '0');
      const ts = options?.timestamp ?? new Date().toISOString().replace(/[:.]/g, '-');
      return `${base}/html/navigation/${seq}_${ts}.html`;
    }
    case 'metadata':
      return `${base}/forensic-metadata.json`;
    case 'integrity':
      return `${base}/integrity.json`;
    case 'timestamp':
      return `${base}/timestamp.${options?.extension ?? 'tsr'}`;
    case 'certificate':
      return `${base}/certificate.pdf`;
    default:
      throw new Error(`Tipo de arquivo desconhecido: ${fileType}`);
  }
}

/**
 * Extrai o evidenceId de um path S3
 *
 * @param path - Path S3 completo
 * @returns evidenceId ou null se não encontrado
 *
 * @example
 * ```typescript
 * extrairEvidenceId('evidences/f47ac10b.../video.webm');
 * // Retorna: 'f47ac10b...'
 * ```
 */
export function extrairEvidenceId(path: string): string | null {
  const result = validarS3Path(path);
  return result.valid ? (result.components?.evidenceId ?? null) : null;
}

/**
 * Verifica se um path é de mídia (vídeo ou screenshot)
 */
export function isMediaPath(path: string): boolean {
  const result = validarS3Path(path);
  if (!result.valid || !result.components) {
    return false;
  }
  return result.components.fileType === 'video' || result.components.fileType === 'screenshot';
}

/**
 * Verifica se um path é de HTML
 */
export function isHtmlPath(path: string): boolean {
  const result = validarS3Path(path);
  if (!result.valid || !result.components) {
    return false;
  }
  return (
    result.components.fileType === 'html-initial' ||
    result.components.fileType === 'html-final' ||
    result.components.fileType === 'html-navigation'
  );
}

/**
 * Verifica se um path é de metadados (JSON)
 */
export function isMetadataPath(path: string): boolean {
  const result = validarS3Path(path);
  if (!result.valid || !result.components) {
    return false;
  }
  return (
    result.components.fileType === 'metadata' ||
    result.components.fileType === 'integrity' ||
    (result.components.fileType === 'timestamp' && result.components.filename.endsWith('.json'))
  );
}
