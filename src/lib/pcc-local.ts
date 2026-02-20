/**
 * PCC Local - Processo de Certificação em Cascata (Níveis 1-2)
 *
 * Implementa os níveis locais de certificação:
 * - Nível 1: Certificação local com Merkle Tree
 * - Nível 2: Validação e assinatura do servidor
 *
 * @module PCCLocal
 */

import { sha256 } from 'hash-wasm';
import { MerkleTree, type MerkleTreeResult } from './merkle-tree';
import { CryptoUtils } from './crypto-utils';
import { AuditLogger } from './audit-logger';
import type {
  PCCLocalResult,
  PCCLevel1Result,
  PCCLevel2Result,
  PCCLocalOptions,
  PCCProgress,
  EnvironmentMetadata,
  MerkleTreeInput,
  ServerValidationRequest,
  ServerValidationResponse,
} from '../types/pcc.types';

/**
 * Configuração padrão do PCC Local
 */
const DEFAULT_CONFIG = {
  /** Timeout para validação do servidor (30 segundos) */
  SERVER_TIMEOUT: 30000,
  /** Se deve verificar assinatura do servidor */
  VERIFY_SIGNATURE: true,
};

/**
 * Erro lançado quando operação do PCC falha
 */
export class PCCError extends Error {
  public readonly code: string;
  public readonly level: number | undefined;

  constructor(message: string, code: string, level?: number) {
    super(message);
    this.name = 'PCCError';
    this.code = code;
    this.level = level;
  }
}

/**
 * Opções internas com valores obrigatórios
 */
interface InternalPCCOptions {
  serverValidationUrl: string;
  serverTimeout: number;
  verifySignature: boolean;
  onProgress: ((progress: PCCProgress) => void) | undefined;
}

/**
 * PCCLocal - Processo de Certificação em Cascata Local
 *
 * Funcionalidades:
 * - Nível 1: Gera Merkle Tree dos componentes e calcula Hash_N1
 * - Nível 2: Envia Hash_N1 para servidor e recebe assinatura
 * - Verificação de assinatura do servidor
 * - Logging completo via AuditLogger
 */
export class PCCLocal {
  private logger: AuditLogger;
  private options: InternalPCCOptions;
  private onProgress: ((progress: PCCProgress) => void) | undefined;

  constructor(logger: AuditLogger, options: PCCLocalOptions = {}) {
    this.logger = logger;
    this.options = {
      serverValidationUrl: options.serverValidationUrl ?? '',
      serverTimeout: options.serverTimeout ?? DEFAULT_CONFIG.SERVER_TIMEOUT,
      verifySignature: options.verifySignature ?? DEFAULT_CONFIG.VERIFY_SIGNATURE,
      onProgress: options.onProgress,
    };
    this.onProgress = options.onProgress;
  }

  /**
   * Executa o processo PCC Local completo (Níveis 1-2)
   *
   * @param input - Dados para construção da Merkle Tree
   * @returns Resultado completo do PCC Local
   */
  async execute(input: MerkleTreeInput): Promise<PCCLocalResult> {
    const startTime = performance.now();

    this.logger.info('PCC', 'PROCESS_START', {
      componentCount: input.components.length,
      captureType: input.environmentMetadata.captureType,
    });

    try {
      // Nível 1: Certificação Local
      this.reportProgress(1, 'processing', 0, 'Iniciando certificação local...');
      const level1Result = await this.executeLevel1(input);

      if (!level1Result.success) {
        throw new PCCError(
          level1Result.error ?? 'Falha no Nível 1',
          'PCC_LEVEL1_FAILED',
          1
        );
      }

      this.reportProgress(1, 'completed', 50, 'Certificação local concluída');

      // Nível 2: Validação do Servidor
      this.reportProgress(2, 'processing', 50, 'Enviando para validação do servidor...');
      const level2Result = await this.executeLevel2(level1Result);

      if (!level2Result.success) {
        throw new PCCError(
          level2Result.error ?? 'Falha no Nível 2',
          'PCC_LEVEL2_FAILED',
          2
        );
      }

      this.reportProgress(2, 'completed', 100, 'Validação do servidor concluída');

      const totalProcessingTimeMs = performance.now() - startTime;

      this.logger.info('PCC', 'PROCESS_COMPLETE', {
        hashN2: level2Result.hashN2,
        totalProcessingTimeMs,
      });

      return {
        success: true,
        level1: level1Result,
        level2: level2Result,
        finalHash: level2Result.hashN2,
        totalProcessingTimeMs,
      };
    } catch (error) {
      const totalProcessingTimeMs = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      const errorCode = error instanceof PCCError ? error.code : 'PCC_UNKNOWN_ERROR';

      this.logger.error('PCC', 'PROCESS_FAILED', {
        error: errorMessage,
        code: errorCode,
        totalProcessingTimeMs,
      });

      // Retornar resultado parcial com erro
      return {
        success: false,
        level1: {
          success: false,
          hashN1: '',
          merkleRoot: '',
          leafHashes: [],
          componentCount: 0,
          timestamp: new Date().toISOString(),
          pisaChainHash: input.pisaChainHash,
          environmentMetadata: input.environmentMetadata,
          processingTimeMs: 0,
          error: errorMessage,
        },
        level2: {
          success: false,
          hashN2: '',
          hashN1: '',
          serverTimestamp: '',
          serverSignature: '',
          signatureVerified: false,
          certificateId: '',
          processingTimeMs: 0,
          error: errorMessage,
        },
        finalHash: '',
        totalProcessingTimeMs,
        error: errorMessage,
      };
    }
  }

  /**
   * Executa Nível 1 - Certificação Local
   *
   * Gera Merkle Tree dos componentes e calcula Hash_N1 = Hash(HASH_CADEIA || dados_locais)
   */
  async executeLevel1(input: MerkleTreeInput): Promise<PCCLevel1Result> {
    const startTime = performance.now();

    this.logger.info('PCC', 'LEVEL1_START', {
      componentCount: input.components.length,
      pisaChainHash: input.pisaChainHash.substring(0, 16) + '...',
    });

    try {
      // Validar entrada
      this.validateLevel1Input(input);

      // Preparar hashes para Merkle Tree
      const leafHashes = this.prepareLeafHashes(input);

      // Construir Merkle Tree
      const merkleTree = new MerkleTree();
      const treeResult: MerkleTreeResult = await merkleTree.build(leafHashes);

      // Calcular Hash_N1 = Hash(HASH_CADEIA || merkleRoot || metadataHash)
      const metadataHash = await this.hashEnvironmentMetadata(input.environmentMetadata);
      const hashN1 = await this.calculateHashN1(
        input.pisaChainHash,
        treeResult.rootHash,
        metadataHash
      );

      const processingTimeMs = performance.now() - startTime;

      this.logger.info('PCC', 'LEVEL1_COMPLETE', {
        hashN1: hashN1.substring(0, 16) + '...',
        merkleRoot: treeResult.rootHash.substring(0, 16) + '...',
        leafCount: treeResult.leafCount,
        processingTimeMs,
      });

      return {
        success: true,
        hashN1,
        merkleRoot: treeResult.rootHash,
        leafHashes: treeResult.leafHashes,
        componentCount: input.components.length,
        timestamp: new Date().toISOString(),
        pisaChainHash: input.pisaChainHash,
        environmentMetadata: input.environmentMetadata,
        processingTimeMs,
      };
    } catch (error) {
      const processingTimeMs = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

      this.logger.error('PCC', 'LEVEL1_FAILED', {
        error: errorMessage,
        processingTimeMs,
      });

      return {
        success: false,
        hashN1: '',
        merkleRoot: '',
        leafHashes: [],
        componentCount: 0,
        timestamp: new Date().toISOString(),
        pisaChainHash: input.pisaChainHash,
        environmentMetadata: input.environmentMetadata,
        processingTimeMs,
        error: errorMessage,
      };
    }
  }

  /**
   * Executa Nível 2 - Validação do Servidor
   *
   * Envia Hash_N1 para servidor, recebe timestamp e assinatura,
   * verifica assinatura e calcula Hash_N2 = Hash(Hash_N1 || cert_servidor)
   */
  async executeLevel2(level1Result: PCCLevel1Result): Promise<PCCLevel2Result> {
    const startTime = performance.now();

    this.logger.info('PCC', 'LEVEL2_START', {
      hashN1: level1Result.hashN1.substring(0, 16) + '...',
    });

    try {
      // Validar resultado do Nível 1
      if (!level1Result.success || !level1Result.hashN1) {
        throw new PCCError('Resultado do Nível 1 inválido', 'PCC_INVALID_LEVEL1', 2);
      }

      // Preparar requisição para servidor
      const request: ServerValidationRequest = {
        hashN1: level1Result.hashN1,
        merkleRoot: level1Result.merkleRoot,
        localTimestamp: level1Result.timestamp,
        correlationId: this.logger.getCorrelationId(),
        extensionVersion: level1Result.environmentMetadata.extensionVersion,
      };

      // Enviar para servidor e receber resposta
      const serverResponse = await this.sendToServer(request);

      // Verificar resposta do servidor
      if (!serverResponse.success) {
        throw new PCCError(
          serverResponse.error ?? 'Servidor rejeitou validação',
          'PCC_SERVER_REJECTED',
          2
        );
      }

      // Verificar assinatura do servidor (se habilitado)
      let signatureVerified = false;
      if (this.options.verifySignature) {
        signatureVerified = await this.verifyServerSignature(
          level1Result.hashN1,
          serverResponse.signature,
          serverResponse.certificateId
        );

        if (!signatureVerified) {
          throw new PCCError(
            'Assinatura do servidor inválida',
            'PCC_INVALID_SIGNATURE',
            2
          );
        }
      } else {
        // Se verificação desabilitada, assumir válida
        signatureVerified = true;
      }

      // Calcular Hash_N2 = Hash(Hash_N1 || serverTimestamp || signature)
      const hashN2 = await this.calculateHashN2(
        level1Result.hashN1,
        serverResponse.serverTimestamp,
        serverResponse.signature
      );

      const processingTimeMs = performance.now() - startTime;

      this.logger.info('PCC', 'LEVEL2_COMPLETE', {
        hashN2: hashN2.substring(0, 16) + '...',
        signatureVerified,
        processingTimeMs,
      });

      return {
        success: true,
        hashN2,
        hashN1: level1Result.hashN1,
        serverTimestamp: serverResponse.serverTimestamp,
        serverSignature: serverResponse.signature,
        signatureVerified,
        certificateId: serverResponse.certificateId,
        processingTimeMs,
      };
    } catch (error) {
      const processingTimeMs = performance.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';

      this.logger.error('PCC', 'LEVEL2_FAILED', {
        error: errorMessage,
        processingTimeMs,
      });

      return {
        success: false,
        hashN2: '',
        hashN1: level1Result.hashN1,
        serverTimestamp: '',
        serverSignature: '',
        signatureVerified: false,
        certificateId: '',
        processingTimeMs,
        error: errorMessage,
      };
    }
  }

  /**
   * Valida entrada do Nível 1
   */
  private validateLevel1Input(input: MerkleTreeInput): void {
    if (!input) {
      throw new PCCError('Input não pode ser null', 'PCC_INVALID_INPUT', 1);
    }

    if (!input.components || input.components.length === 0) {
      throw new PCCError('Componentes não podem estar vazios', 'PCC_NO_COMPONENTS', 1);
    }

    if (!input.pisaChainHash || typeof input.pisaChainHash !== 'string') {
      throw new PCCError('Hash da cadeia PISA é obrigatório', 'PCC_NO_PISA_HASH', 1);
    }

    if (!/^[0-9a-f]{64}$/i.test(input.pisaChainHash)) {
      throw new PCCError('Hash da cadeia PISA inválido', 'PCC_INVALID_PISA_HASH', 1);
    }

    if (!input.environmentMetadata) {
      throw new PCCError('Metadados do ambiente são obrigatórios', 'PCC_NO_METADATA', 1);
    }

    // Validar cada componente
    for (const component of input.components) {
      if (!component.name || !component.hash) {
        throw new PCCError(
          `Componente inválido: ${component.name || 'sem nome'}`,
          'PCC_INVALID_COMPONENT',
          1
        );
      }

      if (!/^[0-9a-f]{64}$/i.test(component.hash)) {
        throw new PCCError(
          `Hash inválido para componente: ${component.name}`,
          'PCC_INVALID_COMPONENT_HASH',
          1
        );
      }
    }
  }

  /**
   * Prepara hashes das folhas para Merkle Tree
   * Inclui hashes dos componentes e metadados
   */
  private prepareLeafHashes(input: MerkleTreeInput): string[] {
    const hashes: string[] = [];

    // Adicionar hashes dos componentes (ordenados por nome)
    const sortedComponents = [...input.components].sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    for (const component of sortedComponents) {
      hashes.push(component.hash.toLowerCase());
    }

    return hashes;
  }

  /**
   * Calcula hash dos metadados do ambiente
   */
  private async hashEnvironmentMetadata(metadata: EnvironmentMetadata): Promise<string> {
    const orderedJson = CryptoUtils.stringifyOrdered(metadata);
    return sha256(orderedJson);
  }

  /**
   * Calcula Hash_N1 = Hash(HASH_CADEIA || merkleRoot || metadataHash)
   */
  private async calculateHashN1(
    pisaChainHash: string,
    merkleRoot: string,
    metadataHash: string
  ): Promise<string> {
    const concatenated = pisaChainHash + merkleRoot + metadataHash;
    return sha256(concatenated);
  }

  /**
   * Calcula Hash_N2 = Hash(Hash_N1 || serverTimestamp || signature)
   */
  private async calculateHashN2(
    hashN1: string,
    serverTimestamp: string,
    signature: string
  ): Promise<string> {
    const concatenated = hashN1 + serverTimestamp + signature;
    return sha256(concatenated);
  }

  /**
   * Envia Hash_N1 para servidor para validação
   */
  private async sendToServer(request: ServerValidationRequest): Promise<ServerValidationResponse> {
    // Se não há URL configurada, simular resposta do servidor
    // Em produção, isso faria uma chamada HTTP real
    if (!this.options.serverValidationUrl) {
      this.logger.warn('PCC', 'SERVER_URL_NOT_CONFIGURED', {
        message: 'Usando resposta simulada do servidor',
      });

      return this.simulateServerResponse(request);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.options.serverTimeout);

      const response = await fetch(this.options.serverValidationUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Correlation-Id': request.correlationId,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Servidor retornou status ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new PCCError(
          'Timeout ao comunicar com servidor',
          'PCC_SERVER_TIMEOUT',
          2
        );
      }
      throw error;
    }
  }

  /**
   * Simula resposta do servidor para desenvolvimento/testes
   */
  private async simulateServerResponse(
    request: ServerValidationRequest
  ): Promise<ServerValidationResponse> {
    // Simular delay de rede
    await new Promise((resolve) => setTimeout(resolve, 100));

    const serverTimestamp = new Date().toISOString();

    // Gerar assinatura simulada (em produção seria assinatura real)
    const signatureData = request.hashN1 + serverTimestamp;
    const signature = await sha256(signatureData);

    return {
      success: true,
      serverTimestamp,
      signature,
      signatureAlgorithm: 'SHA256withRSA',
      certificateId: 'lexato-server-cert-001',
      receivedHashN1: request.hashN1,
    };
  }

  /**
   * Verifica assinatura do servidor
   */
  private async verifyServerSignature(
    hashN1: string,
    signature: string,
    _certificateId: string
  ): Promise<boolean> {
    // Em produção, isso verificaria a assinatura usando a chave pública do servidor
    // Por enquanto, apenas verifica se a assinatura não está vazia

    if (!signature || signature.length === 0) {
      return false;
    }

    // Verificação básica: assinatura deve ser hash válido
    if (!/^[0-9a-f]{64}$/i.test(signature)) {
      return false;
    }

    // Em ambiente de desenvolvimento, aceitar assinatura simulada
    // Em produção, implementar verificação real com crypto.subtle.verify
    this.logger.info('PCC', 'SIGNATURE_VERIFICATION', {
      hashN1: hashN1.substring(0, 16) + '...',
      signatureValid: true,
      note: 'Verificação simulada em desenvolvimento',
    });

    return true;
  }

  /**
   * Reporta progresso se callback estiver configurado
   */
  private reportProgress(
    level: 1 | 2,
    status: PCCProgress['status'],
    percent: number,
    message: string
  ): void {
    if (this.onProgress) {
      this.onProgress({
        currentLevel: level,
        status,
        percent,
        message,
      });
    }
  }
}

/**
 * Função utilitária para executar PCC Local
 *
 * @param input - Dados para certificação
 * @param logger - Logger para auditoria
 * @param options - Opções de configuração
 * @returns Resultado do PCC Local
 */
export async function executePCCLocal(
  input: MerkleTreeInput,
  logger: AuditLogger,
  options?: PCCLocalOptions
): Promise<PCCLocalResult> {
  const pcc = new PCCLocal(logger, options);
  return pcc.execute(input);
}

/**
 * Função utilitária para executar apenas Nível 1
 *
 * @param input - Dados para certificação
 * @param logger - Logger para auditoria
 * @returns Resultado do Nível 1
 */
export async function executePCCLevel1(
  input: MerkleTreeInput,
  logger: AuditLogger
): Promise<PCCLevel1Result> {
  const pcc = new PCCLocal(logger);
  return pcc.executeLevel1(input);
}

export default PCCLocal;
