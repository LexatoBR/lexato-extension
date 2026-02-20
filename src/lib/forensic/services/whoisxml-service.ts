/**
 * WhoisXMLService - Cliente para API WhoisXML
 *
 * Fornece acesso a DNS, WHOIS e SSL lookup via WhoisXML API.
 * Usado como fallback quando WhoisFreaks falha ou não está configurado.
 *
 * Documentação: https://whoisxmlapi.com/
 *
 * @module WhoisXMLService
 */

import {
  extractRootDomain as getRootDomain,
  extractHostname as getHostname,
} from '../utils/tld-utils';
import { loggers } from '../../logger';

const log = loggers.forensic.withPrefix('[WhoisXML]');

/** Flag para evitar logs repetidos sobre API key */
let apiKeyWarningLogged = false;

/**
 * Obtém a chave da API WhoisXML da variável de ambiente
 */
function getApiKey(): string {
  const key = import.meta.env['VITE_WHOISXML_API_KEY'] ?? '';

  if (!key && !apiKeyWarningLogged) {
    log.debug('API key não configurada (serviço opcional)');
    apiKeyWarningLogged = true;
  } else if (key && !apiKeyWarningLogged) {
    log.debug('API key encontrada', { preview: `${key.substring(0, 8)}...` });
    apiKeyWarningLogged = true;
  }

  return key;
}

/** Verifica se a API key está configurada */
function hasApiKey(): boolean {
  const key = import.meta.env['VITE_WHOISXML_API_KEY'];
  return typeof key === 'string' && key.length > 0;
}

// ============================================================================
// Interfaces de resposta da API WhoisXML
// ============================================================================

/** Contato WHOIS (WhoisXML) */
export interface WhoisXMLContact {
  name?: string;
  organization?: string;
  street1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  countryCode?: string;
  telephone?: string;
  email?: string;
}

/** Resposta WHOIS da API WhoisXML */
export interface WhoisXMLWhoisResponse {
  WhoisRecord: {
    domainName: string;
    registrarName?: string;
    registrarIANAID?: string;
    whoisServer?: string;
    createdDate?: string;
    updatedDate?: string;
    expiresDate?: string;
    createdDateNormalized?: string;
    updatedDateNormalized?: string;
    expiresDateNormalized?: string;
    registrant?: WhoisXMLContact;
    technicalContact?: WhoisXMLContact;
    administrativeContact?: WhoisXMLContact;
    nameServers?: {
      hostNames?: string[];
      ips?: string[];
    };
    status?: string;
    rawText?: string;
  };
}

/** Registro DNS individual (WhoisXML) */
export interface WhoisXMLDnsRecord {
  type: number;
  dnsType: string;
  name: string;
  ttl: number;
  rRsetType: number;
  rawText: string;
  address?: string;
  strings?: string[];
  target?: string;
  priority?: number;
}

/** Resposta DNS da API WhoisXML */
export interface WhoisXMLDnsResponse {
  DNSData: {
    domainName: string;
    dnsTypes: string;
    audit?: { createdDate: string; updatedDate: string };
    dnsRecords?: WhoisXMLDnsRecord[];
  };
}

/** Certificado SSL individual (WhoisXML) */
export interface WhoisXMLSslCertificate {
  chainHierarchy: 'end-user' | 'intermediate' | 'root';
  validationType: string;
  validFrom: string;
  validTo: string;
  serialNumber: string;
  signatureAlgorithm: string;
  subject: { commonName?: string; organization?: string; country?: string };
  issuer: { commonName?: string; organization?: string; country?: string };
  publicKey: { type: string; bits: number; pem?: string };
  extensions?: {
    authorityKeyIdentifier?: string;
    subjectKeyIdentifier?: string;
    keyUsage?: string[];
    extendedKeyUsage?: string[];
    crlDistributionPoints?: string[];
    authorityInfoAccess?: { issuers?: string[]; ocsp?: string[] };
    subjectAlternativeNames?: { dnsNames?: string[] };
    certificatePolicies?: Array<{ policyIdentifier: string }>;
  };
  pem?: string;
}

/** Resposta SSL da API WhoisXML */
export interface WhoisXMLSslResponse {
  auditCreated?: string;
  domain: string;
  ip?: string;
  port?: number;
  certificates?: WhoisXMLSslCertificate[];
}

// ============================================================================
// URLs base da API
// ============================================================================

const WHOIS_API_URL = 'https://www.whoisxmlapi.com/whoisserver/WhoisService';
const DNS_API_URL = 'https://www.whoisxmlapi.com/whoisserver/DNSService';
const SSL_API_URL = 'https://ssl-certificates.whoisxmlapi.com/api/v1';

// ============================================================================
// Serviço principal
// ============================================================================

/**
 * Serviço para consultas à API WhoisXML
 *
 * Fornece acesso a DNS, WHOIS e SSL lookup.
 * A chave da API deve ser configurada via VITE_WHOISXML_API_KEY.
 */
export class WhoisXMLService {
  private apiKey: string;
  private timeout: number;

  constructor(apiKey?: string, timeout = 30000) {
    this.apiKey = apiKey ?? getApiKey();
    this.timeout = timeout;
    log.debug('Serviço inicializado', { hasApiKey: !!this.apiKey, timeout });
  }

  /**
   * Consulta WHOIS de um domínio
   */
  async lookupWhois(domain: string): Promise<WhoisXMLWhoisResponse | null> {
    if (!this.apiKey) return null;

    const rootDomain = getRootDomain(domain);
    const url = `${WHOIS_API_URL}?apiKey=${this.apiKey}&domainName=${encodeURIComponent(rootDomain)}&outputFormat=JSON`;
    log.info(`lookupWhois() - Domínio: ${rootDomain}`);

    try {
      const startTime = Date.now();
      const response = await fetch(url, { signal: AbortSignal.timeout(this.timeout) });
      const elapsed = Date.now() - startTime;
      log.info(`lookupWhois() - Resposta em ${elapsed}ms, status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'N/A');
        log.error(`lookupWhois() - ERRO HTTP ${response.status}: ${errorText}`);
        return null;
      }

      const data = await response.json();
      log.info('lookupWhois() - Dados recebidos', {
        domain: data?.WhoisRecord?.domainName,
        hasRegistrar: !!data?.WhoisRecord?.registrarName,
        hasNameServers: !!data?.WhoisRecord?.nameServers?.hostNames?.length,
      });

      return data;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`lookupWhois() - EXCEÇÃO: ${errorMsg}`);
      return null;
    }
  }

  /**
   * Consulta DNS de um domínio
   */
  async lookupDns(domain: string, types = '_all'): Promise<WhoisXMLDnsResponse | null> {
    if (!this.apiKey) return null;

    const hostname = getHostname(domain);
    const url = `${DNS_API_URL}?apiKey=${this.apiKey}&domainName=${encodeURIComponent(hostname)}&type=${types}&outputFormat=JSON`;
    log.info(`lookupDns() - Hostname: ${hostname}`);

    try {
      const startTime = Date.now();
      const response = await fetch(url, { signal: AbortSignal.timeout(this.timeout) });
      const elapsed = Date.now() - startTime;
      log.info(`lookupDns() - Resposta em ${elapsed}ms, status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'N/A');
        log.error(`lookupDns() - ERRO HTTP ${response.status}: ${errorText}`);
        return null;
      }

      const data = await response.json();
      log.info('lookupDns() - Dados recebidos', {
        domain: data?.DNSData?.domainName,
        totalRecords: data?.DNSData?.dnsRecords?.length ?? 0,
      });

      return data;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`lookupDns() - EXCEÇÃO: ${errorMsg}`);
      return null;
    }
  }

  /**
   * Consulta certificado SSL de um domínio
   */
  async lookupSsl(domain: string): Promise<WhoisXMLSslResponse | null> {
    if (!this.apiKey) return null;

    const hostname = getHostname(domain);
    const url = `${SSL_API_URL}?apiKey=${this.apiKey}&domainName=${encodeURIComponent(hostname)}`;
    log.info(`lookupSsl() - Hostname: ${hostname}`);

    try {
      const startTime = Date.now();
      const response = await fetch(url, { signal: AbortSignal.timeout(this.timeout) });
      const elapsed = Date.now() - startTime;
      log.info(`lookupSsl() - Resposta em ${elapsed}ms, status: ${response.status}`);

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'N/A');
        log.error(`lookupSsl() - ERRO HTTP ${response.status}: ${errorText}`);
        return null;
      }

      const data = await response.json();
      log.info('lookupSsl() - Dados recebidos', {
        domain: data?.domain,
        totalCertificates: data?.certificates?.length ?? 0,
      });

      return data;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`lookupSsl() - EXCEÇÃO: ${errorMsg}`);
      return null;
    }
  }

  /** Verifica se o serviço está configurado */
  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }
}

export default WhoisXMLService;
export { hasApiKey };
