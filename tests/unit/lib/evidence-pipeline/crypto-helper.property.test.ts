/**
 * Testes de Propriedade (Property-Based Tests) para crypto-helper
 *
 * Usa fast-check para verificar propriedades universais das funções
 * criptográficas do Pipeline de Evidências.
 *
 * **Property 8: Merkle Root Verificável**
 * **Validates: Requirements 2.7, 3.6, 3.7**
 *
 * @module CryptoHelperPropertyTests
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  calcularHashSHA256,
  calcularMerkleRoot,
  gerarUUIDv4,
  isValidUUIDv4,
  isValidSHA256,
} from '@lib/evidence-pipeline/crypto-helper';

/**
 * Configuração mínima: 100 iterações por propriedade
 * Conforme especificado no design.md
 */
const FC_CONFIG = { numRuns: 100 };

/**
 * Generator de caractere hexadecimal (0-9, a-f)
 * Usado como unit para gerar strings hexadecimais
 */
const hexaCharArb = fc.constantFrom(...'0123456789abcdef'.split(''));

/**
 * Generator de hash SHA-256 válido (64 caracteres hex lowercase)
 * Usa fc.string com unit customizado (fast-check v4)
 */
const sha256HashArb = fc.string({ unit: hexaCharArb, minLength: 64, maxLength: 64 });

/**
 * Generator de string não vazia para hash
 */
const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 10000 });

/**
 * Generator de ArrayBuffer com dados aleatórios
 * Nota: Mantido para referência em testes de hash de ArrayBuffer
 */
const _arrayBufferArb = fc.uint8Array({ minLength: 0, maxLength: 10000 }).map((arr) => arr.buffer);
void _arrayBufferArb; // Evita erro de variável não utilizada

/**
 * Generator de lista de hashes SHA-256 (1 a 10 hashes)
 */
const hashListArb = fc.array(sha256HashArb, { minLength: 1, maxLength: 10 });

describe('CryptoHelper - Property-Based Tests', () => {
  describe('Property 8: Merkle Root Verificável', () => {
    /**
     * **Validates: Requirements 2.7, 3.6, 3.7**
     *
     * Para qualquer CaptureResult, recalcular o Merkle Root a partir dos hashes
     * individuais (media.hash, html.hash, metadataHash) SHALL produzir o mesmo
     * valor que merkleRoot.
     */
    it('Merkle Root é determinístico - mesmos hashes produzem mesmo root', async () => {
      await fc.assert(
        fc.asyncProperty(sha256HashArb, sha256HashArb, sha256HashArb, async (mediaHash, htmlHash, metadataHash) => {
          // Calcula Merkle Root duas vezes com mesmos inputs
          const merkleRoot1 = await calcularMerkleRoot([mediaHash, htmlHash, metadataHash]);
          const merkleRoot2 = await calcularMerkleRoot([mediaHash, htmlHash, metadataHash]);

          // Deve ser idêntico (determinístico)
          expect(merkleRoot1).toBe(merkleRoot2);

          // Deve ser hash SHA-256 válido
          expect(isValidSHA256(merkleRoot1)).toBe(true);
        }),
        FC_CONFIG
      );
    });

    /**
     * **Validates: Requirements 2.7, 3.6, 3.7**
     *
     * Merkle Root deve ser independente da ordem dos hashes de entrada
     * (implementação usa ordenação alfabética interna)
     */
    it('Merkle Root é independente da ordem dos hashes (sorted internamente)', async () => {
      await fc.assert(
        fc.asyncProperty(sha256HashArb, sha256HashArb, sha256HashArb, async (hash1, hash2, hash3) => {
          // Calcula com diferentes ordens de entrada
          const root1 = await calcularMerkleRoot([hash1, hash2, hash3]);
          const root2 = await calcularMerkleRoot([hash3, hash1, hash2]);
          const root3 = await calcularMerkleRoot([hash2, hash3, hash1]);
          const root4 = await calcularMerkleRoot([hash1, hash3, hash2]);

          // Todas as ordens devem produzir mesmo resultado
          expect(root1).toBe(root2);
          expect(root2).toBe(root3);
          expect(root3).toBe(root4);
        }),
        FC_CONFIG
      );
    });

    /**
     * **Validates: Requirements 2.7, 3.6, 3.7**
     *
     * Merkle Root deve mudar se qualquer hash individual mudar
     * (sensibilidade a alterações)
     */
    it('Merkle Root muda quando qualquer hash individual muda', async () => {
      await fc.assert(
        fc.asyncProperty(
          sha256HashArb,
          sha256HashArb,
          sha256HashArb,
          sha256HashArb,
          async (hash1, hash2, hash3, hashDiferente) => {
            // Pula se hashDiferente for igual a hash1 (improvável mas possível)
            fc.pre(hash1 !== hashDiferente);

            const rootOriginal = await calcularMerkleRoot([hash1, hash2, hash3]);
            const rootModificado = await calcularMerkleRoot([hashDiferente, hash2, hash3]);

            // Roots devem ser diferentes
            expect(rootOriginal).not.toBe(rootModificado);
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * **Validates: Requirements 2.7, 3.6, 3.7**
     *
     * Merkle Root de lista com qualquer quantidade de hashes válidos
     * deve sempre produzir hash SHA-256 válido
     */
    it('Merkle Root de qualquer lista de hashes válidos produz SHA-256 válido', async () => {
      await fc.assert(
        fc.asyncProperty(hashListArb, async (hashes) => {
          const merkleRoot = await calcularMerkleRoot(hashes);

          // Deve ser hash SHA-256 válido (64 caracteres hex)
          expect(merkleRoot).toHaveLength(64);
          expect(merkleRoot).toMatch(/^[0-9a-f]{64}$/);
          expect(isValidSHA256(merkleRoot)).toBe(true);
        }),
        FC_CONFIG
      );
    });
  });

  describe('Hash Determinism - Propriedade Auxiliar', () => {
    /**
     * Propriedade auxiliar: Hash SHA-256 é determinístico
     * Mesma entrada sempre produz mesmo hash
     */
    it('calcularHashSHA256 é determinístico para strings', async () => {
      await fc.assert(
        fc.asyncProperty(nonEmptyStringArb, async (input) => {
          const hash1 = await calcularHashSHA256(input);
          const hash2 = await calcularHashSHA256(input);

          // Mesmo input deve produzir mesmo hash
          expect(hash1).toBe(hash2);

          // Deve ser hash SHA-256 válido
          expect(isValidSHA256(hash1)).toBe(true);
        }),
        FC_CONFIG
      );
    });

    /**
     * Propriedade auxiliar: Hash SHA-256 é determinístico para ArrayBuffer
     */
    it('calcularHashSHA256 é determinístico para ArrayBuffer', async () => {
      await fc.assert(
        fc.asyncProperty(fc.uint8Array({ minLength: 1, maxLength: 1000 }), async (data) => {
          // Cria dois ArrayBuffers com mesmo conteúdo
          const buffer1 = data.buffer.slice(0);
          const buffer2 = new Uint8Array(data).buffer;

          const hash1 = await calcularHashSHA256(buffer1);
          const hash2 = await calcularHashSHA256(buffer2);

          // Mesmo conteúdo deve produzir mesmo hash
          expect(hash1).toBe(hash2);

          // Deve ser hash SHA-256 válido
          expect(isValidSHA256(hash1)).toBe(true);
        }),
        FC_CONFIG
      );
    });

    /**
     * Propriedade auxiliar: Hashes diferentes para inputs diferentes
     * (com alta probabilidade - colisões são extremamente raras)
     */
    it('calcularHashSHA256 produz hashes diferentes para inputs diferentes', async () => {
      await fc.assert(
        fc.asyncProperty(nonEmptyStringArb, nonEmptyStringArb, async (input1, input2) => {
          // Pula se inputs forem iguais
          fc.pre(input1 !== input2);

          const hash1 = await calcularHashSHA256(input1);
          const hash2 = await calcularHashSHA256(input2);

          // Inputs diferentes devem produzir hashes diferentes
          expect(hash1).not.toBe(hash2);
        }),
        FC_CONFIG
      );
    });

    /**
     * Propriedade auxiliar: Hash sempre retorna lowercase
     */
    it('calcularHashSHA256 sempre retorna hash em lowercase', async () => {
      await fc.assert(
        fc.asyncProperty(nonEmptyStringArb, async (input) => {
          const hash = await calcularHashSHA256(input);

          // Hash deve ser lowercase
          expect(hash).toBe(hash.toLowerCase());
        }),
        FC_CONFIG
      );
    });
  });

  describe('UUID v4 Uniqueness - Propriedade Auxiliar', () => {
    /**
     * Propriedade auxiliar: UUIDs gerados são únicos
     * (com probabilidade extremamente alta)
     */
    it('gerarUUIDv4 produz UUIDs únicos em sequência', () => {
      fc.assert(
        fc.property(fc.integer({ min: 10, max: 100 }), (count) => {
          const uuids = new Set<string>();

          for (let i = 0; i < count; i++) {
            uuids.add(gerarUUIDv4());
          }

          // Todos os UUIDs devem ser únicos
          expect(uuids.size).toBe(count);
        }),
        FC_CONFIG
      );
    });

    /**
     * Propriedade auxiliar: Todos os UUIDs gerados são válidos v4
     */
    it('gerarUUIDv4 sempre produz UUID v4 válido', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const uuid = gerarUUIDv4();

          // Deve ser UUID v4 válido
          expect(isValidUUIDv4(uuid)).toBe(true);

          // Formato correto: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
          expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

          // Tamanho correto
          expect(uuid).toHaveLength(36);

          // Versão 4 no caractere 14
          expect(uuid[14]).toBe('4');

          // Variante RFC 4122 no caractere 19 (8, 9, a ou b)
          expect(['8', '9', 'a', 'b']).toContain(uuid[19]?.toLowerCase());
        }),
        FC_CONFIG
      );
    });
  });

  describe('UUID v4 Format Validation - Propriedade Auxiliar', () => {
    /**
     * Propriedade auxiliar: isValidUUIDv4 aceita UUIDs gerados
     */
    it('isValidUUIDv4 aceita todos os UUIDs gerados por gerarUUIDv4', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const uuid = gerarUUIDv4();
          expect(isValidUUIDv4(uuid)).toBe(true);
        }),
        FC_CONFIG
      );
    });

    /**
     * Propriedade auxiliar: isValidUUIDv4 rejeita strings aleatórias
     */
    it('isValidUUIDv4 rejeita strings que não são UUID v4', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 100 }).filter((s) => {
            // Filtra strings que acidentalmente são UUIDs v4 válidos
            return !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
          }),
          (invalidString) => {
            expect(isValidUUIDv4(invalidString)).toBe(false);
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Propriedade auxiliar: isValidUUIDv4 aceita UUIDs em uppercase e lowercase
     */
    it('isValidUUIDv4 é case-insensitive', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const uuid = gerarUUIDv4();

          // Deve aceitar lowercase
          expect(isValidUUIDv4(uuid.toLowerCase())).toBe(true);

          // Deve aceitar uppercase
          expect(isValidUUIDv4(uuid.toUpperCase())).toBe(true);

          // Deve aceitar mixed case
          const mixedCase = uuid
            .split('')
            .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
            .join('');
          expect(isValidUUIDv4(mixedCase)).toBe(true);
        }),
        FC_CONFIG
      );
    });
  });

  describe('SHA-256 Validation - Propriedade Auxiliar', () => {
    /**
     * Propriedade auxiliar: isValidSHA256 aceita hashes gerados
     */
    it('isValidSHA256 aceita todos os hashes gerados por calcularHashSHA256', async () => {
      await fc.assert(
        fc.asyncProperty(nonEmptyStringArb, async (input) => {
          const hash = await calcularHashSHA256(input);
          expect(isValidSHA256(hash)).toBe(true);
        }),
        FC_CONFIG
      );
    });

    /**
     * Propriedade auxiliar: isValidSHA256 aceita hashes em uppercase e lowercase
     */
    it('isValidSHA256 é case-insensitive', () => {
      fc.assert(
        fc.property(sha256HashArb, (hash) => {
          // Deve aceitar lowercase
          expect(isValidSHA256(hash.toLowerCase())).toBe(true);

          // Deve aceitar uppercase
          expect(isValidSHA256(hash.toUpperCase())).toBe(true);
        }),
        FC_CONFIG
      );
    });

    /**
     * Propriedade auxiliar: isValidSHA256 rejeita strings com tamanho errado
     */
    it('isValidSHA256 rejeita strings com tamanho diferente de 64', () => {
      fc.assert(
        fc.property(
          fc.string({ unit: hexaCharArb }).filter((s) => s.length !== 64),
          (invalidHash) => {
            expect(isValidSHA256(invalidHash)).toBe(false);
          }
        ),
        FC_CONFIG
      );
    });

    /**
     * Propriedade auxiliar: isValidSHA256 rejeita strings com caracteres não-hex
     */
    it('isValidSHA256 rejeita strings com caracteres não-hexadecimais', () => {
      fc.assert(
        fc.property(
          fc
            .string({ minLength: 64, maxLength: 64 })
            .filter((s) => !/^[0-9a-fA-F]+$/.test(s) && s.length === 64),
          (invalidHash) => {
            expect(isValidSHA256(invalidHash)).toBe(false);
          }
        ),
        { numRuns: 50 } // Menos iterações pois é difícil gerar strings de 64 chars não-hex
      );
    });
  });

  describe('Merkle Root - Normalização de Case', () => {
    /**
     * Propriedade: Merkle Root normaliza hashes para lowercase
     */
    it('calcularMerkleRoot normaliza hashes uppercase para lowercase', async () => {
      await fc.assert(
        fc.asyncProperty(sha256HashArb, sha256HashArb, sha256HashArb, async (hash1, hash2, hash3) => {
          // Calcula com hashes lowercase
          const rootLower = await calcularMerkleRoot([hash1.toLowerCase(), hash2.toLowerCase(), hash3.toLowerCase()]);

          // Calcula com hashes uppercase
          const rootUpper = await calcularMerkleRoot([hash1.toUpperCase(), hash2.toUpperCase(), hash3.toUpperCase()]);

          // Calcula com hashes mixed case
          const rootMixed = await calcularMerkleRoot([hash1.toLowerCase(), hash2.toUpperCase(), hash3.toLowerCase()]);

          // Todos devem produzir mesmo resultado
          expect(rootLower).toBe(rootUpper);
          expect(rootUpper).toBe(rootMixed);
        }),
        FC_CONFIG
      );
    });
  });
});
