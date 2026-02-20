/**
 * Teste de propriedade para cache de permissões do PermissionHelper
 *
 * **Feature: extensao-mv3-conformidade, Property 5: Cache de permissões evita solicitações repetidas**
 * **Validates: Requirements 2.8**
 *
 * Propriedade: Para qualquer permissão opcional já concedida e armazenada no cache
 * (chrome.storage.session), uma segunda chamada a PermissionHelper.hasPermission dentro
 * do TTL SHALL retornar o resultado do cache sem chamar chrome.permissions.contains,
 * e PermissionHelper.requestPermission SHALL retornar true sem chamar
 * chrome.permissions.request. O cache SHALL sobreviver a reinícios do Service Worker
 * dentro da mesma sessão do browser.
 *
 * @module permission-cache.property.test
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import fc from 'fast-check';
import {
  createPermissionHelper,
  type PermissionHelper,
  type OptionalPermission,
  type PermissionCacheData,
} from '../../src/lib/permissions/permission-helper';

// ---------------------------------------------------------------------------
// Referências tipadas para os mocks do chrome (definidos no setup.ts global)
// ---------------------------------------------------------------------------

const sessionGet = chrome.storage.session.get as unknown as Mock;
const sessionSet = chrome.storage.session.set as unknown as Mock;
const permContains = chrome.permissions.contains as unknown as Mock;
const permRequest = chrome.permissions.request as unknown as Mock;

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Chave de armazenamento do cache no chrome.storage.session */
const CACHE_KEY = 'permissionCache';

// ---------------------------------------------------------------------------
// Arbitrários (Generators) para fast-check
// ---------------------------------------------------------------------------

/**
 * Gerador de permissões opcionais válidas.
 * Produz valores do tipo OptionalPermission de forma uniforme.
 */
const arbOptionalPermission: fc.Arbitrary<OptionalPermission> = fc.constantFrom(
  'management' as OptionalPermission,
  'geolocation' as OptionalPermission,
  'notifications' as OptionalPermission,
  'tabCapture' as OptionalPermission,
);

/**
 * Gerador de valores de TTL arbitrários em milissegundos.
 * Intervalo: 1000ms (1s) a 600000ms (10min) para cobrir cenários realistas.
 * O TTL padrão da implementação é 300000ms (5min).
 */
const arbTtlMs: fc.Arbitrary<number> = fc.integer({ min: 1000, max: 600_000 });

/**
 * Gerador de idade do cache em milissegundos (quanto tempo atrás a entrada foi criada).
 * Intervalo: 0ms a 900000ms (15min) para cobrir cenários dentro e fora do TTL.
 */
const arbCacheAgeMs: fc.Arbitrary<number> = fc.integer({ min: 0, max: 900_000 });

/**
 * Gerador de estado de permissão (concedida ou recusada).
 */
const arbPermissionState: fc.Arbitrary<boolean> = fc.boolean();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Cria dados de cache para uma permissão específica com TTL e idade configuráveis.
 * A idade representa quanto tempo atrás (em ms) a entrada foi verificada.
 */
function buildCacheData(
  permission: OptionalPermission,
  granted: boolean,
  ttl: number,
  ageMs: number,
): PermissionCacheData {
  return {
    state: { [permission]: granted },
    lastChecked: { [permission]: Date.now() - ageMs },
    ttl,
  };
}

/**
 * Configura o mock de chrome.storage.session.get para retornar cache específico.
 */
function mockSessionGetWithCache(cache: PermissionCacheData): void {
  sessionGet.mockResolvedValue({ [CACHE_KEY]: cache });
}

// ---------------------------------------------------------------------------
// Testes de propriedade
// ---------------------------------------------------------------------------

describe('Property 5: Cache de permissões evita solicitações repetidas', () => {
  let helper: PermissionHelper;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionGet.mockResolvedValue({});
    sessionSet.mockResolvedValue(undefined);
    helper = createPermissionHelper();
  });

  /**
   * Propriedade 5a: hasPermission retorna resultado do cache sem chamar
   * chrome.permissions.contains quando a entrada está dentro do TTL.
   *
   * Para qualquer permissão, qualquer estado (true/false), qualquer TTL
   * e qualquer idade menor que o TTL, hasPermission deve retornar o estado
   * do cache sem consultar a API do Chrome.
   */
  it('hasPermission retorna cache sem chamar chrome.permissions.contains quando dentro do TTL', () => {
    return fc.assert(
      fc.asyncProperty(
        arbOptionalPermission,
        arbPermissionState,
        arbTtlMs,
        async (permission, granted, ttl) => {
          // Gerar idade garantidamente dentro do TTL (0 a ttl-1)
          const ageMs = Math.floor(Math.random() * ttl);

          vi.clearAllMocks();
          const cache = buildCacheData(permission, granted, ttl, ageMs);
          mockSessionGetWithCache(cache);
          sessionSet.mockResolvedValue(undefined);

          // Criar nova instância para garantir estado limpo
          const h = createPermissionHelper();
          const result = await h.hasPermission(permission);

          // Verificações:
          // 1. Deve retornar o estado do cache
          expect(result).toBe(granted);

          // 2. NÃO deve chamar chrome.permissions.contains (cache hit)
          expect(permContains).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 5b: requestPermission retorna true sem chamar
   * chrome.permissions.request quando a permissão está concedida no cache
   * e dentro do TTL.
   *
   * Para qualquer permissão e qualquer TTL, se o cache indica que a permissão
   * está concedida (state=true) e a idade é menor que o TTL,
   * requestPermission deve retornar true sem solicitar ao usuário.
   */
  it('requestPermission retorna true sem chamar chrome.permissions.request quando cache indica concedida dentro do TTL', () => {
    return fc.assert(
      fc.asyncProperty(
        arbOptionalPermission,
        arbTtlMs,
        async (permission, ttl) => {
          // Gerar idade garantidamente dentro do TTL
          const ageMs = Math.floor(Math.random() * ttl);

          vi.clearAllMocks();
          // Cache com permissão CONCEDIDA (granted=true)
          const cache = buildCacheData(permission, true, ttl, ageMs);
          mockSessionGetWithCache(cache);
          sessionSet.mockResolvedValue(undefined);

          const h = createPermissionHelper();
          const result = await h.requestPermission(permission);

          // Verificações:
          // 1. Deve retornar true (permissão concedida no cache)
          expect(result).toBe(true);

          // 2. NÃO deve chamar chrome.permissions.request (cache hit)
          expect(permRequest).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 5c: hasPermission consulta chrome.permissions.contains
   * quando o TTL do cache expirou.
   *
   * Para qualquer permissão, qualquer TTL e qualquer idade maior ou igual
   * ao TTL, hasPermission DEVE chamar chrome.permissions.contains para
   * obter o estado atualizado da permissão.
   */
  it('hasPermission consulta chrome.permissions.contains quando TTL expirou', () => {
    return fc.assert(
      fc.asyncProperty(
        arbOptionalPermission,
        arbPermissionState,
        arbTtlMs,
        async (permission, cachedState, ttl) => {
          // Gerar idade garantidamente FORA do TTL (ttl a ttl + 600000)
          const extraAge = Math.floor(Math.random() * 600_000);
          const ageMs = ttl + extraAge;

          vi.clearAllMocks();
          const cache = buildCacheData(permission, cachedState, ttl, ageMs);
          mockSessionGetWithCache(cache);
          sessionSet.mockResolvedValue(undefined);
          // API retorna o oposto do cache para confirmar que o resultado vem da API
          permContains.mockResolvedValue(!cachedState);

          const h = createPermissionHelper();
          const result = await h.hasPermission(permission);

          // Verificações:
          // 1. DEVE chamar chrome.permissions.contains (cache expirado)
          expect(permContains).toHaveBeenCalledWith({
            permissions: [permission],
          });

          // 2. Deve retornar o resultado da API, não do cache
          expect(result).toBe(!cachedState);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 5d: requestPermission consulta chrome.permissions.request
   * quando o TTL do cache expirou, mesmo que o cache indicasse permissão concedida.
   *
   * Para qualquer permissão e qualquer TTL, se a idade é maior ou igual ao TTL,
   * requestPermission DEVE chamar chrome.permissions.request.
   */
  it('requestPermission consulta chrome.permissions.request quando TTL expirou', () => {
    return fc.assert(
      fc.asyncProperty(
        arbOptionalPermission,
        arbTtlMs,
        async (permission, ttl) => {
          // Gerar idade garantidamente FORA do TTL
          const extraAge = Math.floor(Math.random() * 600_000);
          const ageMs = ttl + extraAge;

          vi.clearAllMocks();
          // Cache com permissão concedida, mas expirado
          const cache = buildCacheData(permission, true, ttl, ageMs);
          mockSessionGetWithCache(cache);
          sessionSet.mockResolvedValue(undefined);
          permRequest.mockResolvedValue(true);

          const h = createPermissionHelper();
          const result = await h.requestPermission(permission);

          // Verificações:
          // 1. DEVE chamar chrome.permissions.request (cache expirado)
          expect(permRequest).toHaveBeenCalledWith({
            permissions: [permission],
          });

          // 2. Deve retornar o resultado da API
          expect(result).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 5e: Cache sobrevive a reinícios do Service Worker.
   *
   * Simula reinício do SW criando uma nova instância do PermissionHelper.
   * O cache em chrome.storage.session deve ser lido pela nova instância,
   * retornando o estado correto sem chamar a API do Chrome.
   *
   * Para qualquer permissão e qualquer estado, se o cache está dentro do TTL,
   * uma nova instância do PermissionHelper deve ler o cache e retornar
   * o resultado sem chamar chrome.permissions.contains.
   */
  it('cache sobrevive a reinícios do Service Worker (nova instância lê chrome.storage.session)', () => {
    return fc.assert(
      fc.asyncProperty(
        arbOptionalPermission,
        arbPermissionState,
        arbTtlMs,
        async (permission, granted, ttl) => {
          // Gerar idade garantidamente dentro do TTL
          const ageMs = Math.floor(Math.random() * ttl);

          vi.clearAllMocks();
          const cache = buildCacheData(permission, granted, ttl, ageMs);
          mockSessionGetWithCache(cache);
          sessionSet.mockResolvedValue(undefined);

          // Simular reinício do SW: criar instância completamente nova
          const newHelper = createPermissionHelper();
          const result = await newHelper.hasPermission(permission);

          // Verificações:
          // 1. A nova instância deve ler do chrome.storage.session
          expect(sessionGet).toHaveBeenCalled();

          // 2. Deve retornar o estado do cache
          expect(result).toBe(granted);

          // 3. NÃO deve chamar chrome.permissions.contains (cache válido)
          expect(permContains).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 100 },
    );
  });
});
