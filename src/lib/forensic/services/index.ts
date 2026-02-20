/**
 * Exportações dos serviços forenses
 * @module ForensicServices
 */

export {
  WhoisFreaksService,
  extractRootDomain,
  extractHostname,
  type WhoisApiResponse,
  type WhoisContact,
  type DnsApiResponse,
  type DnsRecord,
  type SslApiResponse,
  type SslCertificate,
  type SslExtensions,
} from './whoisfreaks-service';

export {
  WhoisXMLService,
  type WhoisXMLWhoisResponse,
  type WhoisXMLDnsResponse,
  type WhoisXMLSslResponse,
  type WhoisXMLSslCertificate,
} from './whoisxml-service';

export {
  DomainLookupService,
  DOMAIN_LOOKUP_PROXY_PATH,
  type LookupProvider,
  type LookupResult,
} from './domain-lookup-service';
