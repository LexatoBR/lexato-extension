/**
 * Teste de propriedade para DomainLookupService via backend proxy
 *
 * **Feature: cws-pre-publish-fixes, Property 1: Lookup forense sempre via backend proxy**
 * **Validates: Requirements 1.2, 2.3**
 *
 * Propriedade: Para qualquer domínio e qualquer tipo de lookup (dns, whois, ssl),
 * o DomainLookupService refatorado deve construir a URL de requisição apontando
 * para VITE_API_BASE_URL/forensic/domain-lookup e nunca para api.whoisfreaks.com
 * ou whoisxmlapi.com diretamente.
 *
 * @module domain-lookup-proxy.property.test
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

// ---------------------------------------------------------------------------
// Constantes do serviço (importadas para validação)
// ---------------------------------------------------------------------------
import { DOMAIN_LOOKUP_PROXY_PATH } from '../../src/lib/forensic/services/domain-lookup-service';

// ---------------------------------------------------------------------------
// Configuração do mock de fetch
// ---------------------------------------------------------------------------

const TEST_API_BASE_URL = 'https://api.lexato.com.br';

/** URLs de APIs de terceiros que NÃO devem ser chamadas diretamente */
const FORBIDDEN_DIRECT_URLS = [
  'api.whoisfreaks.com',
  'whoisxmlapi.com',
  'ssl-certificates.whoisxmlapi.com',
  'www.whoisxmlapi.com',
];

/** Registra todas as URLs chamadas via fetch durante o teste */
let fetchCalledUrls: string[] = [];

/**
 * Mock de fetch que registra URLs e retorna resposta válida do proxy.
 * Permite verificar que todas as chamadas apontam para o backend proxy.
 */
const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input.toString();
  fetchCalledUrls.push(url);

  // Extrair tipo de lookup do body para retornar dados coerentes
  let lookupType = 'dns';
  if (init?.body) {
    try {
      const body = JSON.parse(init.body as string) as { lookupType?: string };
      lookupType = body.lookupType ?? 'dns';
    } catch {
      // Ignora erro de parse
    }
  }

  // Retorna resposta simulada do backend proxy
  const responseData = {
    dns: { data: { domain: 'test.com', queryTimestamp: new Date().toISOString() }, provider: 'whoisfreaks', durationMs: 100 },
    whois: { data: { domain: 'test.com', registrar: 'Test Registrar' }, provider: 'whoisfreaks', durationMs: 150 },
    ssl: { data: { isSecure: true, issuer: 'Test CA' }, provider: 'whoisxml', durationMs: 200 },
  };

  return new Response(
    JSON.stringify(responseData[lookupType as keyof typeof responseData] ?? responseData.dns),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});

// ---------------------------------------------------------------------------
// Arbitrários (Generators)
// ---------------------------------------------------------------------------

/**
 * Gerador de domínios aleatórios válidos.
 * Produz domínios no formato "subdominio.tld" com caracteres alfanuméricos.
 */
const arbDomain: fc.Arbitrary<string> = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 15, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')) }),
    fc.constantFrom('.com', '.com.br', '.org', '.net', '.io', '.dev', '.adv.br', '.gov.br'),
  )
  .map(([name, tld]) => `${name}${tld}`);

/**
 * Gerador de URLs HTTPS aleatórias para testes de SSL.
 */
const arbHttpsUrl: fc.Arbitrary<string> = arbDomain.map((domain) => `https://${domain}/path`);

// ---------------------------------------------------------------------------
// Testes de propriedade
// ---------------------------------------------------------------------------

/**
 * Gerador de URLs HTTPS aleatórias para testes de SSL.
 */

describe('Property 1: Lookup forense sempre via backend proxy', () => {
  beforeEach(() => {
    fetchCalledUrls = [];
    mockFetch.mockClear();
    vi.stubGlobal('fetch', mockFetch);
  });

  /**
   * Propriedade 1a: Para qualquer domínio, lookupDns deve chamar
   * exclusivamente o backend proxy, nunca APIs de terceiros.
   */
  it('lookupDns sempre usa backend proxy para qualquer domínio', async () => {
    await fc.assert(
      fc.asyncProperty(arbDomain, async (domain) => {
        fetchCalledUrls = [];
        mockFetch.mockClear();

        // Importação dinâmica para que o mock de env seja aplicado
        const { DomainLookupService } = await import('../../src/lib/forensic/services/domain-lookup-service');

        // Criar instância com apiBaseUrl explícito via constructor hack
        const service = new DomainLookupService();
        // Forçar apiBaseUrl via acesso direto (o campo é privado mas acessível em teste)
        (service as unknown as { apiBaseUrl: string }).apiBaseUrl = TEST_API_BASE_URL;

        await service.lookupDns(domain);

        // Todas as URLs chamadas devem apontar para o backend proxy
        expect(fetchCalledUrls.length).toBeGreaterThanOrEqual(1);
        for (const url of fetchCalledUrls) {
          expect(url).toContain(DOMAIN_LOOKUP_PROXY_PATH);
          expect(url).toContain(TEST_API_BASE_URL);
          for (const forbidden of FORBIDDEN_DIRECT_URLS) {
            expect(url).not.toContain(forbidden);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 1b: Para qualquer domínio, lookupWhois deve chamar
   * exclusivamente o backend proxy.
   */
  it('lookupWhois sempre usa backend proxy para qualquer domínio', async () => {
    await fc.assert(
      fc.asyncProperty(arbDomain, async (domain) => {
        fetchCalledUrls = [];
        mockFetch.mockClear();

        const { DomainLookupService } = await import('../../src/lib/forensic/services/domain-lookup-service');
        const service = new DomainLookupService();
        (service as unknown as { apiBaseUrl: string }).apiBaseUrl = TEST_API_BASE_URL;

        await service.lookupWhois(domain);

        expect(fetchCalledUrls.length).toBeGreaterThanOrEqual(1);
        for (const url of fetchCalledUrls) {
          expect(url).toContain(DOMAIN_LOOKUP_PROXY_PATH);
          expect(url).toContain(TEST_API_BASE_URL);
          for (const forbidden of FORBIDDEN_DIRECT_URLS) {
            expect(url).not.toContain(forbidden);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 1c: Para qualquer URL HTTPS, lookupSsl deve chamar
   * exclusivamente o backend proxy.
   */
  it('lookupSsl sempre usa backend proxy para qualquer URL HTTPS', async () => {
    await fc.assert(
      fc.asyncProperty(arbHttpsUrl, async (url) => {
        fetchCalledUrls = [];
        mockFetch.mockClear();

        const { DomainLookupService } = await import('../../src/lib/forensic/services/domain-lookup-service');
        const service = new DomainLookupService();
        (service as unknown as { apiBaseUrl: string }).apiBaseUrl = TEST_API_BASE_URL;

        await service.lookupSsl(url);

        expect(fetchCalledUrls.length).toBeGreaterThanOrEqual(1);
        for (const calledUrl of fetchCalledUrls) {
          expect(calledUrl).toContain(DOMAIN_LOOKUP_PROXY_PATH);
          expect(calledUrl).toContain(TEST_API_BASE_URL);
          for (const forbidden of FORBIDDEN_DIRECT_URLS) {
            expect(calledUrl).not.toContain(forbidden);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  /**
   * Propriedade 1d: A URL do proxy construída pelo serviço deve sempre
   * seguir o padrão VITE_API_BASE_URL + DOMAIN_LOOKUP_PROXY_PATH.
   */
  it('getProxyUrl retorna URL correta para qualquer apiBaseUrl', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          'https://api.lexato.com.br',
          'https://staging-api.lexato.com.br',
          'http://localhost:3000',
          'https://custom-api.example.com',
        ),
        async (baseUrl) => {
          const { DomainLookupService: DLS } = await import('../../src/lib/forensic/services/domain-lookup-service');
          const service = new DLS();
          (service as unknown as { apiBaseUrl: string }).apiBaseUrl = baseUrl;

          const proxyUrl = service.getProxyUrl();
          expect(proxyUrl).toBe(`${baseUrl}${DOMAIN_LOOKUP_PROXY_PATH}`);
          expect(proxyUrl).not.toContain('whoisfreaks');
          expect(proxyUrl).not.toContain('whoisxml');
        },
      ),
      { numRuns: 100 },
    );
  });
});
