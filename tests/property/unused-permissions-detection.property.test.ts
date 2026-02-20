/**
 * Teste de propriedade para detecção de permissões não utilizadas pelo validador
 *
 * **Feature: extensao-mv3-conformidade, Property 3: Validador detecta permissões não utilizadas**
 * **Validates: Requirements 10.1**
 *
 * Propriedade: Para qualquer conjunto de permissões declaradas no manifest e
 * para qualquer conjunto de APIs Chrome efetivamente referenciadas no código-fonte,
 * se existir uma permissão declarada sem API correspondente utilizada, o validador
 * SHALL retornar valid: false com erro listando a permissão não utilizada e
 * checks.noUnusedPermissions: false.
 *
 * @module unused-permissions-detection.property.test
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  checkUnusedPermissions,
  PERMISSION_API_PATTERNS,
  IMPLICIT_PERMISSIONS,
  type ManifestValidationResult,
} from '../../scripts/validate-manifest';

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
 * Lista de permissões conhecidas (mapeadas em PERMISSION_API_PATTERNS).
 * Usada para gerar subconjuntos aleatórios de permissões.
 */
const KNOWN_PERMISSIONS = Object.keys(PERMISSION_API_PATTERNS);

/**
 * Gera um trecho de código-fonte que simula o uso de uma API Chrome
 * correspondente a uma permissão específica.
 *
 * Retorna uma string que satisfaz pelo menos um dos padrões regex
 * definidos em PERMISSION_API_PATTERNS para a permissão dada.
 *
 * @param permission - Nome da permissão (ex: 'storage', 'tabs')
 * @returns Trecho de código que referencia a API correspondente
 */
function generateApiUsageForPermission(permission: string): string {
  // Mapeamento direto de permissão para trecho de código que satisfaz o regex
  const apiSnippets: Record<string, string> = {
    cookies: 'chrome.cookies.get({ url: "https://example.com" });',
    webRequest: 'chrome.webRequest.onBeforeRequest.addListener(cb, filter);',
    management: 'chrome.management.getAll().then(handleExtensions);',
    geolocation: 'navigator.geolocation.getCurrentPosition(callback);',
    notifications: 'chrome.notifications.create("id", options);',
    tabCapture: 'chrome.tabCapture.getMediaStreamId({}, callback);',
    storage: 'chrome.storage.local.get("key");',
    tabs: 'chrome.tabs.query({ active: true });',
    scripting: 'chrome.scripting.executeScript({ target: { tabId } });',
    alarms: 'chrome.alarms.create("check", { periodInMinutes: 5 });',
    webNavigation: 'chrome.webNavigation.onCompleted.addListener(cb);',
    offscreen: 'chrome.offscreen.createDocument({ url: "off.html" });',
    sidePanel: 'chrome.sidePanel.setOptions({ enabled: true });',
    identity: 'chrome.identity.getAuthToken({ interactive: true });',
  };

  return apiSnippets[permission] ?? '';
}

// ---------------------------------------------------------------------------
// Arbitrários (Generators) para fast-check
// ---------------------------------------------------------------------------

/**
 * Gerador de uma permissão conhecida aleatória (presente em PERMISSION_API_PATTERNS).
 */
const arbKnownPermission: fc.Arbitrary<string> = fc.constantFrom(
  ...KNOWN_PERMISSIONS,
);

/**
 * Gerador de subconjunto não vazio de permissões conhecidas (sem duplicatas).
 * Produz entre 1 e o total de permissões conhecidas.
 */
const arbPermissionSubset: fc.Arbitrary<string[]> = fc
  .uniqueArray(arbKnownPermission, { minLength: 1, maxLength: KNOWN_PERMISSIONS.length })

/**
 * Gerador de código-fonte que contém uso de APIs para um conjunto específico de permissões.
 * Recebe um array de permissões e gera código que referencia todas as APIs correspondentes.
 */
function arbSourceForPermissions(permissions: string[]): string {
  return permissions.map(generateApiUsageForPermission).join('\n');
}

// ---------------------------------------------------------------------------
// Testes de propriedade
// ---------------------------------------------------------------------------

describe('Property 3: Validador detecta permissões não utilizadas', () => {
  /**
   * Propriedade 3a: Se uma permissão obrigatória é declarada no manifest
   * mas sua API correspondente NÃO é referenciada no código-fonte,
   * o validador DEVE retornar noUnusedPermissions: false e incluir
   * erro mencionando a permissão não utilizada.
   *
   * Gera conjuntos aleatórios de permissões, divide em "usadas" e
   * "não usadas", gera código apenas para as usadas, e verifica
   * que o validador detecta as não usadas.
   */
  it('detecta permissões obrigatórias sem uso correspondente no código', () => {
    fc.assert(
      fc.property(
        // Gera subconjunto de permissões com pelo menos 2 itens
        fc.uniqueArray(arbKnownPermission, {
          minLength: 2,
          maxLength: KNOWN_PERMISSIONS.length,
        }),
        (allPermissions) => {
          // Particionar permissões em usadas e não usadas
          // Usar pelo menos 1 como não usada
          const splitIndex = Math.max(1, Math.floor(allPermissions.length / 2));
          const usedPermissions = allPermissions.slice(0, splitIndex);
          const unusedPermissions = allPermissions.slice(splitIndex);

          // Gerar código-fonte apenas para as permissões usadas
          const sourceContent = arbSourceForPermissions(usedPermissions);

          const manifest: Record<string, unknown> = {
            permissions: allPermissions,
            optional_permissions: [],
          };

          const result = createCleanResult();
          checkUnusedPermissions(manifest, sourceContent, result);

          // O check DEVE falhar (há permissões não usadas)
          expect(result.checks.noUnusedPermissions).toBe(false);

          // DEVE haver pelo menos um erro
          expect(result.errors.length).toBeGreaterThanOrEqual(1);

          // Cada permissão não usada DEVE ser mencionada em algum erro
          for (const perm of unusedPermissions) {
            expect(
              result.errors.some((e) => e.includes(perm)),
            ).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 3b: Se TODAS as permissões obrigatórias declaradas no manifest
   * têm suas APIs correspondentes referenciadas no código-fonte,
   * o validador DEVE retornar noUnusedPermissions: true e nenhum erro.
   *
   * Gera conjuntos aleatórios de permissões e código que referencia
   * todas as APIs correspondentes, verificando ausência de falsos positivos.
   */
  it('aceita permissões obrigatórias com uso correspondente (sem falsos positivos)', () => {
    fc.assert(
      fc.property(
        arbPermissionSubset,
        (permissions) => {
          // Gerar código-fonte para TODAS as permissões
          const sourceContent = arbSourceForPermissions(permissions);

          const manifest: Record<string, unknown> = {
            permissions,
            optional_permissions: [],
          };

          const result = createCleanResult();
          checkUnusedPermissions(manifest, sourceContent, result);

          // O check DEVE passar (todas as permissões são usadas)
          expect(result.checks.noUnusedPermissions).toBe(true);

          // NÃO deve haver erros
          expect(result.errors).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 3c: Para permissões opcionais (optional_permissions),
   * se o código-fonte contém chrome.permissions.request, o validador
   * DEVE aceitar (noUnusedPermissions: true).
   *
   * Gera conjuntos aleatórios de permissões opcionais com código que
   * inclui chrome.permissions.request e verifica que o validador aceita.
   */
  it('aceita permissões opcionais quando chrome.permissions.request existe no código', () => {
    fc.assert(
      fc.property(
        // Permissões opcionais (1 a 4)
        fc.uniqueArray(arbKnownPermission, { minLength: 1, maxLength: 4 }),
        (optionalPerms) => {
          // Código-fonte com chrome.permissions.request
          const sourceContent =
            'chrome.permissions.request({ permissions: ["notifications"] });';

          const manifest: Record<string, unknown> = {
            permissions: [],
            optional_permissions: optionalPerms,
          };

          const result = createCleanResult();
          checkUnusedPermissions(manifest, sourceContent, result);

          // O check DEVE passar
          expect(result.checks.noUnusedPermissions).toBe(true);

          // NÃO deve haver erros
          expect(result.errors).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 3d: Para permissões opcionais (optional_permissions),
   * se o código-fonte NÃO contém chrome.permissions.request, o validador
   * DEVE retornar noUnusedPermissions: false com erro descritivo.
   *
   * Gera conjuntos aleatórios de permissões opcionais com código que
   * NÃO inclui chrome.permissions.request e verifica que o validador rejeita.
   */
  it('rejeita permissões opcionais quando chrome.permissions.request NÃO existe no código', () => {
    fc.assert(
      fc.property(
        // Permissões opcionais (1 a 4)
        fc.uniqueArray(arbKnownPermission, { minLength: 1, maxLength: 4 }),
        (optionalPerms) => {
          // Código-fonte SEM chrome.permissions.request
          // Pode ter uso direto da API, mas sem o request
          const sourceContent = 'chrome.storage.local.get("key");';

          const manifest: Record<string, unknown> = {
            permissions: [],
            optional_permissions: optionalPerms,
          };

          const result = createCleanResult();
          checkUnusedPermissions(manifest, sourceContent, result);

          // O check DEVE falhar
          expect(result.checks.noUnusedPermissions).toBe(false);

          // DEVE haver pelo menos um erro mencionando chrome.permissions.request
          expect(result.errors.length).toBeGreaterThanOrEqual(1);
          expect(
            result.errors.some((e) => e.includes('chrome.permissions.request')),
          ).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 3e: Permissões implícitas (como activeTab) DEVEM gerar
   * warning (não erro), independente do conteúdo do código-fonte.
   * O check noUnusedPermissions DEVE permanecer true.
   *
   * Gera manifests com permissões implícitas misturadas com permissões
   * normais usadas e verifica que apenas warnings são emitidos para as implícitas.
   */
  it('emite warning (não erro) para permissões implícitas', () => {
    fc.assert(
      fc.property(
        // Permissões normais usadas (0 a 3)
        fc.uniqueArray(arbKnownPermission, { minLength: 0, maxLength: 3 }),
        // Permissões implícitas (sempre inclui activeTab)
        fc.constant([...IMPLICIT_PERMISSIONS]),
        (normalPerms, implicitPerms) => {
          // Gerar código para as permissões normais
          const sourceContent = arbSourceForPermissions(normalPerms);

          // Combinar permissões normais com implícitas (sem duplicatas)
          const allPermissions = [
            ...new Set([...normalPerms, ...implicitPerms]),
          ];

          const manifest: Record<string, unknown> = {
            permissions: allPermissions,
            optional_permissions: [],
          };

          const result = createCleanResult();
          checkUnusedPermissions(manifest, sourceContent, result);

          // O check DEVE permanecer true (implícitas não geram erro)
          expect(result.checks.noUnusedPermissions).toBe(true);

          // NÃO deve haver erros
          expect(result.errors).toHaveLength(0);

          // DEVE haver warnings para cada permissão implícita
          for (const perm of implicitPerms) {
            expect(
              result.warnings.some((w) => w.includes(perm)),
            ).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 3f: Cenário misto - manifest com permissões obrigatórias
   * (algumas usadas, algumas não) E permissões opcionais (com request presente).
   * O validador DEVE detectar apenas as permissões obrigatórias não usadas
   * e aceitar as opcionais.
   *
   * Gera cenários complexos com ambos os tipos de permissão e verifica
   * que o validador trata cada tipo corretamente.
   */
  it('trata corretamente cenário misto de permissões obrigatórias e opcionais', () => {
    fc.assert(
      fc.property(
        // Permissões obrigatórias usadas (1 a 3)
        fc.uniqueArray(arbKnownPermission, { minLength: 1, maxLength: 3 }),
        // Permissão obrigatória não usada (1 item diferente das usadas)
        arbKnownPermission,
        // Permissões opcionais (1 a 2)
        fc.uniqueArray(arbKnownPermission, { minLength: 1, maxLength: 2 }),
        (usedPerms, unusedPerm, optionalPerms) => {
          // Garantir que a permissão não usada não está entre as usadas
          if (usedPerms.includes(unusedPerm)) {
            return;
          }

          // Gerar código para as permissões usadas + chrome.permissions.request
          const sourceContent =
            arbSourceForPermissions(usedPerms) +
            '\nchrome.permissions.request({ permissions: ["notifications"] });';

          const manifest: Record<string, unknown> = {
            permissions: [...usedPerms, unusedPerm],
            optional_permissions: optionalPerms,
          };

          const result = createCleanResult();
          checkUnusedPermissions(manifest, sourceContent, result);

          // O check DEVE falhar (há permissão obrigatória não usada)
          expect(result.checks.noUnusedPermissions).toBe(false);

          // DEVE haver erro mencionando a permissão não usada
          expect(
            result.errors.some((e) => e.includes(unusedPerm)),
          ).toBe(true);

          // NÃO deve haver erro sobre chrome.permissions.request
          // (pois o request está presente no código)
          const requestErrors = result.errors.filter(
            (e) =>
              e.includes('chrome.permissions.request') &&
              e.includes('opcionais'),
          );
          expect(requestErrors).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 3g: Manifest sem nenhuma permissão declarada (arrays vazios)
   * DEVE passar na validação sem erros.
   *
   * Verifica que o validador trata graciosamente manifests sem permissões.
   */
  it('aceita manifest sem permissões declaradas', () => {
    fc.assert(
      fc.property(
        // Código-fonte aleatório (pode conter ou não APIs Chrome)
        fc.constantFrom(
          '',
          'console.log("hello");',
          'chrome.storage.local.get("key");',
          'const x = 42;',
        ),
        (sourceContent) => {
          const manifest: Record<string, unknown> = {
            permissions: [],
            optional_permissions: [],
          };

          const result = createCleanResult();
          checkUnusedPermissions(manifest, sourceContent, result);

          // O check DEVE passar (sem permissões = sem violação)
          expect(result.checks.noUnusedPermissions).toBe(true);

          // NÃO deve haver erros
          expect(result.errors).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
