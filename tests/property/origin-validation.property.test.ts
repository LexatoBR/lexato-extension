/**
 * Teste de propriedade para validação de origem do service worker
 *
 * **Feature: cws-pre-publish-fixes, Property 3: Validação de origem respeita modo de build**
 * **Validates: Requirements 7.1, 7.2**
 *
 * Propriedade: Para qualquer origem de mensagem, o resultado da verificação
 * `isDevOrigin` deve ser equivalente a `isDevMode AND (origem contém 'localhost'
 * OR origem contém '127.0.0.1')`. Em produção (`isDevMode === false`),
 * `isDevOrigin` deve ser sempre `false` independente da origem.
 *
 * @module origin-validation.property.test
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { isDevOrigin, isOriginAllowed, ALLOWED_ORIGINS } from '../../src/background/origin-validation';

// ---------------------------------------------------------------------------
// Geradores auxiliares
// ---------------------------------------------------------------------------

/** Gera origens aleatórias incluindo localhost, IPs e domínios */
const arbOrigin = fc.oneof(
  fc.constant('http://localhost'),
  fc.constant('http://localhost:3000'),
  fc.constant('http://localhost:5173'),
  fc.constant('https://localhost'),
  fc.constant('http://127.0.0.1'),
  fc.constant('http://127.0.0.1:3000'),
  fc.constant('https://127.0.0.1:8080'),
  fc.constant('https://app.lexato.com.br'),
  fc.constant('https://admin.lexato.com.br'),
  fc.constant('https://staging.lexato.com.br'),
  fc.constant('https://evil-localhost.com'),
  fc.constant('https://malicious.com/localhost'),
  fc.constant(undefined),
  fc.webUrl().map(url => new URL(url).origin),
  fc.string({ minLength: 1, maxLength: 50 }),
);

// ---------------------------------------------------------------------------
// Testes de propriedade
// ---------------------------------------------------------------------------

describe('Property 3: Validação de origem respeita modo de build', () => {
  /**
   * Propriedade 3a: Em modo produção (isDevMode=false), isDevOrigin
   * retorna SEMPRE false, independente da origem fornecida.
   */
  it('em produção, isDevOrigin é sempre false para qualquer origem', () => {
    fc.assert(
      fc.property(
        arbOrigin,
        (origin) => {
          const result = isDevOrigin(origin, false);
          expect(result).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Propriedade 3b: Em modo desenvolvimento (isDevMode=true), isDevOrigin
   * retorna true APENAS se a origem contém 'localhost' ou '127.0.0.1'.
   */
  it('em desenvolvimento, isDevOrigin é true somente para localhost/127.0.0.1', () => {
    fc.assert(
      fc.property(
        arbOrigin,
        (origin) => {
          const result = isDevOrigin(origin, true);
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Lógica booleana intencional
          const expected = origin !== undefined &&
            (origin.includes('localhost') || origin.includes('127.0.0.1'));
          expect(result).toBe(expected);
        },
      ),
      { numRuns: 200 },
    );
  });

  /**
   * Propriedade 3c: Em produção, origens localhost/127.0.0.1 que não são
   * domínios lexato.com.br são SEMPRE rejeitadas por isOriginAllowed.
   */
  it('em produção, localhost e 127.0.0.1 são rejeitados por isOriginAllowed', () => {
    const localhostOrigins = fc.constantFrom(
      'http://localhost',
      'http://localhost:3000',
      'http://localhost:5173',
      'https://localhost',
      'http://127.0.0.1',
      'http://127.0.0.1:3000',
      'https://127.0.0.1:8080',
    );

    fc.assert(
      fc.property(
        localhostOrigins,
        (origin) => {
          const result = isOriginAllowed(origin, false);
          expect(result).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 3d: Domínios lexato.com.br explícitos são SEMPRE aceitos,
   * independente do modo de build.
   */
  it('domínios lexato.com.br são aceitos em qualquer modo', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALLOWED_ORIGINS),
        fc.boolean(),
        (origin, isDevMode) => {
          const result = isOriginAllowed(origin, isDevMode);
          expect(result).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 3e: Origem undefined é SEMPRE rejeitada,
   * independente do modo de build.
   */
  it('origem undefined é sempre rejeitada', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (isDevMode) => {
          const result = isOriginAllowed(undefined, isDevMode);
          expect(result).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});
