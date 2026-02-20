/**
 * Testes unitários para crypto-helper do Pipeline de Evidências
 *
 * Testa funções de hash SHA-256, Merkle Root e geração de UUID v4
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calcularHashSHA256,
  calcularHashSHA256Blob,
  calcularHashSHA256BlobIncremental,
  calcularHashSHA256Base64Incremental,
  calcularMerkleRoot,
  gerarUUIDv4,
  isValidUUIDv4,
  isValidSHA256,
  InvalidInputError,
} from '@lib/evidence-pipeline/crypto-helper';

describe('CryptoHelper - Pipeline de Evidências', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calcularHashSHA256', () => {
    it('deve calcular hash SHA-256 de uma string', async () => {
      const result = await calcularHashSHA256('test');
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBe(64); // SHA-256 = 64 caracteres hex
      expect(result).toMatch(/^[0-9a-f]+$/); // lowercase hex
    });

    it('deve calcular hash SHA-256 de um ArrayBuffer', async () => {
      const encoder = new TextEncoder();
      const buffer = encoder.encode('test').buffer;
      const result = await calcularHashSHA256(buffer);
      expect(result).toBeDefined();
      expect(result.length).toBe(64);
    });

    it('deve retornar mesmo hash para mesma string', async () => {
      const hash1 = await calcularHashSHA256('dados de teste');
      const hash2 = await calcularHashSHA256('dados de teste');
      expect(hash1).toBe(hash2);
    });

    it('deve retornar hashes diferentes para strings diferentes', async () => {
      const hash1 = await calcularHashSHA256('dados 1');
      const hash2 = await calcularHashSHA256('dados 2');
      expect(hash1).not.toBe(hash2);
    });

    it('deve retornar hash em lowercase', async () => {
      const result = await calcularHashSHA256('TEST');
      expect(result).toBe(result.toLowerCase());
    });

    it('deve lançar InvalidInputError para null', async () => {
      await expect(calcularHashSHA256(null as unknown as string)).rejects.toThrow(InvalidInputError);
    });

    it('deve lançar InvalidInputError para undefined', async () => {
      await expect(calcularHashSHA256(undefined as unknown as string)).rejects.toThrow(InvalidInputError);
    });

    it('deve calcular hash de string vazia', async () => {
      const result = await calcularHashSHA256('');
      expect(result).toBeDefined();
      expect(result.length).toBe(64);
      // Hash SHA-256 de string vazia é conhecido
      expect(result).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('deve calcular hash de ArrayBuffer vazio', async () => {
      const buffer = new ArrayBuffer(0);
      const result = await calcularHashSHA256(buffer);
      expect(result).toBeDefined();
      expect(result.length).toBe(64);
    });
  });

  describe('calcularMerkleRoot', () => {
    // Hashes de exemplo válidos (64 caracteres hex)
    const hash1 = 'a'.repeat(64);
    const hash2 = 'b'.repeat(64);
    const hash3 = 'c'.repeat(64);

    it('deve calcular Merkle Root de lista de hashes', async () => {
      const result = await calcularMerkleRoot([hash1, hash2, hash3]);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result.length).toBe(64);
      expect(result).toMatch(/^[0-9a-f]+$/);
    });

    it('deve retornar mesmo Merkle Root para mesmos hashes', async () => {
      const root1 = await calcularMerkleRoot([hash1, hash2, hash3]);
      const root2 = await calcularMerkleRoot([hash1, hash2, hash3]);
      expect(root1).toBe(root2);
    });

    it('deve retornar mesmo Merkle Root independente da ordem (sorted)', async () => {
      // Merkle Root é calculado com hashes ordenados
      const root1 = await calcularMerkleRoot([hash1, hash2, hash3]);
      const root2 = await calcularMerkleRoot([hash3, hash1, hash2]);
      const root3 = await calcularMerkleRoot([hash2, hash3, hash1]);
      expect(root1).toBe(root2);
      expect(root2).toBe(root3);
    });

    it('deve calcular Merkle Root de um único hash', async () => {
      const result = await calcularMerkleRoot([hash1]);
      expect(result).toBeDefined();
      expect(result.length).toBe(64);
    });

    it('deve normalizar hashes para lowercase', async () => {
      const upperHash = 'A'.repeat(64);
      const lowerHash = 'a'.repeat(64);
      const root1 = await calcularMerkleRoot([upperHash]);
      const root2 = await calcularMerkleRoot([lowerHash]);
      expect(root1).toBe(root2);
    });

    it('deve lançar InvalidInputError para lista vazia', async () => {
      await expect(calcularMerkleRoot([])).rejects.toThrow(InvalidInputError);
    });

    it('deve lançar InvalidInputError para null', async () => {
      await expect(calcularMerkleRoot(null as unknown as string[])).rejects.toThrow(InvalidInputError);
    });

    it('deve lançar InvalidInputError para hash inválido (tamanho errado)', async () => {
      const invalidHash = 'abc123'; // Muito curto
      await expect(calcularMerkleRoot([invalidHash])).rejects.toThrow(InvalidInputError);
    });

    it('deve lançar InvalidInputError para hash com caracteres inválidos', async () => {
      const invalidHash = 'g'.repeat(64); // 'g' não é hex
      await expect(calcularMerkleRoot([invalidHash])).rejects.toThrow(InvalidInputError);
    });

    it('deve lançar InvalidInputError para hash null na lista', async () => {
      await expect(calcularMerkleRoot([hash1, null as unknown as string])).rejects.toThrow(InvalidInputError);
    });
  });

  describe('gerarUUIDv4', () => {
    it('deve gerar UUID v4 válido', () => {
      const uuid = gerarUUIDv4();
      expect(uuid).toBeDefined();
      expect(typeof uuid).toBe('string');
      expect(isValidUUIDv4(uuid)).toBe(true);
    });

    it('deve gerar UUID no formato correto', () => {
      const uuid = gerarUUIDv4();
      // Formato: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(regex);
    });

    it('deve ter versão 4 no 13º caractere', () => {
      const uuid = gerarUUIDv4();
      // Posição 14 (índice 14 após remover hífens) deve ser '4'
      expect(uuid[14]).toBe('4');
    });

    it('deve ter variante RFC 4122 no 17º caractere (8, 9, a ou b)', () => {
      const uuid = gerarUUIDv4();
      // Posição 19 (após os hífens) deve ser 8, 9, a ou b
      const variantChar = uuid[19]?.toLowerCase();
      expect(['8', '9', 'a', 'b']).toContain(variantChar);
    });

    it('deve gerar UUIDs únicos', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(gerarUUIDv4());
      }
      expect(uuids.size).toBe(100);
    });

    it('deve ter 36 caracteres (incluindo hífens)', () => {
      const uuid = gerarUUIDv4();
      expect(uuid.length).toBe(36);
    });

    it('deve ter 4 hífens nas posições corretas', () => {
      const uuid = gerarUUIDv4();
      expect(uuid[8]).toBe('-');
      expect(uuid[13]).toBe('-');
      expect(uuid[18]).toBe('-');
      expect(uuid[23]).toBe('-');
    });
  });

  describe('isValidUUIDv4', () => {
    it('deve retornar true para UUID v4 válido', () => {
      const uuid = gerarUUIDv4();
      expect(isValidUUIDv4(uuid)).toBe(true);
    });

    it('deve retornar true para UUID v4 em uppercase', () => {
      const uuid = gerarUUIDv4().toUpperCase();
      expect(isValidUUIDv4(uuid)).toBe(true);
    });

    it('deve retornar false para string vazia', () => {
      expect(isValidUUIDv4('')).toBe(false);
    });

    it('deve retornar false para null', () => {
      expect(isValidUUIDv4(null as unknown as string)).toBe(false);
    });

    it('deve retornar false para undefined', () => {
      expect(isValidUUIDv4(undefined as unknown as string)).toBe(false);
    });

    it('deve retornar false para UUID v1 (versão errada)', () => {
      // UUID v1 tem '1' na posição da versão
      const uuidV1 = 'f47ac10b-58cc-1372-a567-0e02b2c3d479';
      expect(isValidUUIDv4(uuidV1)).toBe(false);
    });

    it('deve retornar false para UUID com variante errada', () => {
      // Variante deve ser 8, 9, a ou b - aqui é 0
      const invalidVariant = 'f47ac10b-58cc-4372-0567-0e02b2c3d479';
      expect(isValidUUIDv4(invalidVariant)).toBe(false);
    });

    it('deve retornar false para string aleatória', () => {
      expect(isValidUUIDv4('not-a-uuid')).toBe(false);
    });

    it('deve retornar false para UUID sem hífens', () => {
      expect(isValidUUIDv4('f47ac10b58cc4372a5670e02b2c3d479')).toBe(false);
    });
  });

  describe('isValidSHA256', () => {
    it('deve retornar true para hash SHA-256 válido', async () => {
      const hash = await calcularHashSHA256('test');
      expect(isValidSHA256(hash)).toBe(true);
    });

    it('deve retornar true para hash em lowercase', () => {
      const hash = 'a'.repeat(64);
      expect(isValidSHA256(hash)).toBe(true);
    });

    it('deve retornar true para hash em uppercase', () => {
      const hash = 'A'.repeat(64);
      expect(isValidSHA256(hash)).toBe(true);
    });

    it('deve retornar true para hash misto', () => {
      const hash = 'aAbBcCdDeEfF0123456789'.repeat(3).substring(0, 64);
      expect(isValidSHA256(hash)).toBe(true);
    });

    it('deve retornar false para string vazia', () => {
      expect(isValidSHA256('')).toBe(false);
    });

    it('deve retornar false para null', () => {
      expect(isValidSHA256(null as unknown as string)).toBe(false);
    });

    it('deve retornar false para undefined', () => {
      expect(isValidSHA256(undefined as unknown as string)).toBe(false);
    });

    it('deve retornar false para hash muito curto', () => {
      expect(isValidSHA256('abc123')).toBe(false);
    });

    it('deve retornar false para hash muito longo', () => {
      expect(isValidSHA256('a'.repeat(65))).toBe(false);
    });

    it('deve retornar false para caracteres não-hex', () => {
      expect(isValidSHA256('g'.repeat(64))).toBe(false);
    });
  });

  describe('Integração - Merkle Root verificável', () => {
    /**
     * Property 8: Merkle Root Verificável
     * Validates: Requirements 2.7, 3.6, 3.7
     *
     * Para qualquer CaptureResult, recalcular o Merkle Root a partir dos hashes
     * individuais (media.hash, html.hash, metadataHash) SHALL produzir o mesmo
     * valor que merkleRoot.
     */
    it('deve produzir Merkle Root verificável e determinístico', async () => {
      // Simular hashes de uma captura
      const mediaHash = await calcularHashSHA256('conteúdo da mídia');
      const htmlHash = await calcularHashSHA256('<html>...</html>');
      const metadataHash = await calcularHashSHA256('{"url":"https://example.com"}');

      // Calcular Merkle Root
      const merkleRoot = await calcularMerkleRoot([mediaHash, htmlHash, metadataHash]);

      // Recalcular deve produzir mesmo resultado
      const merkleRootRecalculado = await calcularMerkleRoot([mediaHash, htmlHash, metadataHash]);

      expect(merkleRoot).toBe(merkleRootRecalculado);
      expect(isValidSHA256(merkleRoot)).toBe(true);
    });

    it('deve produzir Merkle Root diferente para hashes diferentes', async () => {
      const hash1 = await calcularHashSHA256('dados 1');
      const hash2 = await calcularHashSHA256('dados 2');
      const hash3 = await calcularHashSHA256('dados 3');

      const root1 = await calcularMerkleRoot([hash1, hash2, hash3]);

      // Alterar um hash deve mudar o Merkle Root
      const hash1Modified = await calcularHashSHA256('dados 1 modificado');
      const root2 = await calcularMerkleRoot([hash1Modified, hash2, hash3]);

      expect(root1).not.toBe(root2);
    });
  });

  describe('Integração - UUID para evidenceId', () => {
    /**
     * Property 6: UUID v4 Válido
     * Validates: Requirements 1.8
     *
     * Para qualquer evidência criada pelo pipeline, o evidenceId SHALL ser
     * um UUID v4 válido.
     */
    it('deve gerar evidenceId válido para uso no pipeline', () => {
      const evidenceId = gerarUUIDv4();

      // Deve ser UUID v4 válido
      expect(isValidUUIDv4(evidenceId)).toBe(true);

      // Deve ter formato correto para uso em URLs e chaves S3
      expect(evidenceId).toMatch(/^[0-9a-f-]+$/i);
      expect(evidenceId.length).toBe(36);
    });
  });

  describe('calcularHashSHA256BlobIncremental', () => {
    /**
     * TESTE CRÍTICO FORENSE:
     * Valida que o hash incremental produz o MESMO resultado que o hash
     * tradicional. Isso é essencial para integridade de provas digitais.
     *
     * Ver: NIST SP 800-106, ISO 27037
     */
    it('deve produzir o MESMO hash que calcularHashSHA256Blob para o mesmo conteúdo', async () => {
      const conteudo = 'Dados de teste para validação de hash forense';
      const blob = new Blob([conteudo], { type: 'text/plain' });

      const hashTradicional = await calcularHashSHA256Blob(blob);
      const hashIncremental = await calcularHashSHA256BlobIncremental(blob);

      expect(hashIncremental).toBe(hashTradicional);
    });

    it('deve produzir hash válido de 64 caracteres hex', async () => {
      const blob = new Blob(['test data'], { type: 'text/plain' });
      const hash = await calcularHashSHA256BlobIncremental(blob);

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('deve produzir mesmo hash independente do tamanho do chunk', async () => {
      const conteudo = 'A'.repeat(10000); // 10KB de dados
      const blob = new Blob([conteudo], { type: 'text/plain' });

      // Testar com diferentes tamanhos de chunk
      const hash1KB = await calcularHashSHA256BlobIncremental(blob, undefined, 1024);
      const hash2KB = await calcularHashSHA256BlobIncremental(blob, undefined, 2048);
      const hash5KB = await calcularHashSHA256BlobIncremental(blob, undefined, 5120);
      const hashDefault = await calcularHashSHA256BlobIncremental(blob);

      expect(hash1KB).toBe(hash2KB);
      expect(hash2KB).toBe(hash5KB);
      expect(hash5KB).toBe(hashDefault);
    });

    it('deve chamar callback de progresso corretamente', async () => {
      const conteudo = 'B'.repeat(5000);
      const blob = new Blob([conteudo], { type: 'text/plain' });

      const progressCalls: number[] = [];
      await calcularHashSHA256BlobIncremental(
        blob,
        (percent) => progressCalls.push(percent),
        1000 // 1KB chunks para ter múltiplas chamadas
      );

      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[progressCalls.length - 1]).toBe(100);

      // Progresso deve ser monotonicamente crescente
      for (let i = 1; i < progressCalls.length; i++) {
        expect(progressCalls[i]).toBeGreaterThanOrEqual(progressCalls[i - 1] as number);
      }
    });

    it('deve lançar InvalidInputError para blob vazio', async () => {
      const blobVazio = new Blob([], { type: 'text/plain' });
      await expect(calcularHashSHA256BlobIncremental(blobVazio)).rejects.toThrow(InvalidInputError);
    });

    it('deve lançar InvalidInputError para blob null', async () => {
      await expect(calcularHashSHA256BlobIncremental(null as unknown as Blob)).rejects.toThrow();
    });

    it('deve processar blobs de diferentes tipos MIME', async () => {
      const conteudo = 'mesmo conteúdo';
      const blobText = new Blob([conteudo], { type: 'text/plain' });
      const blobVideo = new Blob([conteudo], { type: 'video/webm' });
      const blobBinary = new Blob([conteudo], { type: 'application/octet-stream' });

      const hashText = await calcularHashSHA256BlobIncremental(blobText);
      const hashVideo = await calcularHashSHA256BlobIncremental(blobVideo);
      const hashBinary = await calcularHashSHA256BlobIncremental(blobBinary);

      // O hash deve ser o mesmo pois o conteúdo é idêntico
      // MIME type não afeta o hash
      expect(hashText).toBe(hashVideo);
      expect(hashVideo).toBe(hashBinary);
    });

    it('deve produzir hash diferente para conteúdos diferentes', async () => {
      const blob1 = new Blob(['conteúdo 1'], { type: 'text/plain' });
      const blob2 = new Blob(['conteúdo 2'], { type: 'text/plain' });

      const hash1 = await calcularHashSHA256BlobIncremental(blob1);
      const hash2 = await calcularHashSHA256BlobIncremental(blob2);

      expect(hash1).not.toBe(hash2);
    });

    it('deve ser idempotente (mesmo resultado em múltiplas chamadas)', async () => {
      const blob = new Blob(['dados para teste de idempotência'], { type: 'text/plain' });

      const hash1 = await calcularHashSHA256BlobIncremental(blob);
      const hash2 = await calcularHashSHA256BlobIncremental(blob);
      const hash3 = await calcularHashSHA256BlobIncremental(blob);

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });
  });

  describe('calcularHashSHA256Base64Incremental', () => {
    it('deve retornar hash em base64 válido', async () => {
      const blob = new Blob(['test data'], { type: 'text/plain' });
      const hashBase64 = await calcularHashSHA256Base64Incremental(blob);

      expect(hashBase64).toBeDefined();
      // Base64 válido: A-Z, a-z, 0-9, +, /, =
      expect(hashBase64).toMatch(/^[A-Za-z0-9+/=]+$/);
      // SHA-256 em base64 tem ~44 caracteres
      expect(hashBase64.length).toBe(44);
    });

    it('deve produzir base64 decodificável para hex equivalente', async () => {
      const blob = new Blob(['test data'], { type: 'text/plain' });

      const hashHex = await calcularHashSHA256BlobIncremental(blob);
      const hashBase64 = await calcularHashSHA256Base64Incremental(blob);

      // Decodificar base64 para bytes e converter para hex
      const binaryString = atob(hashBase64);
      const decodedHex = Array.from(binaryString)
        .map(char => char.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('');

      expect(decodedHex).toBe(hashHex);
    });

    it('deve chamar callback de progresso', async () => {
      const blob = new Blob(['C'.repeat(3000)], { type: 'text/plain' });

      const progressCalls: number[] = [];
      await calcularHashSHA256Base64Incremental(
        blob,
        (percent) => progressCalls.push(percent)
      );

      expect(progressCalls.length).toBeGreaterThan(0);
    });
  });

  describe('Integridade Forense - Hash de Blob Combinado', () => {
    /**
     * TESTE CRÍTICO:
     * Simula exatamente o cenário do multipart-upload.ts
     * Valida que concatenar hashes é DIFERENTE de hash do blob combinado
     */
    it('deve demonstrar que concatenar hashes NÃO é igual ao hash do blob combinado', async () => {
      // Simular chunks como no multipart-upload
      const chunk1 = new Blob(['chunk1-data'], { type: 'video/webm' });
      const chunk2 = new Blob(['chunk2-data'], { type: 'video/webm' });
      const chunk3 = new Blob(['chunk3-data'], { type: 'video/webm' });

      // Calcular hash de cada chunk individualmente
      const hash1 = await calcularHashSHA256Blob(chunk1);
      const hash2 = await calcularHashSHA256Blob(chunk2);
      const hash3 = await calcularHashSHA256Blob(chunk3);

      // ERRADO: Concatenar hashes com ":" (como era antes)
      const hashConcatenadoErrado = [hash1, hash2, hash3].join(':');

      // Combinar blobs
      const combinedBlob = new Blob([chunk1, chunk2, chunk3], { type: 'video/webm' });

      // CORRETO: Hash do blob combinado
      const hashCorreto = await calcularHashSHA256BlobIncremental(combinedBlob);

      // Verificar que são DIFERENTES
      expect(hashConcatenadoErrado).not.toBe(hashCorreto);

      // O hash correto deve ter 64 caracteres (SHA-256 hex)
      expect(hashCorreto.length).toBe(64);

      // O hash concatenado errado é muito maior (3 hashes + 2 separadores)
      expect(hashConcatenadoErrado.length).toBe(64 * 3 + 2);
    });

    it('deve produzir hash correto para blob combinado igual ao ArrayBuffer equivalente', async () => {
      // Criar chunks
      const chunk1Data = new TextEncoder().encode('primeiro-chunk');
      const chunk2Data = new TextEncoder().encode('segundo-chunk');

      const chunk1 = new Blob([chunk1Data], { type: 'video/webm' });
      const chunk2 = new Blob([chunk2Data], { type: 'video/webm' });

      // Combinar usando Blob (como no código real)
      const combinedBlob = new Blob([chunk1, chunk2], { type: 'video/webm' });
      const hashBlob = await calcularHashSHA256BlobIncremental(combinedBlob);

      // Combinar manualmente os bytes
      const combinedArray = new Uint8Array([...chunk1Data, ...chunk2Data]);
      const hashArray = await calcularHashSHA256(combinedArray.buffer);

      // Devem ser iguais
      expect(hashBlob).toBe(hashArray);
    });
  });
});
