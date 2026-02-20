/**
 * Tipos para o PCC - Processo de Certificação em Cascata
 *
 * Define interfaces para os níveis de certificação local (1-2)
 * e integração com backend (3-5)
 *
 * @module PCCTypes
 */

/**
 * Níveis de certificação do PCC
 */
export type PCCLevel = 1 | 2 | 3 | 4 | 5;

/**
 * Status de um nível de certificação
 */
export type PCCLevelStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';

/**
 * Componente de evidência para certificação
 */
export interface EvidenceComponent {
  /** Nome do componente (ex: 'screenshot.png', 'metadata.json') */
  name: string;
  /** Hash SHA-256 do componente */
  hash: string;
  /** Tipo do componente */
  type: 'image' | 'video' | 'html' | 'metadata' | 'frame' | 'other';
  /** Tamanho em bytes (opcional) */
  sizeBytes?: number;
}

/**
 * Resultado do Nível 1 - Certificação Local
 */
export interface PCCLevel1Result {
  /** Se o nível foi completado com sucesso */
  success: boolean;
  /** Hash do Nível 1: Hash(HASH_CADEIA || dados_locais) */
  hashN1: string;
  /** Merkle Root dos componentes */
  merkleRoot: string;
  /** Hashes das folhas da Merkle Tree */
  leafHashes: string[];
  /** Número de componentes certificados */
  componentCount: number;
  /** Timestamp ISO 8601 da certificação local */
  timestamp: string;
  /** Hash da cadeia PISA usado */
  pisaChainHash: string;
  /** Metadados do ambiente de captura */
  environmentMetadata: EnvironmentMetadata;
  /** Tempo de processamento em ms */
  processingTimeMs: number;
  /** Mensagem de erro (se falha) */
  error?: string;
}

/**
 * Metadados do ambiente de captura
 */
export interface EnvironmentMetadata {
  /** Versão da extensão */
  extensionVersion: string;
  /** User-Agent do navegador */
  userAgent: string;
  /** Timestamp ISO 8601 */
  timestamp: string;
  /** URL capturada */
  url: string;
  /** Título da página */
  pageTitle: string;
  /** Dimensões do viewport */
  viewport: {
    width: number;
    height: number;
  };
  /** Tipo de captura */
  captureType: 'screenshot' | 'video';
  /** Tipo de armazenamento escolhido */
  storageType: 'standard' | 'premium_5y' | 'premium_10y' | 'premium_20y';
}

/**
 * Resposta do servidor para validação do Nível 2
 */
export interface ServerValidationResponse {
  /** Se a validação foi bem-sucedida */
  success: boolean;
  /** Timestamp do servidor ISO 8601 */
  serverTimestamp: string;
  /** Assinatura do servidor sobre Hash_N1 */
  signature: string;
  /** Algoritmo de assinatura usado */
  signatureAlgorithm: string;
  /** ID do certificado do servidor */
  certificateId: string;
  /** Hash_N1 recebido (para verificação) */
  receivedHashN1: string;
  /** Mensagem de erro (se falha) */
  error?: string;
}

/**
 * Resultado do Nível 2 - Certificação do Servidor
 */
export interface PCCLevel2Result {
  /** Se o nível foi completado com sucesso */
  success: boolean;
  /** Hash do Nível 2: Hash(Hash_N1 || cert_servidor) */
  hashN2: string;
  /** Hash do Nível 1 usado */
  hashN1: string;
  /** Timestamp do servidor ISO 8601 */
  serverTimestamp: string;
  /** Assinatura do servidor */
  serverSignature: string;
  /** Se a assinatura foi verificada */
  signatureVerified: boolean;
  /** ID do certificado do servidor */
  certificateId: string;
  /** Tempo de processamento em ms */
  processingTimeMs: number;
  /** Mensagem de erro (se falha) */
  error?: string;
}

/**
 * Resultado completo do PCC Local (Níveis 1-2)
 */
export interface PCCLocalResult {
  /** Se todos os níveis locais foram completados */
  success: boolean;
  /** Resultado do Nível 1 */
  level1: PCCLevel1Result;
  /** Resultado do Nível 2 */
  level2: PCCLevel2Result;
  /** Hash final para envio ao backend (Hash_N2) */
  finalHash: string;
  /** Tempo total de processamento em ms */
  totalProcessingTimeMs: number;
  /** Mensagem de erro (se falha) */
  error?: string;
}

/**
 * Opções para o PCC Local
 */
export interface PCCLocalOptions {
  /** URL do endpoint de validação do servidor */
  serverValidationUrl?: string;
  /** Timeout para validação do servidor em ms (padrão: 30000) */
  serverTimeout?: number;
  /** Se deve verificar assinatura do servidor (padrão: true) */
  verifySignature?: boolean;
  /** Callback de progresso */
  onProgress?: (progress: PCCProgress) => void;
}

/**
 * Progresso do PCC
 */
export interface PCCProgress {
  /** Nível atual sendo processado */
  currentLevel: PCCLevel;
  /** Status do nível atual */
  status: PCCLevelStatus;
  /** Progresso percentual (0-100) */
  percent: number;
  /** Mensagem descritiva */
  message: string;
}

/**
 * Dados para construção da Merkle Tree
 */
export interface MerkleTreeInput {
  /** Componentes da evidência */
  components: EvidenceComponent[];
  /** Hash da cadeia PISA */
  pisaChainHash: string;
  /** Metadados do ambiente */
  environmentMetadata: EnvironmentMetadata;
}

/**
 * Dados para validação no servidor
 */
export interface ServerValidationRequest {
  /** Hash do Nível 1 */
  hashN1: string;
  /** Merkle Root */
  merkleRoot: string;
  /** Timestamp local ISO 8601 */
  localTimestamp: string;
  /** Correlation ID para rastreabilidade */
  correlationId: string;
  /** Versão da extensão */
  extensionVersion: string;
}

/**
 * Certificado do servidor para verificação de assinatura
 */
export interface ServerCertificate {
  /** ID do certificado */
  id: string;
  /** Chave pública em formato PEM ou JWK */
  publicKey: string;
  /** Algoritmo de assinatura */
  algorithm: string;
  /** Data de validade */
  validUntil: string;
}
