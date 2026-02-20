/**
 * Gerador de hashes para evidências digitais
 *
 * Responsável por calcular hashes SHA-256 de arquivos, metadados e gerar
 * hash combinado de todos os componentes da evidência.
 *
 * IMPORTANTE: Usa hash-wasm para SHA-256 - NUNCA implementação própria
 *
 * @module HashGenerator
 */

import { CryptoUtils, InvalidInputError, HashTimeoutError } from './crypto-utils';

/**
 * Tamanho padrão do chunk para processamento de arquivos grandes (1MB)
 */
const DEFAULT_CHUNK_SIZE = 1024 * 1024;

/**
 * Timeout padrão para operações de hash (5 segundos)
 */
const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Resultado do hash de um arquivo individual
 */
export interface FileHashResult {
  /** Nome do arquivo */
  fileName: string;
  /** Hash SHA-256 em hexadecimal lowercase */
  hash: string;
  /** Tamanho do arquivo em bytes */
  sizeBytes: number;
  /** Tempo de processamento em ms */
  processingTimeMs: number;
}

/**
 * Resultado do hash de metadados
 */
export interface MetadataHashResult {
  /** Hash SHA-256 em hexadecimal lowercase */
  hash: string;
  /** JSON serializado com chaves ordenadas */
  serializedJson: string;
  /** Tempo de processamento em ms */
  processingTimeMs: number;
}

/**
 * Resultado do hash combinado
 */
export interface CombinedHashResult {
  /** Hash combinado SHA-256 em hexadecimal lowercase */
  combinedHash: string;
  /** Lista de hashes individuais usados */
  componentHashes: string[];
  /** Tempo de processamento em ms */
  processingTimeMs: number;
}

/**
 * Estrutura do arquivo hashes.json
 */
export interface HashesJson {
  /** Versão do formato */
  version: string;
  /** Timestamp ISO 8601 da geração */
  generatedAt: string;
  /** Hash combinado de todos os componentes */
  combinedHash: string;
  /** Hashes individuais dos arquivos */
  files: Record<string, string>;
  /** Hash dos metadados */
  metadataHash: string;
  /** Hash da cadeia PISA (se disponível) */
  pisaChainHash?: string | undefined;
}

/**
 * Opções para geração de hashes
 */
export interface HashGeneratorOptions {
  /** Tamanho do chunk para arquivos grandes (padrão: 1MB) */
  chunkSize?: number | undefined;
  /** Timeout para operações de hash em ms (padrão: 5000) */
  timeout?: number | undefined;
  /** Callback de progresso */
  onProgress?: ((progress: HashProgress) => void) | undefined;
}

/**
 * Progresso da geração de hashes
 */
export interface HashProgress {
  /** Etapa atual */
  stage: 'files' | 'metadata' | 'combined' | 'complete';
  /** Arquivo atual sendo processado */
  currentFile?: string | undefined;
  /** Progresso percentual (0-100) */
  percent: number;
  /** Mensagem descritiva */
  message: string;
}

/**
 * Erro lançado quando geração de hash falha
 */
export class HashGenerationError extends Error {
  public readonly originalError?: Error | undefined;

  constructor(message: string, originalError?: Error) {
    super(message);
    this.name = 'HashGenerationError';
    this.originalError = originalError;
  }
}

// Re-exportar erros do crypto-utils para uso externo
export { InvalidInputError, HashTimeoutError };

/**
 * HashGenerator - Gerador de hashes para evidências digitais
 *
 * Funcionalidades:
 * - Hash de arquivos individuais (imagem, vídeo, HTML)
 * - Hash de metadados com ordenação de chaves
 * - Hash combinado de todos os componentes
 * - Processamento em chunks para não bloquear UI
 * - Geração do arquivo hashes.json
 */
export class HashGenerator {
  private chunkSize: number;
  private _timeout: number;
  private onProgress?: ((progress: HashProgress) => void) | undefined;

  constructor(options: HashGeneratorOptions = {}) {
    this.chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
    this._timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
    this.onProgress = options.onProgress;
  }

  /**
   * Retorna o timeout configurado
   */
  get timeout(): number {
    return this._timeout;
  }

  /**
   * Calcula hash SHA-256 de um arquivo (Blob ou ArrayBuffer)
   *
   * Processa em chunks para não bloquear a UI em arquivos grandes.
   *
   * @param data - Dados do arquivo (Blob, ArrayBuffer ou Uint8Array)
   * @param fileName - Nome do arquivo para identificação
   * @returns Resultado com hash e metadados
   * @throws HashGenerationError se entrada for inválida ou timeout
   */
  async hashFile(
    data: Blob | ArrayBuffer | Uint8Array,
    fileName: string
  ): Promise<FileHashResult> {
    const startTime = performance.now();

    // Validar entrada
    if (data === null || data === undefined) {
      throw new HashGenerationError('Dados do arquivo não podem ser null ou undefined');
    }

    if (!fileName || typeof fileName !== 'string') {
      throw new HashGenerationError('Nome do arquivo é obrigatório');
    }

    this.reportProgress('files', 0, `Calculando hash de ${fileName}...`, fileName);

    try {
      let hash: string;
      let sizeBytes: number;

      if (data instanceof Blob) {
        sizeBytes = data.size;
        hash = await this.hashBlob(data);
      } else if (data instanceof ArrayBuffer) {
        sizeBytes = data.byteLength;
        hash = await CryptoUtils.hashLargeData(data, this.chunkSize);
      } else if (data instanceof Uint8Array || ArrayBuffer.isView(data)) {
        // Suporta Uint8Array e outros TypedArrays
        const uint8Data =
          data instanceof Uint8Array ? data : new Uint8Array((data as ArrayBufferView).buffer);
        sizeBytes = uint8Data.length;
        hash = await CryptoUtils.hashLargeData(uint8Data, this.chunkSize);
      } else {
        throw new HashGenerationError('Tipo de dados não suportado');
      }

      const processingTimeMs = performance.now() - startTime;

      this.reportProgress('files', 100, `Hash de ${fileName} calculado`, fileName);

      return {
        fileName,
        hash,
        sizeBytes,
        processingTimeMs,
      };
    } catch (error) {
      if (error instanceof InvalidInputError || error instanceof HashTimeoutError) {
        throw new HashGenerationError(`Falha ao calcular hash de ${fileName}: ${error.message}`, error);
      }
      if (error instanceof HashGenerationError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      throw new HashGenerationError(`Falha ao calcular hash de ${fileName}: ${errorMessage}`);
    }
  }

  /**
   * Calcula hash de um Blob processando em chunks
   */
  private async hashBlob(blob: Blob): Promise<string> {
    // Para blobs pequenos, processar diretamente
    if (blob.size <= this.chunkSize) {
      const arrayBuffer = await blob.arrayBuffer();
      return CryptoUtils.hashBuffer(arrayBuffer);
    }

    // Para blobs grandes, processar em chunks
    const arrayBuffer = await blob.arrayBuffer();
    return CryptoUtils.hashLargeData(arrayBuffer, this.chunkSize);
  }

  /**
   * Calcula hash de múltiplos arquivos
   *
   * @param files - Mapa de nome do arquivo para dados
   * @returns Mapa de nome do arquivo para resultado do hash
   */
  async hashFiles(
    files: Map<string, Blob | ArrayBuffer | Uint8Array>
  ): Promise<Map<string, FileHashResult>> {
    const results = new Map<string, FileHashResult>();
    const totalFiles = files.size;
    let processedFiles = 0;

    for (const [fileName, data] of files) {
      const result = await this.hashFile(data, fileName);
      results.set(fileName, result);
      processedFiles++;

      const percent = Math.round((processedFiles / totalFiles) * 100);
      this.reportProgress('files', percent, `Processado ${processedFiles}/${totalFiles} arquivos`);
    }

    return results;
  }

  /**
   * Calcula hash de metadados com ordenação de chaves
   *
   * As chaves do objeto são ordenadas alfabeticamente antes da serialização
   * para garantir hash determinístico independente da ordem de inserção.
   *
   * @param metadata - Objeto de metadados
   * @returns Resultado com hash e JSON serializado
   * @throws HashGenerationError se entrada for inválida
   */
  async hashMetadata(metadata: object): Promise<MetadataHashResult> {
    const startTime = performance.now();

    // Validar entrada
    if (metadata === null || metadata === undefined) {
      throw new HashGenerationError('Metadados não podem ser null ou undefined');
    }

    if (typeof metadata !== 'object' || Array.isArray(metadata)) {
      throw new HashGenerationError('Metadados devem ser um objeto');
    }

    this.reportProgress('metadata', 0, 'Calculando hash dos metadados...');

    try {
      // Serializar com chaves ordenadas
      const serializedJson = CryptoUtils.stringifyOrdered(metadata);

      // Calcular hash
      const hash = await CryptoUtils.hash(serializedJson);

      const processingTimeMs = performance.now() - startTime;

      this.reportProgress('metadata', 100, 'Hash dos metadados calculado');

      return {
        hash,
        serializedJson,
        processingTimeMs,
      };
    } catch (error) {
      if (error instanceof InvalidInputError || error instanceof HashTimeoutError) {
        throw new HashGenerationError(`Falha ao calcular hash dos metadados: ${error.message}`, error);
      }
      if (error instanceof HashGenerationError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      throw new HashGenerationError(`Falha ao calcular hash dos metadados: ${errorMessage}`);
    }
  }

  /**
   * Gera hash combinado de todos os componentes
   *
   * Concatena todos os hashes em ordem e calcula hash final.
   * A ordem dos hashes é determinística (ordenada alfabeticamente por nome).
   *
   * @param hashes - Mapa de nome do componente para hash
   * @returns Resultado com hash combinado
   * @throws HashGenerationError se entrada for inválida
   */
  async generateCombinedHash(hashes: Map<string, string>): Promise<CombinedHashResult> {
    const startTime = performance.now();

    // Validar entrada
    if (!hashes || hashes.size === 0) {
      throw new HashGenerationError('Pelo menos um hash é necessário para gerar hash combinado');
    }

    this.reportProgress('combined', 0, 'Gerando hash combinado...');

    try {
      // Ordenar chaves alfabeticamente para garantir determinismo
      const sortedKeys = Array.from(hashes.keys()).sort();
      const componentHashes: string[] = [];

      // Concatenar hashes na ordem
      let concatenated = '';
      for (const key of sortedKeys) {
        const hash = hashes.get(key);
        if (!hash || typeof hash !== 'string') {
          throw new HashGenerationError(`Hash inválido para componente: ${key}`);
        }
        componentHashes.push(hash);
        concatenated += hash;
      }

      // Calcular hash combinado
      const combinedHash = await CryptoUtils.hash(concatenated);

      const processingTimeMs = performance.now() - startTime;

      this.reportProgress('combined', 100, 'Hash combinado gerado');

      return {
        combinedHash,
        componentHashes,
        processingTimeMs,
      };
    } catch (error) {
      if (error instanceof InvalidInputError || error instanceof HashTimeoutError) {
        throw new HashGenerationError(`Falha ao gerar hash combinado: ${error.message}`, error);
      }
      if (error instanceof HashGenerationError) {
        throw error;
      }
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      throw new HashGenerationError(`Falha ao gerar hash combinado: ${errorMessage}`);
    }
  }

  /**
   * Gera o arquivo hashes.json com todos os hashes da evidência
   *
   * @param fileHashes - Mapa de nome do arquivo para hash
   * @param metadataHash - Hash dos metadados
   * @param pisaChainHash - Hash da cadeia PISA (opcional)
   * @returns Objeto HashesJson pronto para serialização
   */
  async generateHashesJson(
    fileHashes: Map<string, string>,
    metadataHash: string,
    pisaChainHash?: string
  ): Promise<HashesJson> {
    this.reportProgress('combined', 0, 'Gerando hashes.json...');

    // Validar entradas
    if (!fileHashes || fileHashes.size === 0) {
      throw new HashGenerationError('Pelo menos um hash de arquivo é necessário');
    }

    if (!metadataHash || typeof metadataHash !== 'string') {
      throw new HashGenerationError('Hash dos metadados é obrigatório');
    }

    // Preparar mapa de hashes para hash combinado
    const allHashes = new Map<string, string>();

    // Adicionar hashes de arquivos
    for (const [fileName, hash] of fileHashes) {
      allHashes.set(`file:${fileName}`, hash);
    }

    // Adicionar hash de metadados
    allHashes.set('metadata', metadataHash);

    // Adicionar hash PISA se disponível
    if (pisaChainHash) {
      allHashes.set('pisa', pisaChainHash);
    }

    // Gerar hash combinado
    const combinedResult = await this.generateCombinedHash(allHashes);

    // Converter fileHashes para objeto
    const filesObject: Record<string, string> = {};
    for (const [fileName, hash] of fileHashes) {
      filesObject[fileName] = hash;
    }

    const hashesJson: HashesJson = {
      version: '1.0.0',
      generatedAt: new Date().toISOString(),
      combinedHash: combinedResult.combinedHash,
      files: filesObject,
      metadataHash,
    };

    if (pisaChainHash) {
      hashesJson.pisaChainHash = pisaChainHash;
    }

    this.reportProgress('complete', 100, 'hashes.json gerado com sucesso');

    return hashesJson;
  }

  /**
   * Processa uma evidência completa e gera todos os hashes
   *
   * @param files - Mapa de nome do arquivo para dados
   * @param metadata - Objeto de metadados
   * @param pisaChainHash - Hash da cadeia PISA (opcional)
   * @returns Objeto HashesJson completo
   */
  async processEvidence(
    files: Map<string, Blob | ArrayBuffer | Uint8Array>,
    metadata: object,
    pisaChainHash?: string
  ): Promise<HashesJson> {
    // 1. Calcular hashes dos arquivos
    const fileResults = await this.hashFiles(files);

    // Extrair apenas os hashes
    const fileHashes = new Map<string, string>();
    for (const [fileName, result] of fileResults) {
      fileHashes.set(fileName, result.hash);
    }

    // 2. Calcular hash dos metadados
    const metadataResult = await this.hashMetadata(metadata);

    // 3. Gerar hashes.json
    return this.generateHashesJson(fileHashes, metadataResult.hash, pisaChainHash);
  }

  /**
   * Reporta progresso se callback estiver configurado
   */
  private reportProgress(
    stage: HashProgress['stage'],
    percent: number,
    message: string,
    currentFile?: string
  ): void {
    if (this.onProgress) {
      const progress: HashProgress = {
        stage,
        percent,
        message,
      };
      if (currentFile !== undefined) {
        progress.currentFile = currentFile;
      }
      this.onProgress(progress);
    }
  }
}

export default HashGenerator;
