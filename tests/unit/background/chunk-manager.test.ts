/**
 * Testes para ChunkManager
 *
 * Inclui testes unitários e property-based tests para validar
 * o encadeamento de hashes conforme Requirements 2.2, 2.3
 *
 * @module ChunkManagerTests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  ChunkManager,
  ChunkManagerError,
  type VideoChunk,
} from '@background/chunk-manager';

describe('ChunkManager', () => {
  let manager: ChunkManager;

  beforeEach(() => {
    manager = new ChunkManager();
  });

  describe('processChunk', () => {
    it('deve processar chunk e calcular hash', async () => {
      const data = new Blob(['test data'], { type: 'video/webm' });
      const chunk = await manager.processChunk(data, 0);

      expect(chunk.index).toBe(0);
      expect(chunk.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(chunk.previousHash).toBeNull();
      expect(chunk.sizeBytes).toBe(data.size);
      expect(chunk.uploadStatus).toBe('pending');
      expect(chunk.partNumber).toBe(1);
    });

    it('deve encadear hash do chunk anterior', async () => {
      const chunk1 = await manager.processChunk(new Blob(['chunk 1']), 0);
      const chunk2 = await manager.processChunk(new Blob(['chunk 2']), 1);

      expect(chunk2.previousHash).toBe(chunk1.hash);
    });

    it('deve lançar erro para índice fora de sequência', async () => {
      await expect(manager.processChunk(new Blob(['data']), 5)).rejects.toThrow(
        ChunkManagerError
      );
    });

    it('deve lançar erro para índice negativo', async () => {
      await expect(manager.processChunk(new Blob(['data']), -1)).rejects.toThrow(
        ChunkManagerError
      );
    });

    it('deve lançar erro para dados inválidos', async () => {
      await expect(
        manager.processChunk(null as unknown as Blob, 0)
      ).rejects.toThrow(ChunkManagerError);
    });
  });

  describe('calculateMerkleRoot', () => {
    it('deve calcular Merkle Root de chunks', async () => {
      await manager.processChunk(new Blob(['chunk 1']), 0);
      await manager.processChunk(new Blob(['chunk 2']), 1);

      const merkleRoot = await manager.calculateMerkleRoot();

      expect(merkleRoot).toMatch(/^[0-9a-f]{64}$/);
    });

    it('deve lançar erro se não houver chunks', async () => {
      await expect(manager.calculateMerkleRoot()).rejects.toThrow(
        ChunkManagerError
      );
    });

    it('deve ser determinístico para mesmos chunks', async () => {
      await manager.processChunk(new Blob(['chunk 1']), 0);
      await manager.processChunk(new Blob(['chunk 2']), 1);
      const root1 = await manager.calculateMerkleRoot();

      const manager2 = new ChunkManager();
      await manager2.processChunk(new Blob(['chunk 1']), 0);
      await manager2.processChunk(new Blob(['chunk 2']), 1);
      const root2 = await manager2.calculateMerkleRoot();

      expect(root1).toBe(root2);
    });
  });

  describe('getChunksForManifest', () => {
    it('deve retornar dados dos chunks para manifesto', async () => {
      await manager.processChunk(new Blob(['chunk 1']), 0);
      await manager.processChunk(new Blob(['chunk 2']), 1);

      const manifestData = manager.getChunksForManifest();

      expect(manifestData).toHaveLength(2);
      expect(manifestData[0]).toHaveProperty('index', 0);
      expect(manifestData[0]).toHaveProperty('hash');
      expect(manifestData[0]).toHaveProperty('previousHash', null);
      expect(manifestData[0]).toHaveProperty('sizeBytes');
      expect(manifestData[0]).toHaveProperty('timestamp');
      expect(manifestData[1]?.previousHash).toBe(manifestData[0]?.hash);
    });
  });

  describe('updateChunkStatus', () => {
    it('deve atualizar status do chunk', async () => {
      await manager.processChunk(new Blob(['data']), 0);

      manager.updateChunkStatus(0, 'uploading');
      expect(manager.getChunk(0)?.uploadStatus).toBe('uploading');
      expect(manager.getChunk(0)?.uploadAttempts).toBe(1);

      manager.updateChunkStatus(0, 'uploaded', 'etag-123');
      expect(manager.getChunk(0)?.uploadStatus).toBe('uploaded');
      expect(manager.getChunk(0)?.etag).toBe('etag-123');
    });

    it('deve lançar erro para chunk inexistente', () => {
      expect(() => manager.updateChunkStatus(99, 'uploaded')).toThrow(
        ChunkManagerError
      );
    });
  });

  describe('verifyChainIntegrity', () => {
    it('deve retornar true para cadeia íntegra', async () => {
      await manager.processChunk(new Blob(['chunk 1']), 0);
      await manager.processChunk(new Blob(['chunk 2']), 1);
      await manager.processChunk(new Blob(['chunk 3']), 2);

      expect(manager.verifyChainIntegrity()).toBe(true);
    });

    it('deve retornar true para buffer vazio', () => {
      expect(manager.verifyChainIntegrity()).toBe(true);
    });
  });

  describe('clear', () => {
    it('deve limpar todos os chunks', async () => {
      await manager.processChunk(new Blob(['chunk 1']), 0);
      await manager.processChunk(new Blob(['chunk 2']), 1);

      manager.clear();

      expect(manager.getChunkCount()).toBe(0);
      expect(manager.getAllChunks()).toHaveLength(0);
    });
  });

  describe('getPendingChunks', () => {
    it('deve retornar chunks pendentes', async () => {
      await manager.processChunk(new Blob(['chunk 1']), 0);
      await manager.processChunk(new Blob(['chunk 2']), 1);

      manager.updateChunkStatus(0, 'uploaded');

      const pending = manager.getPendingChunks();
      expect(pending).toHaveLength(1);
      expect(pending[0]?.index).toBe(1);
    });
  });

  // ============================================================================
  // Property-Based Tests
  // ============================================================================

  describe('Property Tests - Encadeamento de Hashes', () => {
    /**
     * Property 1: Encadeamento de Hashes
     *
     * Para qualquer sequência de chunks, cada chunk (exceto primeiro)
     * contém referência ao hash anterior.
     *
     * @validates Requirements 2.2, 2.3
     */
    it('Property 1: chunks devem formar cadeia de hashes válida', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.uint8Array({ minLength: 10, maxLength: 1000 }),
            { minLength: 2, maxLength: 10 }
          ),
          async (chunksData) => {
            const testManager = new ChunkManager();
            const processedChunks: VideoChunk[] = [];

            // Processar todos os chunks
            for (let i = 0; i < chunksData.length; i++) {
              const chunkData = chunksData[i];
              if (!chunkData) {
                continue;
              }
              const chunk = await testManager.processChunk(
                new Blob([chunkData]),
                i
              );
              processedChunks.push(chunk);
            }

            // Verificar encadeamento
            // Primeiro chunk deve ter previousHash null
            expect(processedChunks[0]?.previousHash).toBeNull();

            // Cada chunk subsequente deve referenciar o hash do anterior
            for (let i = 1; i < processedChunks.length; i++) {
              const currentChunk = processedChunks[i];
              const previousChunk = processedChunks[i - 1];

              expect(currentChunk?.previousHash).toBe(previousChunk?.hash);
            }

            // Verificar integridade usando método interno
            expect(testManager.verifyChainIntegrity()).toBe(true);
          }
        ),
        { numRuns: 50 }
      );
    });

    /**
     * Property: Hashes únicos para dados diferentes
     *
     * Para qualquer par de chunks com dados diferentes,
     * os hashes devem ser diferentes.
     */
    it('Property: hashes devem ser únicos para dados diferentes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uint8Array({ minLength: 10, maxLength: 500 }),
          fc.uint8Array({ minLength: 10, maxLength: 500 }),
          async (data1, data2) => {
            // Pular se dados forem iguais
            if (data1.length === data2.length) {
              let equal = true;
              for (let i = 0; i < data1.length; i++) {
                if (data1[i] !== data2[i]) {
                  equal = false;
                  break;
                }
              }
              if (equal) {
                return;
              }
            }

            const manager1 = new ChunkManager();
            const manager2 = new ChunkManager();

            const chunk1 = await manager1.processChunk(new Blob([data1]), 0);
            const chunk2 = await manager2.processChunk(new Blob([data2]), 0);

            expect(chunk1.hash).not.toBe(chunk2.hash);
          }
        ),
        { numRuns: 30 }
      );
    });

    /**
     * Property: Merkle Root determinístico
     *
     * Para qualquer sequência de chunks, calcular Merkle Root
     * duas vezes deve produzir o mesmo resultado.
     */
    it('Property: Merkle Root deve ser determinístico', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.uint8Array({ minLength: 10, maxLength: 500 }),
            { minLength: 1, maxLength: 5 }
          ),
          async (chunksData) => {
            const manager1 = new ChunkManager();
            const manager2 = new ChunkManager();

            // Processar mesmos chunks em ambos managers
            for (let i = 0; i < chunksData.length; i++) {
              const chunkData = chunksData[i];
              if (!chunkData) {
                continue;
              }
              await manager1.processChunk(new Blob([chunkData]), i);
              await manager2.processChunk(new Blob([chunkData]), i);
            }

            const root1 = await manager1.calculateMerkleRoot();
            const root2 = await manager2.calculateMerkleRoot();

            expect(root1).toBe(root2);
          }
        ),
        { numRuns: 30 }
      );
    });
  });
});
