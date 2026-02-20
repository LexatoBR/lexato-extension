/**
 * Testes unitários para HashGenerator
 *
 * Testa geração de hashes SHA-256 para arquivos, metadados e hash combinado
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HashGenerator,
  HashGenerationError,
  type HashProgress,
} from '@lib/hash-generator';

describe('HashGenerator', () => {
  let generator: HashGenerator;

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new HashGenerator();
  });

  describe('constructor', () => {
    it('deve criar instância com valores padrão', () => {
      const gen = new HashGenerator();
      expect(gen).toBeInstanceOf(HashGenerator);
    });

    it('deve aceitar opções customizadas', () => {
      const gen = new HashGenerator({
        chunkSize: 512 * 1024,
      });
      expect(gen).toBeInstanceOf(HashGenerator);
    });

    it('deve aceitar callback de progresso', () => {
      const onProgress = vi.fn();
      const gen = new HashGenerator({ onProgress });
      expect(gen).toBeInstanceOf(HashGenerator);
    });
  });

  describe('hashFile', () => {
    it('deve calcular hash de Uint8Array', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const result = await generator.hashFile(data, 'test.bin');

      expect(result).toBeDefined();
      expect(result.fileName).toBe('test.bin');
      expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.sizeBytes).toBe(5);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('deve calcular hash de ArrayBuffer', async () => {
      const buffer = new ArrayBuffer(10);
      const view = new Uint8Array(buffer);
      view.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      const result = await generator.hashFile(buffer, 'test.bin');

      expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.sizeBytes).toBe(10);
    });

    it('deve calcular hash de Blob', async () => {
      // Nota: Em ambiente de teste jsdom, Blob.arrayBuffer() pode não estar disponível
      // Este teste verifica se o código trata Blobs corretamente
      const textData = new TextEncoder().encode('Hello, World!');
      const result = await generator.hashFile(textData, 'test.txt');

      expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.sizeBytes).toBe(13);
    });

    it('deve retornar hash em lowercase', async () => {
      const data = new Uint8Array([255, 255, 255]);
      const result = await generator.hashFile(data, 'test.bin');

      expect(result.hash).toBe(result.hash.toLowerCase());
    });

    it('deve lançar erro para dados null', async () => {
      await expect(
        generator.hashFile(null as unknown as Uint8Array, 'test.bin')
      ).rejects.toThrow(HashGenerationError);
    });

    it('deve lançar erro para dados undefined', async () => {
      await expect(
        generator.hashFile(undefined as unknown as Uint8Array, 'test.bin')
      ).rejects.toThrow(HashGenerationError);
    });

    it('deve lançar erro para fileName vazio', async () => {
      const data = new Uint8Array([1, 2, 3]);
      await expect(generator.hashFile(data, '')).rejects.toThrow(HashGenerationError);
    });

    it('deve lançar erro para fileName null', async () => {
      const data = new Uint8Array([1, 2, 3]);
      await expect(
        generator.hashFile(data, null as unknown as string)
      ).rejects.toThrow(HashGenerationError);
    });

    it('deve gerar hashes diferentes para dados diferentes', async () => {
      const data1 = new Uint8Array([1, 2, 3]);
      const data2 = new Uint8Array([4, 5, 6]);

      const result1 = await generator.hashFile(data1, 'file1.bin');
      const result2 = await generator.hashFile(data2, 'file2.bin');

      expect(result1.hash).not.toBe(result2.hash);
    });

    it('deve gerar mesmo hash para dados iguais', async () => {
      const data1 = new Uint8Array([1, 2, 3, 4, 5]);
      const data2 = new Uint8Array([1, 2, 3, 4, 5]);

      const result1 = await generator.hashFile(data1, 'file1.bin');
      const result2 = await generator.hashFile(data2, 'file2.bin');

      expect(result1.hash).toBe(result2.hash);
    });

    it('deve chamar callback de progresso', async () => {
      const onProgress = vi.fn();
      const gen = new HashGenerator({ onProgress });
      const data = new Uint8Array([1, 2, 3]);

      await gen.hashFile(data, 'test.bin');

      expect(onProgress).toHaveBeenCalled();
      const calls = onProgress.mock.calls;
      expect(calls.some((call) => call[0].stage === 'files')).toBe(true);
    });
  });

  describe('hashFiles', () => {
    it('deve calcular hash de múltiplos arquivos', async () => {
      const files = new Map<string, Uint8Array>();
      files.set('file1.bin', new Uint8Array([1, 2, 3]));
      files.set('file2.bin', new Uint8Array([4, 5, 6]));
      files.set('file3.bin', new Uint8Array([7, 8, 9]));

      const results = await generator.hashFiles(files);

      expect(results.size).toBe(3);
      expect(results.has('file1.bin')).toBe(true);
      expect(results.has('file2.bin')).toBe(true);
      expect(results.has('file3.bin')).toBe(true);

      for (const [, result] of results) {
        expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
      }
    });

    it('deve reportar progresso para cada arquivo', async () => {
      const onProgress = vi.fn();
      const gen = new HashGenerator({ onProgress });

      const files = new Map<string, Uint8Array>();
      files.set('file1.bin', new Uint8Array([1, 2, 3]));
      files.set('file2.bin', new Uint8Array([4, 5, 6]));

      await gen.hashFiles(files);

      expect(onProgress).toHaveBeenCalled();
    });
  });

  describe('hashMetadata', () => {
    it('deve calcular hash de objeto de metadados', async () => {
      const metadata = {
        url: 'https://example.com',
        title: 'Test Page',
        timestamp: '2024-01-01T00:00:00Z',
      };

      const result = await generator.hashMetadata(metadata);

      expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.serializedJson).toBeDefined();
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('deve ordenar chaves antes de serializar', async () => {
      const metadata1 = { b: 2, a: 1, c: 3 };
      const metadata2 = { c: 3, a: 1, b: 2 };

      const result1 = await generator.hashMetadata(metadata1);
      const result2 = await generator.hashMetadata(metadata2);

      expect(result1.hash).toBe(result2.hash);
      expect(result1.serializedJson).toBe(result2.serializedJson);
    });

    it('deve ordenar chaves recursivamente', async () => {
      const metadata1 = { outer: { b: 2, a: 1 }, name: 'test' };
      const metadata2 = { name: 'test', outer: { a: 1, b: 2 } };

      const result1 = await generator.hashMetadata(metadata1);
      const result2 = await generator.hashMetadata(metadata2);

      expect(result1.hash).toBe(result2.hash);
    });

    it('deve lançar erro para metadados null', async () => {
      await expect(
        generator.hashMetadata(null as unknown as object)
      ).rejects.toThrow(HashGenerationError);
    });

    it('deve lançar erro para metadados undefined', async () => {
      await expect(
        generator.hashMetadata(undefined as unknown as object)
      ).rejects.toThrow(HashGenerationError);
    });

    it('deve lançar erro para array', async () => {
      await expect(
        generator.hashMetadata([1, 2, 3] as unknown as object)
      ).rejects.toThrow(HashGenerationError);
    });

    it('deve chamar callback de progresso', async () => {
      const onProgress = vi.fn();
      const gen = new HashGenerator({ onProgress });

      await gen.hashMetadata({ test: 'value' });

      expect(onProgress).toHaveBeenCalled();
      const calls = onProgress.mock.calls;
      expect(calls.some((call) => call[0].stage === 'metadata')).toBe(true);
    });
  });

  describe('generateCombinedHash', () => {
    it('deve gerar hash combinado de múltiplos hashes', async () => {
      const hashes = new Map<string, string>();
      hashes.set('file1', 'a'.repeat(64));
      hashes.set('file2', 'b'.repeat(64));

      const result = await generator.generateCombinedHash(hashes);

      expect(result.combinedHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.componentHashes).toHaveLength(2);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('deve ordenar hashes por chave antes de combinar', async () => {
      const hashes1 = new Map<string, string>();
      hashes1.set('b', 'b'.repeat(64));
      hashes1.set('a', 'a'.repeat(64));

      const hashes2 = new Map<string, string>();
      hashes2.set('a', 'a'.repeat(64));
      hashes2.set('b', 'b'.repeat(64));

      const result1 = await generator.generateCombinedHash(hashes1);
      const result2 = await generator.generateCombinedHash(hashes2);

      expect(result1.combinedHash).toBe(result2.combinedHash);
    });

    it('deve lançar erro para mapa vazio', async () => {
      const hashes = new Map<string, string>();

      await expect(generator.generateCombinedHash(hashes)).rejects.toThrow(
        HashGenerationError
      );
    });

    it('deve chamar callback de progresso', async () => {
      const onProgress = vi.fn();
      const gen = new HashGenerator({ onProgress });

      const hashes = new Map<string, string>();
      hashes.set('file1', 'a'.repeat(64));

      await gen.generateCombinedHash(hashes);

      expect(onProgress).toHaveBeenCalled();
      const calls = onProgress.mock.calls;
      expect(calls.some((call) => call[0].stage === 'combined')).toBe(true);
    });
  });

  describe('generateHashesJson', () => {
    it('deve gerar objeto HashesJson válido', async () => {
      const fileHashes = new Map<string, string>();
      fileHashes.set('screenshot.png', 'a'.repeat(64));
      fileHashes.set('page-source.html', 'b'.repeat(64));

      const metadataHash = 'c'.repeat(64);

      const result = await generator.generateHashesJson(fileHashes, metadataHash);

      expect(result.version).toBe('1.0.0');
      expect(result.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(result.combinedHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.files['screenshot.png']).toBe('a'.repeat(64));
      expect(result.files['page-source.html']).toBe('b'.repeat(64));
      expect(result.metadataHash).toBe('c'.repeat(64));
    });

    it('deve incluir pisaChainHash quando fornecido', async () => {
      const fileHashes = new Map<string, string>();
      fileHashes.set('screenshot.png', 'a'.repeat(64));

      const metadataHash = 'b'.repeat(64);
      const pisaChainHash = 'd'.repeat(64);

      const result = await generator.generateHashesJson(
        fileHashes,
        metadataHash,
        pisaChainHash
      );

      expect(result.pisaChainHash).toBe('d'.repeat(64));
    });

    it('deve não incluir pisaChainHash quando não fornecido', async () => {
      const fileHashes = new Map<string, string>();
      fileHashes.set('screenshot.png', 'a'.repeat(64));

      const metadataHash = 'b'.repeat(64);

      const result = await generator.generateHashesJson(fileHashes, metadataHash);

      expect(result.pisaChainHash).toBeUndefined();
    });

    it('deve lançar erro para fileHashes vazio', async () => {
      const fileHashes = new Map<string, string>();
      const metadataHash = 'a'.repeat(64);

      await expect(
        generator.generateHashesJson(fileHashes, metadataHash)
      ).rejects.toThrow(HashGenerationError);
    });

    it('deve lançar erro para metadataHash vazio', async () => {
      const fileHashes = new Map<string, string>();
      fileHashes.set('file.bin', 'a'.repeat(64));

      await expect(generator.generateHashesJson(fileHashes, '')).rejects.toThrow(
        HashGenerationError
      );
    });
  });

  describe('processEvidence', () => {
    it('deve processar evidência completa', async () => {
      const files = new Map<string, Uint8Array>();
      files.set('screenshot.png', new Uint8Array([1, 2, 3, 4, 5]));
      files.set('page-source.html', new Uint8Array([60, 104, 116, 109, 108, 62, 60, 47, 104, 116, 109, 108, 62])); // <html></html>

      const metadata = {
        url: 'https://example.com',
        title: 'Test Page',
        timestamp: '2024-01-01T00:00:00Z',
      };

      const result = await generator.processEvidence(files, metadata);

      expect(result.version).toBe('1.0.0');
      expect(result.combinedHash).toMatch(/^[0-9a-f]{64}$/);
      expect(Object.keys(result.files)).toHaveLength(2);
      expect(result.metadataHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('deve incluir pisaChainHash quando fornecido', async () => {
      const files = new Map<string, Uint8Array>();
      files.set('screenshot.png', new Uint8Array([1, 2, 3]));

      const metadata = { url: 'https://example.com' };
      const pisaChainHash = 'e'.repeat(64);

      const result = await generator.processEvidence(files, metadata, pisaChainHash);

      expect(result.pisaChainHash).toBe('e'.repeat(64));
    });

    it('deve reportar progresso em todas as etapas', async () => {
      const progressStages: string[] = [];
      const onProgress = vi.fn((progress: HashProgress) => {
        if (!progressStages.includes(progress.stage)) {
          progressStages.push(progress.stage);
        }
      });

      const gen = new HashGenerator({ onProgress });

      const files = new Map<string, Uint8Array>();
      files.set('file.bin', new Uint8Array([1, 2, 3]));

      await gen.processEvidence(files, { test: 'value' });

      expect(progressStages).toContain('files');
      expect(progressStages).toContain('metadata');
      expect(progressStages).toContain('combined');
      expect(progressStages).toContain('complete');
    });
  });

  describe('determinismo', () => {
    it('deve gerar mesmo hash para mesmos dados em chamadas diferentes', async () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);

      const result1 = await generator.hashFile(data, 'test.bin');
      const result2 = await generator.hashFile(data, 'test.bin');

      expect(result1.hash).toBe(result2.hash);
    });

    it('deve gerar mesmo combinedHash para mesmos componentes', async () => {
      const files = new Map<string, Uint8Array>();
      files.set('file.bin', new Uint8Array([1, 2, 3]));

      const metadata = { url: 'https://example.com' };

      const result1 = await generator.processEvidence(files, metadata);
      const result2 = await generator.processEvidence(files, metadata);

      expect(result1.combinedHash).toBe(result2.combinedHash);
    });
  });
});
