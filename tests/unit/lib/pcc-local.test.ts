/**
 * Testes unitários para PCCLocal
 *
 * Testa o Processo de Certificação em Cascata (Níveis 1-2)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PCCLocal,
  PCCError,
  executePCCLocal,
  executePCCLevel1,
} from '@lib/pcc-local';
import { AuditLogger } from '@lib/audit-logger';
import { sha256 } from 'hash-wasm';
import type {
  MerkleTreeInput,
  EvidenceComponent,
  EnvironmentMetadata,
  PCCProgress,
} from '../../../src/types/pcc.types';

/**
 * Cria metadados de ambiente para testes
 */
function createTestEnvironmentMetadata(): EnvironmentMetadata {
  return {
    extensionVersion: '1.0.0',
    userAgent: 'Mozilla/5.0 (Test)',
    timestamp: new Date().toISOString(),
    url: 'https://example.com/test',
    pageTitle: 'Página de Teste',
    viewport: { width: 1920, height: 1080 },
    captureType: 'screenshot',
    storageType: 'standard',
  };
}

/**
 * Cria componentes de evidência para testes
 */
async function createTestComponents(count: number): Promise<EvidenceComponent[]> {
  const components: EvidenceComponent[] = [];
  for (let i = 0; i < count; i++) {
    const hash = await sha256(`component-${i}-data`);
    components.push({
      name: `component-${i}.bin`,
      hash,
      type: 'other',
      sizeBytes: 1024 * (i + 1),
    });
  }
  return components;
}

/**
 * Cria input válido para Merkle Tree
 */
async function createTestInput(componentCount = 3): Promise<MerkleTreeInput> {
  const pisaChainHash = await sha256('pisa-chain-test-data');
  return {
    components: await createTestComponents(componentCount),
    pisaChainHash,
    environmentMetadata: createTestEnvironmentMetadata(),
  };
}

describe('PCCLocal', () => {
  let logger: AuditLogger;
  let pcc: PCCLocal;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new AuditLogger('test-correlation-id');
    pcc = new PCCLocal(logger);
  });

  describe('constructor', () => {
    it('deve criar instância com logger', () => {
      const instance = new PCCLocal(logger);
      expect(instance).toBeInstanceOf(PCCLocal);
    });

    it('deve aceitar opções customizadas', () => {
      const instance = new PCCLocal(logger, {
        serverValidationUrl: 'https://api.lexato.com/validate',
        serverTimeout: 60000,
        verifySignature: false,
      });
      expect(instance).toBeInstanceOf(PCCLocal);
    });

    it('deve aceitar callback de progresso', () => {
      const onProgress = vi.fn();
      const instance = new PCCLocal(logger, { onProgress });
      expect(instance).toBeInstanceOf(PCCLocal);
    });
  });

  describe('executeLevel1', () => {
    it('deve executar Nível 1 com sucesso', async () => {
      const input = await createTestInput();
      const result = await pcc.executeLevel1(input);

      expect(result.success).toBe(true);
      expect(result.hashN1).toMatch(/^[0-9a-f]{64}$/);
      expect(result.merkleRoot).toMatch(/^[0-9a-f]{64}$/);
      expect(result.leafHashes).toHaveLength(3);
      expect(result.componentCount).toBe(3);
      expect(result.timestamp).toBeDefined();
      expect(result.pisaChainHash).toBe(input.pisaChainHash);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('deve gerar hashN1 diferente para componentes diferentes', async () => {
      const input1 = await createTestInput(2);
      const input2 = await createTestInput(3);

      const result1 = await pcc.executeLevel1(input1);
      const result2 = await pcc.executeLevel1(input2);

      expect(result1.hashN1).not.toBe(result2.hashN1);
    });

    it('deve gerar mesmo hashN1 para mesmos dados', async () => {
      const input = await createTestInput();

      const result1 = await pcc.executeLevel1(input);
      const result2 = await pcc.executeLevel1(input);

      expect(result1.hashN1).toBe(result2.hashN1);
      expect(result1.merkleRoot).toBe(result2.merkleRoot);
    });

    it('deve ordenar componentes por nome antes de criar Merkle Tree', async () => {
      const pisaChainHash = await sha256('pisa-chain-test');
      const hash1 = await sha256('data-1');
      const hash2 = await sha256('data-2');

      const input1: MerkleTreeInput = {
        components: [
          { name: 'a.bin', hash: hash1, type: 'other' },
          { name: 'b.bin', hash: hash2, type: 'other' },
        ],
        pisaChainHash,
        environmentMetadata: createTestEnvironmentMetadata(),
      };

      const input2: MerkleTreeInput = {
        components: [
          { name: 'b.bin', hash: hash2, type: 'other' },
          { name: 'a.bin', hash: hash1, type: 'other' },
        ],
        pisaChainHash,
        environmentMetadata: createTestEnvironmentMetadata(),
      };

      const result1 = await pcc.executeLevel1(input1);
      const result2 = await pcc.executeLevel1(input2);

      // Deve gerar mesmo merkleRoot pois componentes são ordenados
      expect(result1.merkleRoot).toBe(result2.merkleRoot);
    });

    it('deve falhar para componentes vazios', async () => {
      const input: MerkleTreeInput = {
        components: [],
        pisaChainHash: 'a'.repeat(64),
        environmentMetadata: createTestEnvironmentMetadata(),
      };

      const result = await pcc.executeLevel1(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('vazios');
    });

    it('deve falhar para pisaChainHash inválido', async () => {
      const input: MerkleTreeInput = {
        components: await createTestComponents(1),
        pisaChainHash: 'invalid-hash',
        environmentMetadata: createTestEnvironmentMetadata(),
      };

      const result = await pcc.executeLevel1(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('inválido');
    });

    it('deve falhar para pisaChainHash vazio', async () => {
      const input: MerkleTreeInput = {
        components: await createTestComponents(1),
        pisaChainHash: '',
        environmentMetadata: createTestEnvironmentMetadata(),
      };

      const result = await pcc.executeLevel1(input);

      expect(result.success).toBe(false);
    });

    it('deve falhar para componente com hash inválido', async () => {
      const input: MerkleTreeInput = {
        components: [{ name: 'test.bin', hash: 'invalid', type: 'other' }],
        pisaChainHash: 'a'.repeat(64),
        environmentMetadata: createTestEnvironmentMetadata(),
      };

      const result = await pcc.executeLevel1(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('inválido');
    });

    it('deve falhar para metadados ausentes', async () => {
      const input = {
        components: await createTestComponents(1),
        pisaChainHash: 'a'.repeat(64),
        environmentMetadata: null,
      } as unknown as MerkleTreeInput;

      const result = await pcc.executeLevel1(input);

      expect(result.success).toBe(false);
      expect(result.error).toContain('obrigatórios');
    });
  });

  describe('executeLevel2', () => {
    it('deve executar Nível 2 com sucesso (servidor simulado)', async () => {
      const input = await createTestInput();
      const level1Result = await pcc.executeLevel1(input);

      expect(level1Result.success).toBe(true);

      const level2Result = await pcc.executeLevel2(level1Result);

      expect(level2Result.success).toBe(true);
      expect(level2Result.hashN2).toMatch(/^[0-9a-f]{64}$/);
      expect(level2Result.hashN1).toBe(level1Result.hashN1);
      expect(level2Result.serverTimestamp).toBeDefined();
      expect(level2Result.serverSignature).toMatch(/^[0-9a-f]{64}$/);
      expect(level2Result.signatureVerified).toBe(true);
      expect(level2Result.certificateId).toBeDefined();
      expect(level2Result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('deve falhar para resultado do Nível 1 inválido', async () => {
      const invalidLevel1 = {
        success: false,
        hashN1: '',
        merkleRoot: '',
        leafHashes: [],
        componentCount: 0,
        timestamp: new Date().toISOString(),
        pisaChainHash: '',
        environmentMetadata: createTestEnvironmentMetadata(),
        processingTimeMs: 0,
        error: 'Erro anterior',
      };

      const result = await pcc.executeLevel2(invalidLevel1);

      expect(result.success).toBe(false);
      expect(result.error).toContain('inválido');
    });

    it('deve gerar hashN2 diferente para hashN1 diferentes', async () => {
      const input1 = await createTestInput(2);
      const input2 = await createTestInput(3);

      const level1Result1 = await pcc.executeLevel1(input1);
      const level1Result2 = await pcc.executeLevel1(input2);

      const level2Result1 = await pcc.executeLevel2(level1Result1);
      const level2Result2 = await pcc.executeLevel2(level1Result2);

      expect(level2Result1.hashN2).not.toBe(level2Result2.hashN2);
    });
  });

  describe('execute (fluxo completo)', () => {
    it('deve executar PCC Local completo com sucesso', async () => {
      const input = await createTestInput();
      const result = await pcc.execute(input);

      expect(result.success).toBe(true);
      expect(result.level1.success).toBe(true);
      expect(result.level2.success).toBe(true);
      expect(result.finalHash).toBe(result.level2.hashN2);
      expect(result.totalProcessingTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it('deve reportar progresso durante execução', async () => {
      const progressUpdates: PCCProgress[] = [];
      const onProgress = vi.fn((progress: PCCProgress) => {
        progressUpdates.push({ ...progress });
      });

      const pccWithProgress = new PCCLocal(logger, { onProgress });
      const input = await createTestInput();

      await pccWithProgress.execute(input);

      expect(onProgress).toHaveBeenCalled();
      expect(progressUpdates.length).toBeGreaterThan(0);

      // Verificar que passou pelos níveis 1 e 2
      const levels = progressUpdates.map((p) => p.currentLevel);
      expect(levels).toContain(1);
      expect(levels).toContain(2);
    });

    it('deve retornar erro parcial quando Nível 1 falha', async () => {
      const input: MerkleTreeInput = {
        components: [],
        pisaChainHash: 'a'.repeat(64),
        environmentMetadata: createTestEnvironmentMetadata(),
      };

      const result = await pcc.execute(input);

      expect(result.success).toBe(false);
      expect(result.level1.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('deve incluir tempo total de processamento', async () => {
      const input = await createTestInput();
      const result = await pcc.execute(input);

      expect(result.totalProcessingTimeMs).toBeGreaterThan(0);
      expect(result.totalProcessingTimeMs).toBeGreaterThanOrEqual(
        result.level1.processingTimeMs + result.level2.processingTimeMs
      );
    });
  });

  describe('PCCError', () => {
    it('deve criar erro com código e nível', () => {
      const error = new PCCError('Mensagem de erro', 'PCC_TEST_ERROR', 1);

      expect(error.message).toBe('Mensagem de erro');
      expect(error.code).toBe('PCC_TEST_ERROR');
      expect(error.level).toBe(1);
      expect(error.name).toBe('PCCError');
    });

    it('deve criar erro sem nível', () => {
      const error = new PCCError('Erro genérico', 'PCC_GENERIC');

      expect(error.level).toBeUndefined();
    });
  });

  describe('funções utilitárias', () => {
    it('executePCCLocal deve executar fluxo completo', async () => {
      const input = await createTestInput();
      const result = await executePCCLocal(input, logger);

      expect(result.success).toBe(true);
      expect(result.finalHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('executePCCLevel1 deve executar apenas Nível 1', async () => {
      const input = await createTestInput();
      const result = await executePCCLevel1(input, logger);

      expect(result.success).toBe(true);
      expect(result.hashN1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('executePCCLocal deve aceitar opções', async () => {
      const onProgress = vi.fn();
      const input = await createTestInput();

      const result = await executePCCLocal(input, logger, { onProgress });

      expect(result.success).toBe(true);
      expect(onProgress).toHaveBeenCalled();
    });
  });

  describe('determinismo', () => {
    it('deve gerar mesmo resultado para mesmos dados de entrada', async () => {
      const input = await createTestInput();

      const result1 = await pcc.execute(input);
      const result2 = await pcc.execute(input);

      expect(result1.level1.hashN1).toBe(result2.level1.hashN1);
      expect(result1.level1.merkleRoot).toBe(result2.level1.merkleRoot);
    });

    it('deve gerar resultados diferentes para dados diferentes', async () => {
      const input1 = await createTestInput(2);
      const input2 = await createTestInput(4);

      const result1 = await pcc.execute(input1);
      const result2 = await pcc.execute(input2);

      expect(result1.level1.hashN1).not.toBe(result2.level1.hashN1);
    });
  });

  describe('integração com AuditLogger', () => {
    it('deve usar correlationId do logger', async () => {
      const customLogger = new AuditLogger('custom-id-123');
      const customPcc = new PCCLocal(customLogger);
      const input = await createTestInput();

      const result = await customPcc.execute(input);

      expect(result.success).toBe(true);
      expect(customLogger.getCorrelationId()).toBe('custom-id-123');
    });
  });
});
