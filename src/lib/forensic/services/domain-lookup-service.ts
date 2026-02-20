/**
 * DomainLookupService - Serviço unificado de consulta de domínio via backend proxy
 *
 * Envia requisições de DNS, WHOIS e SSL ao backend proxy
 * (api.lexato.com.br/forensic/domain-lookup) que intermedia as chamadas
 * a WhoisFreaks e WhoisXML, mantendo API keys seguras no servidor.
 *
 * A interface pública (lookupDns, lookupWhois, lookupSsl) e os tipos
 * de retorno (LookupResult<T>) permanecem inalterados para compatibilidade
 * com o forensic-collector.
 *
 * @module DomainLookupService
 */

import { loggers } from '../../logger';
import { extractHostname } from '../utils/tld-utils';
import type { DNSInfo, WHOISInfo, SSLCertificateInfo } from '../../../types/forensic-metadata.types';

const log = loggers.forensic.withPrefix('[DomainLookup]');

/** Provedor que retornou os dados */
export type LookupProvider = 'whoisfreaks' | 'whoisxml' | 'none';

/** Resultado de uma consulta com metadados do provedor */
export interface LookupResult<T> {
  data: T;
  provider: LookupProvider;
  durationMs: number;
}

/** URL base do backend proxy para lookups forenses */
export const DOMAIN_LOOKUP_PROXY_PATH = '/forensic/domain-lookup';

/**
 * Serviço unificado de consulta de domínio via backend proxy.
 *
 * Todas as chamadas a APIs de terceiros (WhoisFreaks, WhoisXML) são
 * intermediadas pelo backend, eliminando API keys do bundle da extensão.
 */
export class DomainLookupService {
  private apiBaseUrl: string;
  private timeout: number;

  constructor(timeout = 15000) {
    this.apiBaseUrl = (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ?? '';
    this.timeout = timeout;
  }

  // ==========================================================================
  // DNS
  // ==========================================================================

  /**
   * Consulta DNS via backend proxy
   */
  async lookupDns(domain: string): Promise<LookupResult<DNSInfo>> {
    const startTime = Date.now();
    const baseDns: DNSInfo = { domain, queryTimestamp: new Date().toISOString() };

    try {
      const result = await this.proxyLookup<DNSInfo>(domain, 'dns');
      if (result.data && result.provider !== 'none') {
        log.info(`DNS obtido via backend proxy (provedor: ${result.provider})`);
        return result;
      }
    } catch (error) {
      log.warn(`DNS via backend proxy falhou: ${error instanceof Error ? error.message : 'Erro'}`);
    }

    return { data: baseDns, provider: 'none', durationMs: Date.now() - startTime };
  }

  // ==========================================================================
  // WHOIS
  // ==========================================================================

  /**
   * Consulta WHOIS via backend proxy
   */
  async lookupWhois(domain: string): Promise<LookupResult<WHOISInfo>> {
    const startTime = Date.now();
    const baseWhois: WHOISInfo = { domain };

    try {
      const result = await this.proxyLookup<WHOISInfo>(domain, 'whois');
      if (result.data && result.provider !== 'none') {
        log.info(`WHOIS obtido via backend proxy (provedor: ${result.provider})`);
        return result;
      }
    } catch (error) {
      log.warn(`WHOIS via backend proxy falhou: ${error instanceof Error ? error.message : 'Erro'}`);
    }

    return { data: baseWhois, provider: 'none', durationMs: Date.now() - startTime };
  }

  // ==========================================================================
  // SSL
  // ==========================================================================

  /**
   * Consulta SSL via backend proxy
   */
  async lookupSsl(url: string): Promise<LookupResult<SSLCertificateInfo>> {
    const startTime = Date.now();
    const isSecure = url.startsWith('https://');
    const baseSsl: SSLCertificateInfo = { isSecure };

    if (!isSecure) {
      return { data: baseSsl, provider: 'none', durationMs: Date.now() - startTime };
    }

    const hostname = extractHostname(url);

    try {
      const result = await this.proxyLookup<SSLCertificateInfo>(hostname, 'ssl');
      if (result.data && result.provider !== 'none') {
        log.info(`SSL obtido via backend proxy (provedor: ${result.provider})`);
        return result;
      }
    } catch (error) {
      log.warn(`SSL via backend proxy falhou: ${error instanceof Error ? error.message : 'Erro'}`);
    }

    return { data: baseSsl, provider: 'none', durationMs: Date.now() - startTime };
  }

  // ==========================================================================
  // Backend Proxy
  // ==========================================================================

  /**
   * Envia requisição de lookup ao backend proxy.
   *
   * O backend intermedia a chamada a WhoisFreaks/WhoisXML,
   * normaliza os dados e retorna no formato LookupResult<T>.
   *
   * @param domain - Domínio ou hostname para consulta
   * @param lookupType - Tipo de consulta (dns, whois, ssl)
   * @returns Resultado normalizado do backend proxy
   */
  private async proxyLookup<T>(domain: string, lookupType: string): Promise<LookupResult<T>> {
    const startTime = Date.now();
    const proxyUrl = `${this.apiBaseUrl}${DOMAIN_LOOKUP_PROXY_PATH}`;

    const response = await fetch(proxyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain, lookupType }),
      signal: AbortSignal.timeout(this.timeout),
    });

    if (!response.ok) {
      throw new Error(`Backend proxy retornou status ${response.status}`);
    }

    const body = await response.json() as {
      data: T;
      provider: LookupProvider;
      durationMs?: number;
    };

    return {
      data: body.data,
      provider: body.provider ?? 'none',
      durationMs: body.durationMs ?? (Date.now() - startTime),
    };
  }

  /**
   * Retorna a URL completa do backend proxy para testes.
   * Método utilitário que permite verificar que o serviço
   * aponta para o backend correto.
   */
  getProxyUrl(): string {
    return `${this.apiBaseUrl}${DOMAIN_LOOKUP_PROXY_PATH}`;
  }
}

export default DomainLookupService;
