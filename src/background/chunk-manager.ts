/**
 * Gerenciador de chunks de vídeo para captura forense
 *
 * Responsável por:
 * - Processar chunks de vídeo com cálculo de hash SHA-256
 * - Manter encadeamento de hashes (cada chunk referencia o anterior)
 * - Gerenciar buffer local de chunks pendentes
 * - Calcular Merkle Root usando MerkleTree existente
 *
 * @module ChunkManager
 * @see Requirements 2.2, 2.3, 2.5, 10.2, 10.4
 */

import { CryptoUtils } from '@lib/crypto-utils';
import { MerkleTree } from '@lib/merkle-tree';

/**
 * Status do upload de um chunk
 */
export type ChunkUploadStatus = 'pending' | 'uploading' | 'uploaded' | 'failed';

/**
 * Representa um fragmento de vídeo com metadados forenses
 */
export interface VideoChunk {
  /** Índice sequencial do chunk (0-based) */
  index: number;
  /** Dados do chunk em Blob */
  data: Blob;
  /** Tamanho em bytes */
  sizeBytes: number;
  /** Hash SHA-256 do chunk */
  hash: string;
  /** Hash do chunk anterior (null para primeiro) */
  previousHash: string | null;
  /** Timestamp de criação (ISO 8601) */
  timestamp: string;
  /** Status do upload */
  uploadStatus: ChunkUploadStatus;
  /** Número de tentativas de upload */
  uploadAttempts: number;
  /** ETag retornado pelo S3 após upload */
  etag?: string;
  /** Part number no S3 Multipart (1-based) */
  partNumber: number;
}

/**
 * Dados do chunk para inclusão no manifesto
 */
export interface ChunkManifestData {
  /** Índice sequencial do chunk */
  index: number;
  /** Hash SHA-256 do chunk */
  hash: string;
  /** Hash do chunk anterior (null para primeiro) */
  previousHash: string | null;
  /** Tamanho em bytes */
  sizeBytes: number;
  /** Timestamp de criação (ISO 8601) */
  timestamp: string;
}

/**
 * Erro lançado quando operação do ChunkManager falha
 */
export class ChunkManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChunkManagerError';
  }
}

/**
 * Gerenciador de chunks de vídeo
 *
 * Calcula hashes, mantém encadeamento e gerencia buffer local.
 * Garante cadeia de custódia verificável através de hashes encadeados.
 */
export class ChunkManager {
  /** Buffer de chunks processados */
  private chunks: VideoChunk[] = [];
  /** Hash do último chunk processado (para encadeamento) */
  private previousHash: string | null = null;

  /**
   * Processa novo chunk: calcula hash e encadeia ao anterior
   *
   * @param data - Dados do chunk em Blob
   * @param index - Índice sequencial (0-based)
   * @returns Chunk processado com hash encadeado
   * @throws ChunkManagerError se dados forem inválidos
   */
  async processChunk(data: Blob, index: number): Promise<VideoChunk> {
    // Validar entrada
    if (!data || !(data instanceof Blob)) {
      throw new ChunkManagerError('Dados do chunk devem ser um Blob válido');
    }

    if (index < 0 || !Number.isInteger(index)) {
      throw new ChunkManagerError('Índice do chunk deve ser um inteiro não-negativo');
    }

    // Verificar sequência
    if (index !== this.chunks.length) {
      throw new ChunkManagerError(
        `Índice fora de sequência: esperado ${this.chunks.length}, recebido ${index}`
      );
    }

    // Calcular hash SHA-256 do chunk
    const hash = await this.calculateHash(data);

    // Criar chunk com encadeamento
    const chunk: VideoChunk = {
      index,
      data,
      sizeBytes: data.size,
      hash,
      previousHash: this.previousHash,
      timestamp: new Date().toISOString(),
      uploadStatus: 'pending',
      uploadAttempts: 0,
      partNumber: index + 1, // S3 Multipart usa 1-based
    };

    // Adicionar ao buffer e atualizar hash anterior
    this.chunks.push(chunk);
    this.previousHash = hash;

    // Log de debug removido - usar logger externo se necessário

    return chunk;
  }

  /**
   * Calcula hash SHA-256 de um Blob
   *
   * @param data - Dados para hash
   * @returns Hash em hexadecimal lowercase
   */
  async calculateHash(data: Blob): Promise<string> {
    // Converter Blob para ArrayBuffer
    // Usa FileReader como fallback para ambientes sem Blob.arrayBuffer()
    const arrayBuffer = await this.blobToArrayBuffer(data);
    return CryptoUtils.hashBuffer(arrayBuffer);
  }

  /**
   * Converte Blob para ArrayBuffer
   * Usa FileReader como fallback para compatibilidade
   *
   * @param blob - Blob para converter
   * @returns ArrayBuffer
   */
  private async blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    // Tentar usar arrayBuffer() nativo primeiro
    if (typeof blob.arrayBuffer === 'function') {
      return blob.arrayBuffer();
    }

    // Fallback usando FileReader para ambientes de teste
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result instanceof ArrayBuffer) {
          resolve(reader.result);
        } else {
          reject(new ChunkManagerError('Falha ao converter Blob para ArrayBuffer'));
        }
      };
      reader.onerror = () => reject(new ChunkManagerError('Erro ao ler Blob'));
      reader.readAsArrayBuffer(blob);
    });
  }

  /**
   * Calcula Merkle Root de todos os chunks processados
   *
   * @returns Hash raiz da árvore de Merkle
   * @throws ChunkManagerError se não houver chunks
   */
  async calculateMerkleRoot(): Promise<string> {
    if (this.chunks.length === 0) {
      throw new ChunkManagerError('Não há chunks para calcular Merkle Root');
    }

    const hashes = this.chunks.map((chunk) => chunk.hash);
    const tree = new MerkleTree();
    const result = await tree.build(hashes);

    // Log de debug removido - usar logger externo se necessário

    return result.rootHash;
  }

  /**
   * Obtém todos os chunks para inclusão no manifesto
   *
   * @returns Array de dados dos chunks para serialização
   */
  getChunksForManifest(): ChunkManifestData[] {
    return this.chunks.map((chunk) => ({
      index: chunk.index,
      hash: chunk.hash,
      previousHash: chunk.previousHash,
      sizeBytes: chunk.sizeBytes,
      timestamp: chunk.timestamp,
    }));
  }

  /**
   * Obtém chunk por índice
   *
   * @param index - Índice do chunk
   * @returns Chunk ou undefined se não encontrado
   */
  getChunk(index: number): VideoChunk | undefined {
    return this.chunks[index];
  }

  /**
   * Obtém todos os chunks
   *
   * @returns Array de todos os chunks
   */
  getAllChunks(): VideoChunk[] {
    return [...this.chunks];
  }

  /**
   * Obtém chunks pendentes de upload
   *
   * @returns Array de chunks com status 'pending' ou 'failed'
   */
  getPendingChunks(): VideoChunk[] {
    return this.chunks.filter(
      (chunk) => chunk.uploadStatus === 'pending' || chunk.uploadStatus === 'failed'
    );
  }

  /**
   * Atualiza status de upload de um chunk
   *
   * @param index - Índice do chunk
   * @param status - Novo status
   * @param etag - ETag retornado pelo S3 (opcional)
   */
  updateChunkStatus(index: number, status: ChunkUploadStatus, etag?: string): void {
    const chunk = this.chunks[index];
    if (!chunk) {
      throw new ChunkManagerError(`Chunk não encontrado: ${index}`);
    }

    chunk.uploadStatus = status;
    if (status === 'uploading' || status === 'failed') {
      chunk.uploadAttempts++;
    }
    if (etag) {
      chunk.etag = etag;
    }

    // Log de debug removido - usar logger externo se necessário
  }

  /**
   * Obtém número total de chunks
   */
  getChunkCount(): number {
    return this.chunks.length;
  }

  /**
   * Obtém tamanho total de todos os chunks em bytes
   */
  getTotalSize(): number {
    return this.chunks.reduce((total, chunk) => total + chunk.sizeBytes, 0);
  }

  /**
   * Verifica se todos os chunks foram enviados com sucesso
   */
  allChunksUploaded(): boolean {
    return this.chunks.length > 0 && this.chunks.every((chunk) => chunk.uploadStatus === 'uploaded');
  }

  /**
   * Limpa todos os chunks (para cancelamento ou reset)
   */
  clear(): void {
    this.chunks = [];
    this.previousHash = null;
    // Log de debug removido - usar logger externo se necessário
  }

  /**
   * Verifica integridade da cadeia de hashes
   *
   * @returns true se a cadeia está íntegra
   */
  verifyChainIntegrity(): boolean {
    if (this.chunks.length === 0) {
      return true;
    }

    // Primeiro chunk deve ter previousHash null
    if (this.chunks[0]?.previousHash !== null) {
      return false;
    }

    // Cada chunk subsequente deve referenciar o hash do anterior
    for (let i = 1; i < this.chunks.length; i++) {
      const currentChunk = this.chunks[i];
      const previousChunk = this.chunks[i - 1];

      if (!currentChunk || !previousChunk) {
        return false;
      }

      if (currentChunk.previousHash !== previousChunk.hash) {
        return false;
      }
    }

    return true;
  }
}

export default ChunkManager;
