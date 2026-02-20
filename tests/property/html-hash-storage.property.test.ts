/**
 * Property tests para HTML Hash Storage
 *
 * Valida a propriedade de armazenamento de hash SHA-256 do HTML:
 * - Property 11: HTML Hash Storage
 *
 * Para qualquer entrada de navegação no Navigation Index, a entrada
 * DEVE conter um hash SHA-256 válido do conteúdo HTML capturado.
 *
 * Um hash SHA-256 válido é uma string de 64 caracteres hexadecimais (0-9, a-f).
 *
 * @module html-hash-storage.property.test
 * @requirements 3.6

 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  RecordingStateManager,
  resetRecordingStateManager,
  type NavigationEntryInput,
} from '../../src/background/recording-state-manager';
import type { NavigationType, NavigationEntry } from '../../src/sidepanel/types';

// ============================================================================
// Constantes
// ============================================================================

/**
 * Regex para validar hash SHA-256
 * SHA-256 produz 256 bits = 32 bytes = 64 caracteres hexadecimais
 */
const SHA256_REGEX = /^[a-f0-9]{64}$/;

/**
 * Comprimento esperado de um hash SHA-256 em caracteres hexadecimais
 */
const SHA256_HEX_LENGTH = 64;

/**
 * Tipos de navegação válidos conforme especificação
 */
const VALID_NAVIGATION_TYPES: readonly NavigationType[] = [
  'initial',
  'link-click',
  'form-submit',
  'history-back',
  'history-forward',
  'redirect',
] as const;

// ============================================================================
// Arbitrários (Generators) para fast-check
// ============================================================================

/**
 * Gera hashes SHA-256 válidos (64 caracteres hexadecimais lowercase)
 * Requisito 3.6: Hash SHA-256 do HTML capturado
 */
const validSha256HashArbitrary: fc.Arbitrary<string> = fc
  .array(fc.integer({ min: 0, max: 15 }), { minLength: 64, maxLength: 64 })
  .map((digits) => digits.map((d) => d.toString(16)).join(''));

/**
 * Gera hashes SHA-256 a partir de conteúdo simulado
 * Simula o processo real de hash de conteúdo HTML
 */
const sha256FromContentArbitrary: fc.Arbitrary<string> = fc
  .uint8Array({ minLength: 32, maxLength: 32 })
  .map((bytes) => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(''));

/**
 * Gera URLs válidas para testes
 */
const urlArbitrary: fc.Arbitrary<string> = fc.oneof(
  // URLs HTTPS simples
  fc.tuple(
    fc.stringMatching(/^[a-z0-9-]{3,20}$/),
    fc.stringMatching(/^[a-z]{2,10}$/)
  ).map(([domain, tld]) => `https://${domain || 'example'}.${tld || 'com'}`),
  // URLs com path
  fc.tuple(
    fc.stringMatching(/^[a-z0-9-]{3,20}$/),
    fc.stringMatching(/^[a-z]{2,10}$/),
    fc.stringMatching(/^[a-z0-9-/]{1,30}$/)
  ).map(([domain, tld, path]) => `https://${domain || 'example'}.${tld || 'com'}/${path || 'page'}`),
  // URLs com query string
  fc.tuple(
    fc.stringMatching(/^[a-z0-9-]{3,20}$/),
    fc.stringMatching(/^[a-z]{2,10}$/),
    fc.stringMatching(/^[a-z0-9]{1,10}$/),
    fc.stringMatching(/^[a-z0-9]{1,20}$/)
  ).map(([domain, tld, key, value]) =>
    `https://${domain || 'example'}.${tld || 'com'}?${key || 'q'}=${value || 'test'}`
  )
);

/**
 * Gera tipos de navegação válidos
 */
const navigationTypeArbitrary: fc.Arbitrary<NavigationType> = fc.constantFrom(
  'initial',
  'link-click',
  'form-submit',
  'history-back',
  'history-forward',
  'redirect'
);

/**
 * Gera entrada de navegação completa com hash SHA-256 válido
 */
const navigationEntryInputArbitrary: fc.Arbitrary<NavigationEntryInput> = fc.record({
  url: urlArbitrary,
  type: navigationTypeArbitrary,
  htmlHash: validSha256HashArbitrary,
});

/**
 * Gera timestamps válidos (entre 2020 e 2030)
 */
const timestampArbitrary: fc.Arbitrary<number> = fc.integer({
  min: new Date('2020-01-01').getTime(),
  max: new Date('2030-12-31').getTime(),
});

// ============================================================================
// Funções Auxiliares
// ============================================================================

/**
 * Cria um RecordingStateManager para testes
 * Desabilita broadcast automático para evitar erros de chrome.runtime
 *
 * @returns Instância do RecordingStateManager configurada para testes
 */
function createTestManager(): RecordingStateManager {
  return new RecordingStateManager({
    autoBroadcast: false,
    maxDurationMs: 30 * 60 * 1000, // 30 minutos
  });
}

/**
 * Verifica se uma string é um hash SHA-256 válido
 *
 * @param hash - String a verificar
 * @returns true se é um hash SHA-256 válido
 */
function isValidSha256Hash(hash: string): boolean {
  return SHA256_REGEX.test(hash);
}

/**
 * Obtém a primeira entrada de navegação de forma segura
 *
 * @param entries - Array de entradas de navegação
 * @returns Primeira entrada ou lança erro se vazio
 */
function getFirstEntry(entries: NavigationEntry[]): NavigationEntry {
  const entry = entries[0];
  if (!entry) {
    throw new Error('Nenhuma entrada de navegação encontrada');
  }
  return entry;
}

/**
 * Obtém entrada de navegação por índice de forma segura
 *
 * @param entries - Array de entradas de navegação
 * @param index - Índice da entrada
 * @returns Entrada no índice ou lança erro se não existir
 */
function getEntryAt(entries: NavigationEntry[], index: number): NavigationEntry {
  const entry = entries[index];
  if (!entry) {
    throw new Error(`Entrada de navegação não encontrada no índice ${index}`);
  }
  return entry;
}

// ============================================================================
// Property Tests
// ============================================================================

describe('HTML Hash Storage Properties', () => {
  let manager: RecordingStateManager | null = null;

  beforeEach(() => {
    resetRecordingStateManager();
  });

  afterEach(() => {
    if (manager) {
      manager.reset();
      manager = null;
    }
    resetRecordingStateManager();
  });

  // ==========================================================================
  // Property 11: HTML Hash Storage
  // Feature: video-capture-redesign
  // **Validates: Requirements 3.6**
  // ==========================================================================

  describe('Property 11: HTML Hash Storage', () => {
    /**
     * **Validates: Requirements 3.6**
     *
     * Para qualquer entrada de navegação no Navigation Index,
     * a entrada DEVE conter um hash SHA-256 válido (64 caracteres hexadecimais).
     */
    it('deve armazenar hash SHA-256 válido para cada entrada de navegação', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          navigationTypeArbitrary,
          validSha256HashArbitrary,
          (url, type, htmlHash) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona navegação com hash SHA-256
            const input: NavigationEntryInput = { url, type, htmlHash };
            manager.addNavigation(input);

            // Obtém histórico
            const history = manager.getNavigationHistory();

            // Verifica que entrada foi adicionada
            expect(history.length).toBe(1);

            const entry = getFirstEntry(history);

            // Hash DEVE ser um SHA-256 válido (64 caracteres hexadecimais)
            expect(entry.htmlHash).toBeDefined();
            expect(typeof entry.htmlHash).toBe('string');
            expect(entry.htmlHash.length).toBe(SHA256_HEX_LENGTH);
            expect(isValidSha256Hash(entry.htmlHash)).toBe(true);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.6**
     *
     * O hash SHA-256 armazenado DEVE ser exatamente o hash fornecido,
     * sem modificações.
     */
    it('deve preservar o hash SHA-256 exatamente como fornecido', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          navigationTypeArbitrary,
          validSha256HashArbitrary,
          (url, type, htmlHash) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona navegação
            manager.addNavigation({ url, type, htmlHash });

            // Obtém histórico
            const history = manager.getNavigationHistory();
            const entry = getFirstEntry(history);

            // Hash deve ser exatamente o fornecido
            expect(entry.htmlHash).toBe(htmlHash);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.6**
     *
     * O hash SHA-256 DEVE ter exatamente 64 caracteres hexadecimais.
     */
    it('deve armazenar hash com exatamente 64 caracteres hexadecimais', () => {
      fc.assert(
        fc.property(
          navigationEntryInputArbitrary,
          (input) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona navegação
            manager.addNavigation(input);

            // Obtém histórico
            const history = manager.getNavigationHistory();
            const entry = getFirstEntry(history);

            // Hash deve ter exatamente 64 caracteres
            expect(entry.htmlHash.length).toBe(64);

            // Todos os caracteres devem ser hexadecimais (0-9, a-f)
            for (const char of entry.htmlHash) {
              expect('0123456789abcdef').toContain(char);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.6**
     *
     * Para múltiplas navegações, cada entrada DEVE ter seu próprio
     * hash SHA-256 válido armazenado.
     */
    it('deve armazenar hash SHA-256 válido para múltiplas navegações', () => {
      fc.assert(
        fc.property(
          fc.array(navigationEntryInputArbitrary, { minLength: 2, maxLength: 10 }),
          (inputs) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona todas as navegações
            for (const input of inputs) {
              manager.addNavigation(input);
            }

            // Obtém histórico
            const history = manager.getNavigationHistory();

            // Verifica que todas as entradas foram adicionadas
            expect(history.length).toBe(inputs.length);

            // Verifica cada entrada
            for (let i = 0; i < inputs.length; i++) {
              const input = inputs[i] as NavigationEntryInput;
              const entry = getEntryAt(history, i);

              // Hash deve ser válido
              expect(isValidSha256Hash(entry.htmlHash)).toBe(true);

              // Hash deve ser o fornecido
              expect(entry.htmlHash).toBe(input.htmlHash);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.6**
     *
     * O hash SHA-256 DEVE ser armazenado independentemente do tipo
     * de navegação (initial, link-click, form-submit, etc.).
     */
    it('deve armazenar hash SHA-256 para todos os tipos de navegação', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          validSha256HashArbitrary,
          (url, htmlHash) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona uma navegação de cada tipo
            for (const type of VALID_NAVIGATION_TYPES) {
              manager.addNavigation({ url, type, htmlHash });
            }

            // Obtém histórico
            const history = manager.getNavigationHistory();

            // Verifica que todas as entradas foram adicionadas
            expect(history.length).toBe(VALID_NAVIGATION_TYPES.length);

            // Verifica que cada entrada tem hash válido
            for (const entry of history) {
              expect(isValidSha256Hash(entry.htmlHash)).toBe(true);
              expect(entry.htmlHash).toBe(htmlHash);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.6**
     *
     * O hash SHA-256 DEVE ser armazenado independentemente da URL.
     */
    it('deve armazenar hash SHA-256 independentemente da URL', () => {
      fc.assert(
        fc.property(
          urlArbitrary,
          navigationTypeArbitrary,
          validSha256HashArbitrary,
          timestampArbitrary,
          (url, type, htmlHash, startTime) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording(startTime);

            // Adiciona navegação
            manager.addNavigation({ url, type, htmlHash });

            // Obtém histórico
            const history = manager.getNavigationHistory();
            const entry = getFirstEntry(history);

            // Hash deve ser válido e preservado
            expect(isValidSha256Hash(entry.htmlHash)).toBe(true);
            expect(entry.htmlHash).toBe(htmlHash);

            // URL também deve ser preservada
            expect(entry.fullUrl).toBe(url);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.6**
     *
     * Hashes SHA-256 diferentes DEVEM ser preservados corretamente
     * para navegações diferentes.
     */
    it('deve preservar hashes diferentes para navegações diferentes', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.tuple(urlArbitrary, navigationTypeArbitrary, validSha256HashArbitrary),
            { minLength: 3, maxLength: 8 }
          ),
          (navigations) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona todas as navegações
            for (const [url, type, htmlHash] of navigations) {
              manager.addNavigation({ url, type, htmlHash });
            }

            // Obtém histórico
            const history = manager.getNavigationHistory();

            // Verifica que todas as entradas foram adicionadas
            expect(history.length).toBe(navigations.length);

            // Verifica que cada hash foi preservado corretamente
            for (let i = 0; i < navigations.length; i++) {
              const [, , expectedHash] = navigations[i] as [string, NavigationType, string];
              const entry = getEntryAt(history, i);

              expect(entry.htmlHash).toBe(expectedHash);
              expect(isValidSha256Hash(entry.htmlHash)).toBe(true);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.6**
     *
     * O hash SHA-256 DEVE conter apenas caracteres hexadecimais
     * em lowercase (0-9, a-f).
     */
    it('deve armazenar hash SHA-256 em formato lowercase', () => {
      fc.assert(
        fc.property(
          navigationEntryInputArbitrary,
          (input) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona navegação
            manager.addNavigation(input);

            // Obtém histórico
            const history = manager.getNavigationHistory();
            const entry = getFirstEntry(history);

            // Hash deve estar em lowercase
            expect(entry.htmlHash).toBe(entry.htmlHash.toLowerCase());

            // Não deve conter caracteres uppercase
            expect(entry.htmlHash).not.toMatch(/[A-F]/);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.6**
     *
     * O hash SHA-256 DEVE ser uma propriedade obrigatória da
     * entrada de navegação.
     */
    it('deve garantir que htmlHash é uma propriedade definida', () => {
      fc.assert(
        fc.property(
          navigationEntryInputArbitrary,
          (input) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona navegação
            manager.addNavigation(input);

            // Obtém histórico
            const history = manager.getNavigationHistory();
            const entry = getFirstEntry(history);

            // htmlHash deve estar definido (não undefined, não null)
            expect(entry.htmlHash).toBeDefined();
            expect(entry.htmlHash).not.toBeNull();
            expect(entry.htmlHash).not.toBe('');

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.6**
     *
     * Para navegações consecutivas com o mesmo hash (mesma página),
     * o hash DEVE ser preservado corretamente em cada entrada.
     */
    it('deve preservar mesmo hash para navegações consecutivas com mesmo conteúdo', () => {
      fc.assert(
        fc.property(
          validSha256HashArbitrary,
          fc.array(
            fc.tuple(urlArbitrary, navigationTypeArbitrary),
            { minLength: 2, maxLength: 5 }
          ),
          (sharedHash, urlTypePairs) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona múltiplas navegações com o mesmo hash
            for (const [url, type] of urlTypePairs) {
              manager.addNavigation({ url, type, htmlHash: sharedHash });
            }

            // Obtém histórico
            const history = manager.getNavigationHistory();

            // Verifica que todas as entradas têm o mesmo hash
            expect(history.length).toBe(urlTypePairs.length);

            for (const entry of history) {
              expect(entry.htmlHash).toBe(sharedHash);
              expect(isValidSha256Hash(entry.htmlHash)).toBe(true);
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.6**
     *
     * O hash SHA-256 DEVE ser imutável após ser armazenado,
     * ou seja, não deve mudar ao longo do tempo.
     */
    it('deve manter hash imutável após armazenamento', () => {
      fc.assert(
        fc.property(
          navigationEntryInputArbitrary,
          (input) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona navegação
            manager.addNavigation(input);

            // Obtém histórico múltiplas vezes
            const history1 = manager.getNavigationHistory();
            const history2 = manager.getNavigationHistory();
            const history3 = manager.getNavigationHistory();

            // Hash deve ser o mesmo em todas as leituras
            const entry1 = getFirstEntry(history1);
            const entry2 = getFirstEntry(history2);
            const entry3 = getFirstEntry(history3);

            expect(entry1.htmlHash).toBe(entry2.htmlHash);
            expect(entry2.htmlHash).toBe(entry3.htmlHash);
            expect(entry1.htmlHash).toBe(input.htmlHash);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.6**
     *
     * O formato do hash SHA-256 DEVE ser consistente com o padrão
     * criptográfico (256 bits = 32 bytes = 64 hex chars).
     */
    it('deve armazenar hash no formato padrão SHA-256 (256 bits)', () => {
      fc.assert(
        fc.property(
          sha256FromContentArbitrary,
          urlArbitrary,
          navigationTypeArbitrary,
          (htmlHash, url, type) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording();

            // Adiciona navegação
            manager.addNavigation({ url, type, htmlHash });

            // Obtém histórico
            const history = manager.getNavigationHistory();
            const entry = getFirstEntry(history);

            // Verifica formato SHA-256
            // 256 bits = 32 bytes = 64 caracteres hexadecimais
            expect(entry.htmlHash.length).toBe(64);

            // Cada par de caracteres representa 1 byte (8 bits)
            // 64 caracteres = 32 bytes = 256 bits
            const byteCount = entry.htmlHash.length / 2;
            expect(byteCount).toBe(32);

            // Bits totais
            const bitCount = byteCount * 8;
            expect(bitCount).toBe(256);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    /**
     * **Validates: Requirements 3.6**
     *
     * Verifica que o hash SHA-256 é armazenado junto com todos
     * os outros campos da entrada de navegação.
     */
    it('deve armazenar hash junto com todos os campos da entrada', () => {
      fc.assert(
        fc.property(
          navigationEntryInputArbitrary,
          timestampArbitrary,
          (input, startTime) => {
            // Cria manager e inicia gravação
            manager = createTestManager();
            manager.startRecording(startTime);

            // Adiciona navegação
            manager.addNavigation(input);

            // Obtém histórico
            const history = manager.getNavigationHistory();
            const entry = getFirstEntry(history);

            // Verifica que todos os campos estão presentes
            expect(entry.htmlHash).toBe(input.htmlHash);
            expect(entry.fullUrl).toBe(input.url);
            expect(entry.type).toBe(input.type);
            expect(entry.videoTimestamp).toBeDefined();
            expect(entry.formattedTime).toBeDefined();
            expect(entry.url).toBeDefined(); // URL truncada

            // Hash deve ser válido
            expect(isValidSha256Hash(entry.htmlHash)).toBe(true);

            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
