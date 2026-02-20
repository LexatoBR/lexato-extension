/**
 * WhoisFreaksService - Cliente para API WhoisFreaks
 *
 * Fornece acesso a DNS, WHOIS e SSL lookup via WhoisFreaks API.
 * Documentação: https://whoisfreaks.com/products/
 *
 * @module WhoisFreaksService
 */

import {
  extractRootDomain as getRootDomain,
  extractHostname as getHostname,
} from '../utils/tld-utils';
import { loggers } from '../../logger';

// Re-exporta utilitários para compatibilidade
export { extractRootDomain, extractHostname } from '../utils/tld-utils';

const log = loggers.forensic.withPrefix('[WhoisFreaks]');

/**
 * Flag para evitar logs repetidos sobre API key não configurada
 * WhoisFreaks é um serviço OPCIONAL - não deve poluir o console
 */
let apiKeyWarningLogged = false;

/**
 * Obtém a chave da API WhoisFreaks da variável de ambiente
 * @returns Chave da API ou string vazia se não configurada
 */
function getApiKey(): string {
  const key = import.meta.env['VITE_WHOISFREAKS_API_KEY'] ?? '';

  if (!key && !apiKeyWarningLogged) {
    // Log apenas uma vez como debug (não erro) - serviço é opcional
    log.debug('API key não configurada (serviço opcional) - metadados DNS/WHOIS/SSL não serão coletados');
    apiKeyWarningLogged = true;
  } else if (key && !apiKeyWarningLogged) {
    log.debug('API key encontrada', {
      preview: `${key.substring(0, 8)}...`
    });
    apiKeyWarningLogged = true;
  }

  return key;
}

/**
 * Verifica se a API key está configurada
 * Não loga erro - serviço é opcional
 */
function hasApiKey(): boolean {
  const key = import.meta.env['VITE_WHOISFREAKS_API_KEY'];
  return typeof key === 'string' && key.length > 0;
}

/** URLs base da API */
const API_BASE = 'https://api.whoisfreaks.com';

/** Contato WHOIS */
export interface WhoisContact {
  name?: string;
  organization?: string;
  country_name?: string;
  country_code?: string;
  email_address?: string;
  phone?: string;
  fax?: string;
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
}

/** Resposta WHOIS da API */
export interface WhoisApiResponse {
  status: boolean;
  domain_name: string;
  query_time: string;
  whois_server?: string;
  domain_registered: 'yes' | 'no';
  create_date?: string;
  update_date?: string;
  expiry_date?: string;
  domain_registrar?: {
    registrar_name?: string;
    whois_server?: string;
    referral_url?: string;
    iana_id?: string;
  };
  registrant_contact?: WhoisContact;
  administrative_contact?: WhoisContact;
  technical_contact?: WhoisContact;
  billing_contact?: WhoisContact;
  name_servers?: string[];
  domain_status?: string[];
  whois_raw_domain?: string;
  dnssec?: string;
}

/** Registro DNS individual */
export interface DnsRecord {
  name: string;
  type: number;
  dnsType: string;
  ttl: number;
  rawText: string;
  rRsetType: number;
  address?: string;
  singleName?: string;
  target?: string;
  priority?: number;
  strings?: string[];
  admin?: string;
  host?: string;
  expire?: number;
  minimum?: number;
  refresh?: number;
  retry?: number;
  serial?: number;
}

/** Resposta DNS da API */
export interface DnsApiResponse {
  status: boolean;
  queryTime: string;
  domainName: string;
  domainRegistered: boolean;
  dnsTypes?: Record<string, number>;
  dnsRecords?: DnsRecord[];
}

/** Extensões do certificado SSL */
export interface SslExtensions {
  authorityKeyIdentifier?: string;
  subjectKeyIdentifier?: string;
  keyUsages?: string[];
  extendedKeyUsages?: string[];
  crlDistributionPoints?: string[];
  authorityInfoAccess?: { issuers?: string[] };
  subjectAlternativeNames?: { dnsNames?: string[] };
  certificatePolicies?: Array<{ policyId: string }>;
}

/** Certificado SSL individual */
export interface SslCertificate {
  chainOrder: 'end-user' | 'intermediate' | 'root';
  authenticationType: string;
  validityStartDate: string;
  validityEndDate: string;
  serialNumber: string;
  signatureAlgorithm: string;
  subject: { commonName?: string; organization?: string; country?: string };
  issuer: { commonName?: string; organization?: string; country?: string };
  publicKey: { keySize: string; keyAlgorithm: string; pemRaw?: string };
  extensions?: SslExtensions;
  pemRaw?: string;
}

/** Resposta SSL da API */
export interface SslApiResponse {
  domainName: string;
  queryTime: string;
  sslCertificates?: SslCertificate[];
}

/**
 * Serviço para consultas à API WhoisFreaks
 * 
 * Fornece acesso a DNS, WHOIS e SSL lookup via WhoisFreaks API.
 * A chave da API deve ser configurada via variável de ambiente VITE_WHOISFREAKS_API_KEY.
 */
export class WhoisFreaksService {
  private apiKey: string;
  private timeout: number;

  /**
   * Cria instância do serviço WhoisFreaks
   * @param apiKey - Chave da API (usa variável de ambiente se não fornecida)
   * @param timeout - Timeout em ms para requisições (padrão: 30000)
   */
  constructor(apiKey?: string, timeout = 30000) {
    this.apiKey = apiKey ?? getApiKey();
    this.timeout = timeout;

    log.debug('Serviço inicializado', {
      hasApiKey: !!this.apiKey,
      timeout
    });
  }

  /**
   * Consulta WHOIS de um domínio
   * @param domain - Domínio para consulta (será extraído o domínio raiz)
   */
  async lookupWhois(domain: string): Promise<WhoisApiResponse | null> {
    // Serviço opcional - retorna null silenciosamente se não configurado
    if (!this.apiKey) {
      return null;
    }

    const rootDomain = getRootDomain(domain);
    log.info('lookupWhois() - Domínio raiz extraído', { rootDomain });
    
    const url = `${API_BASE}/v1.0/whois?apiKey=${this.apiKey}&whois=live&domainName=${encodeURIComponent(rootDomain)}`;
    
    try {
      const startTime = Date.now();
      const response = await fetch(url, { signal: AbortSignal.timeout(this.timeout) });
      const elapsed = Date.now() - startTime;
      
      log.info('lookupWhois() - Resposta recebida', { elapsed, status: response.status });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'N/A');
        log.error('lookupWhois() - Erro HTTP', { status: response.status, body: errorText });
        return null;
      }
      
      const data = await response.json();
      log.info('lookupWhois() - Dados recebidos', {
        status: data?.status,
        domain_name: data?.domain_name,
        domain_registered: data?.domain_registered,
        hasRegistrar: !!data?.domain_registrar,
        hasNameServers: !!data?.name_servers?.length,
      });
      
      return data;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error('lookupWhois() - Exceção', { error: errorMsg });
      return null;
    }
  }

  /**
   * Consulta DNS de um domínio
   * @param domain - Domínio para consulta
   * @param types - Tipos de registro (default: all)
   */
  async lookupDns(domain: string, types = 'all'): Promise<DnsApiResponse | null> {
    // Serviço opcional - retorna null silenciosamente se não configurado
    if (!this.apiKey) {
      return null;
    }

    const hostname = getHostname(domain);
    log.info('lookupDns() - Hostname extraído', { hostname });
    
    const url = `${API_BASE}/v2.0/dns/live?apiKey=${this.apiKey}&domainName=${encodeURIComponent(hostname)}&type=${types}`;
    
    try {
      const startTime = Date.now();
      const response = await fetch(url, { signal: AbortSignal.timeout(this.timeout) });
      const elapsed = Date.now() - startTime;
      
      log.info('lookupDns() - Resposta recebida', { elapsed, status: response.status });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'N/A');
        log.error('lookupDns() - Erro HTTP', { status: response.status, body: errorText });
        return null;
      }
      
      const data = await response.json();
      
      // Resumo dos registros DNS
      const recordTypes: Record<string, number> = {};
      if (data?.dnsRecords) {
        for (const record of data.dnsRecords) {
          recordTypes[record.dnsType] = (recordTypes[record.dnsType] ?? 0) + 1;
        }
      }
      
      log.info('lookupDns() - Dados recebidos', {
        status: data?.status,
        domainName: data?.domainName,
        domainRegistered: data?.domainRegistered,
        totalRecords: data?.dnsRecords?.length ?? 0,
        recordTypes,
      });
      
      return data;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error('lookupDns() - Exceção', { error: errorMsg });
      return null;
    }
  }

  /**
   * Consulta certificado SSL de um domínio
   * @param domain - Domínio para consulta
   * @param includeChain - Se deve incluir cadeia completa de certificados
   */
  async lookupSsl(domain: string, includeChain = true): Promise<SslApiResponse | null> {
    // Serviço opcional - retorna null silenciosamente se não configurado
    if (!this.apiKey) {
      return null;
    }

    const hostname = getHostname(domain);
    log.info('lookupSsl() - Hostname extraído', { hostname });
    
    const url = `${API_BASE}/v1.0/ssl/live?apiKey=${this.apiKey}&domainName=${encodeURIComponent(hostname)}&chain=${includeChain}`;
    
    try {
      const startTime = Date.now();
      const response = await fetch(url, { signal: AbortSignal.timeout(this.timeout) });
      const elapsed = Date.now() - startTime;
      
      log.info('lookupSsl() - Resposta recebida', { elapsed, status: response.status });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'N/A');
        log.error('lookupSsl() - Erro HTTP', { status: response.status, body: errorText });
        return null;
      }
      
      const data = await response.json();
      
      // Resumo dos certificados
      const certSummary = data?.sslCertificates?.map((cert: SslCertificate) => ({
        chainOrder: cert.chainOrder,
        subject: cert.subject?.commonName,
        issuer: cert.issuer?.commonName,
        validFrom: cert.validityStartDate,
        validTo: cert.validityEndDate,
        keySize: cert.publicKey?.keySize,
      })) ?? [];
      
      log.info('lookupSsl() - Dados recebidos', {
        domainName: data?.domainName,
        totalCertificates: data?.sslCertificates?.length ?? 0,
        certificates: certSummary,
      });
      
      return data;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error('lookupSsl() - Exceção', { error: errorMsg });
      return null;
    }
  }

  /**
   * Verifica se o serviço está configurado com API key
   */
  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }
}


export default WhoisFreaksService;

/** Verifica se a API WhoisFreaks está configurada */
export { hasApiKey };
