/**
 * Teste de propriedade para detecção de localhost no CSP pelo validador
 *
 * **Feature: extensao-mv3-conformidade, Property 2: Validador rejeita localhost no CSP de produção**
 * **Validates: Requirements 4.1, 10.3**
 *
 * Propriedade: Para qualquer string CSP gerada para o modo production,
 * se a string contiver qualquer padrão de localhost (http://localhost,
 * ws://localhost, http://127.0.0.1, ws://127.0.0.1), o validador SHALL
 * retornar valid: false com erro descritivo e checks.noLocalhostInCSP: false.
 *
 * @module localhost-csp-detection.property.test
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  checkLocalhostInCSP,
  type ManifestValidationResult,
} from '../../scripts/validate-manifest';
import {
  LOCALHOST_PATTERNS,
  CSP_BASE,
  buildCSP,
} from '../../src/lib/csp/csp-builder';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Cria um ManifestValidationResult limpo para testes individuais.
 * Todos os checks iniciam como true (sem problemas detectados).
 */
function createCleanResult(): ManifestValidationResult {
  return {
    valid: true,
    errors: [],
    warnings: [],
    checks: {
      noUnusedPermissions: true,
      noSourceMaps: true,
      noLocalhostInCSP: true,
      hasMinimumChromeVersion: true,
      noMapsInWebAccessibleResources: true,
    },
  };
}

/**
 * Constrói um objeto manifest com CSP extension_pages customizado.
 *
 * @param extensionPages - String CSP para extension_pages
 * @returns Objeto manifest parcial com content_security_policy
 */
function buildManifestWithCSP(extensionPages: string): Record<string, unknown> {
  return {
    content_security_policy: {
      extension_pages: extensionPages,
    },
  };
}

// ---------------------------------------------------------------------------
// Arbitrários (Generators) para fast-check
// ---------------------------------------------------------------------------

/**
 * Gerador de um padrão de localhost aleatório dentre os 4 definidos.
 * Cada padrão representa uma variante de endereço local proibida em produção.
 */
const arbLocalhostPattern: fc.Arbitrary<string> = fc.constantFrom(
  ...LOCALHOST_PATTERNS,
);

/**
 * Gerador de porta aleatória para compor URLs localhost completas.
 * Portas entre 1 e 65535, representando o range válido de portas TCP.
 */
const arbPort: fc.Arbitrary<string> = fc
  .integer({ min: 1, max: 65535 })
  .map((port) => String(port));

/**
 * Gerador de URL localhost completa (padrão + porta).
 * Exemplos: "http://localhost:3000", "ws://127.0.0.1:8080"
 */
const arbLocalhostUrl: fc.Arbitrary<string> = fc
  .tuple(arbLocalhostPattern, arbPort)
  .map(([pattern, port]) => `${pattern}${port}`);

/**
 * Gerador de domínios de produção seguros (sem localhost).
 * Simula domínios reais que podem aparecer no CSP de produção.
 */
const arbSafeDomain: fc.Arbitrary<string> = fc.constantFrom(
  'https://*.lexato.com.br',
  'wss://*.lexato.com.br',
  'https://*.s3.sa-east-1.amazonaws.com',
  'https://*.sentry.io',
  'https://ipinfo.io',
  'https://polygon-rpc.com',
  'https://arb1.arbitrum.io',
  'https://mainnet.optimism.io',
  'https://dns.google',
  'https://archive.org',
  'https://api.whoisfreaks.com',
  'https://cloudflare-dns.com',
);

/**
 * Gerador de lista de domínios seguros para compor connect-src.
 * Produz entre 0 e 6 domínios de produção aleatórios.
 */
const arbSafeDomainList: fc.Arbitrary<string[]> = fc.array(arbSafeDomain, {
  minLength: 0,
  maxLength: 6,
});

/**
 * Gerador de string CSP de produção limpa (sem localhost).
 * Combina CSP_BASE com connect-src contendo apenas domínios seguros.
 */
const arbCleanCSP: fc.Arbitrary<string> = arbSafeDomainList.map(
  (domains) => {
    const connectSrc = `connect-src 'self' ${domains.join(' ')}`;
    return `${CSP_BASE}; ${connectSrc}`;
  },
);

/**
 * Gerador de string CSP contaminada com pelo menos um padrão de localhost.
 * Insere URLs localhost em posição aleatória dentro do connect-src.
 */
const arbContaminatedCSP: fc.Arbitrary<string> = fc
  .tuple(
    arbSafeDomainList,
    // Pelo menos 1 URL localhost, até 3
    fc.array(arbLocalhostUrl, { minLength: 1, maxLength: 3 }),
    fc.nat(),
  )
  .map(([safeDomains, localhostUrls, insertPos]) => {
    // Mesclar domínios seguros com URLs localhost em posição aleatória
    const allDomains = [...safeDomains];
    for (const url of localhostUrls) {
      const pos =
        allDomains.length === 0 ? 0 : insertPos % (allDomains.length + 1);
      allDomains.splice(pos, 0, url);
    }
    const connectSrc = `connect-src 'self' ${allDomains.join(' ')}`;
    return `${CSP_BASE}; ${connectSrc}`;
  });

/**
 * Gerador de wildcard localhost (formato usado no manifest real).
 * Exemplos: "http://localhost:*", "ws://127.0.0.1:*"
 */
const arbLocalhostWildcard: fc.Arbitrary<string> = arbLocalhostPattern.map(
  (pattern) => `${pattern}*`,
);

/**
 * Gerador de CSP contaminado com wildcards de localhost.
 * Simula o cenário real onde o CSP de dev usa "http://localhost:*".
 */
const arbContaminatedCSPWithWildcard: fc.Arbitrary<string> = fc
  .tuple(
    arbSafeDomainList,
    fc.array(arbLocalhostWildcard, { minLength: 1, maxLength: 4 }),
    fc.nat(),
  )
  .map(([safeDomains, wildcards, insertPos]) => {
    const allDomains = [...safeDomains];
    for (const wc of wildcards) {
      const pos =
        allDomains.length === 0 ? 0 : insertPos % (allDomains.length + 1);
      allDomains.splice(pos, 0, wc);
    }
    const connectSrc = `connect-src 'self' ${allDomains.join(' ')}`;
    return `${CSP_BASE}; ${connectSrc}`;
  });

// ---------------------------------------------------------------------------
// Testes de propriedade
// ---------------------------------------------------------------------------

describe('Property 2: Validador rejeita localhost no CSP de produção', () => {
  /**
   * Propriedade 2a: Se o CSP extension_pages contém qualquer padrão de
   * localhost (com porta específica), o validador DEVE retornar
   * noLocalhostInCSP: false e incluir erro descritivo.
   *
   * Gera strings CSP com URLs localhost em posições aleatórias,
   * misturadas com domínios de produção legítimos.
   */
  it('rejeita CSP contendo URLs localhost com porta específica', () => {
    fc.assert(
      fc.property(arbContaminatedCSP, (cspString) => {
        const manifest = buildManifestWithCSP(cspString);
        const result = createCleanResult();

        checkLocalhostInCSP(manifest, result);

        // O check DEVE falhar
        expect(result.checks.noLocalhostInCSP).toBe(false);

        // DEVE haver pelo menos um erro
        expect(result.errors.length).toBeGreaterThanOrEqual(1);

        // O erro DEVE mencionar localhost
        expect(
          result.errors.some(
            (e) => e.includes('localhost') || e.includes('127.0.0.1'),
          ),
        ).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 2b: Se o CSP extension_pages contém padrões de localhost
   * com wildcard (formato real do CSP de dev: "http://localhost:*"),
   * o validador DEVE rejeitar igualmente.
   *
   * Verifica que o validador detecta tanto portas específicas quanto wildcards.
   */
  it('rejeita CSP contendo localhost com wildcard de porta', () => {
    fc.assert(
      fc.property(arbContaminatedCSPWithWildcard, (cspString) => {
        const manifest = buildManifestWithCSP(cspString);
        const result = createCleanResult();

        checkLocalhostInCSP(manifest, result);

        // O check DEVE falhar
        expect(result.checks.noLocalhostInCSP).toBe(false);

        // DEVE haver pelo menos um erro
        expect(result.errors.length).toBeGreaterThanOrEqual(1);

        // O erro DEVE ser descritivo (mencionar CSP e localhost/127.0.0.1)
        expect(
          result.errors.some((e) => e.includes('CSP')),
        ).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 2c: Se o CSP extension_pages NÃO contém nenhum padrão de
   * localhost, o validador DEVE retornar noLocalhostInCSP: true e nenhum
   * erro relacionado.
   *
   * Gera strings CSP com apenas domínios de produção legítimos e verifica
   * ausência de falsos positivos.
   */
  it('aceita CSP sem localhost (sem falsos positivos)', () => {
    fc.assert(
      fc.property(arbCleanCSP, (cspString) => {
        const manifest = buildManifestWithCSP(cspString);
        const result = createCleanResult();

        checkLocalhostInCSP(manifest, result);

        // O check DEVE passar
        expect(result.checks.noLocalhostInCSP).toBe(true);

        // NÃO deve haver erros
        expect(result.errors).toHaveLength(0);
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 2d: O CSP gerado por buildCSP(false) (modo produção)
   * DEVE sempre passar na validação do checkLocalhostInCSP.
   *
   * Verifica a integração entre o builder e o validador: o CSP de produção
   * gerado pelo builder nunca deve conter localhost.
   */
  it('CSP de produção gerado pelo builder sempre passa na validação', () => {
    // Esta propriedade é determinística, mas valida a integração
    const productionCSP = buildCSP(false);
    const manifest = buildManifestWithCSP(productionCSP);
    const result = createCleanResult();

    checkLocalhostInCSP(manifest, result);

    expect(result.checks.noLocalhostInCSP).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  /**
   * Propriedade 2e: O CSP gerado por buildCSP(true) (modo desenvolvimento)
   * DEVE sempre falhar na validação do checkLocalhostInCSP.
   *
   * Verifica que o CSP de dev contém localhost e que o validador o detecta.
   */
  it('CSP de desenvolvimento gerado pelo builder sempre falha na validação', () => {
    const devCSP = buildCSP(true);
    const manifest = buildManifestWithCSP(devCSP);
    const result = createCleanResult();

    checkLocalhostInCSP(manifest, result);

    expect(result.checks.noLocalhostInCSP).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  /**
   * Propriedade 2f: Para cada padrão de localhost individualmente,
   * o validador DEVE detectar e reportar com erro descritivo.
   *
   * Gera CSPs com exatamente um padrão de localhost por vez e verifica
   * que cada padrão é detectado independentemente.
   */
  it('detecta cada padrão de localhost individualmente', () => {
    fc.assert(
      fc.property(
        arbLocalhostPattern,
        arbPort,
        arbSafeDomainList,
        (pattern, port, safeDomains) => {
          const localhostUrl = `${pattern}${port}`;
          const allDomains = [...safeDomains, localhostUrl];
          const connectSrc = `connect-src 'self' ${allDomains.join(' ')}`;
          const cspString = `${CSP_BASE}; ${connectSrc}`;

          const manifest = buildManifestWithCSP(cspString);
          const result = createCleanResult();

          checkLocalhostInCSP(manifest, result);

          // O check DEVE falhar para qualquer padrão individual
          expect(result.checks.noLocalhostInCSP).toBe(false);

          // O erro DEVE mencionar o padrão específico encontrado
          expect(
            result.errors.some((e) => e.includes(pattern)),
          ).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 2g: Manifest sem content_security_policy definido
   * NÃO deve gerar erro de localhost (não é responsabilidade desta verificação).
   *
   * Verifica que o validador trata graciosamente manifests sem CSP.
   */
  it('aceita manifest sem CSP definido (sem erro)', () => {
    fc.assert(
      fc.property(
        // Gera manifests sem content_security_policy
        fc.constantFrom(
          {},
          { manifest_version: 3 },
          { permissions: ['storage'] },
        ),
        (manifest) => {
          const result = createCleanResult();

          checkLocalhostInCSP(manifest, result);

          // O check DEVE permanecer true (sem CSP = sem violação)
          expect(result.checks.noLocalhostInCSP).toBe(true);
          expect(result.errors).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
