/**
 * WhoisFreaksSSLCollector - Coleta SSL via WhoisFreaks API
 *
 * Fornece dados completos do certificado SSL incluindo cadeia de certificação.
 *
 * @module WhoisFreaksSSLCollector
 */

import { AuditLogger } from '../../audit-logger';
import { BaseCollector } from './base-collector';
import { WhoisFreaksService, extractHostname } from '../services/whoisfreaks-service';
import type { SSLCertificateInfo } from '../../../types/forensic-metadata.types';

/**
 * Coletor de SSL usando WhoisFreaks API
 */
export class WhoisFreaksSSLCollector extends BaseCollector<SSLCertificateInfo> {
  private url: string;
  private service: WhoisFreaksService;

  constructor(logger: AuditLogger, url: string, timeout = 10000) {
    super(logger, 'whoisfreaks-ssl', timeout);
    this.url = url;
    this.service = new WhoisFreaksService(undefined, timeout);
  }

  protected async doCollect(): Promise<SSLCertificateInfo> {
    const hostname = extractHostname(this.url);
    const isSecure = this.url.startsWith('https://');

    const ssl: SSLCertificateInfo = {
      isSecure,
    };

    // Site nao e HTTPS - retorna apenas isSecure: false
    if (!isSecure) {
      return ssl;
    }

    // Verifica se API esta configurada (servico opcional)
    if (!this.service.isConfigured()) {
      return ssl;
    }
    
    let response;
    try {
      response = await this.service.lookupSsl(hostname, true);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      throw new Error(`Falha na consulta SSL: ${errorMsg}`);
    }

    if (!response) {
      throw new Error('Resposta nula da API WhoisFreaks');
    }

    if (!response.sslCertificates || response.sslCertificates.length === 0) {
      throw new Error('Nenhum certificado SSL encontrado');
    }

    // Pega o certificado end-user (primeiro da cadeia)
    const endUserCert = response.sslCertificates.find(
      (cert) => cert.chainOrder === 'end-user'
    ) ?? response.sslCertificates[0];

    // Retorna SSL basico se nao encontrou certificado
    if (!endUserCert) {
      return ssl;
    }

    // Protocolo
    ssl.protocol = 'TLS';

    // Emissor
    if (endUserCert.issuer) {
      if (endUserCert.issuer.commonName) {
        ssl.issuer = endUserCert.issuer.commonName;
      }
      if (endUserCert.issuer.organization) {
        ssl.issuerOrganization = endUserCert.issuer.organization;
      }
    }

    // Sujeito
    if (endUserCert.subject?.commonName) {
      ssl.subject = endUserCert.subject.commonName;
    }

    // Datas de validade
    if (endUserCert.validityStartDate) {
      ssl.validFrom = endUserCert.validityStartDate;
    }
    if (endUserCert.validityEndDate) {
      ssl.validTo = endUserCert.validityEndDate;

      // Calcula dias ate expiracao
      const expiryDate = this.parseDate(endUserCert.validityEndDate);
      if (expiryDate) {
        const now = new Date();
        const diffMs = expiryDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        ssl.daysUntilExpiration = diffDays;
        ssl.isValid = diffDays > 0;
      }
    }

    // Algoritmo de assinatura
    if (endUserCert.signatureAlgorithm) {
      ssl.signatureAlgorithm = endUserCert.signatureAlgorithm;
    }

    // Tamanho da chave
    if (endUserCert.publicKey?.keySize) {
      const keySize = parseInt(endUserCert.publicKey.keySize, 10);
      if (!isNaN(keySize)) {
        ssl.keySize = keySize;
      }
    }

    // Serial number como fingerprint
    if (endUserCert.serialNumber) {
      ssl.fingerprint = endUserCert.serialNumber;
    }

    // Subject Alternative Names
    if (endUserCert.extensions?.subjectAlternativeNames?.dnsNames) {
      ssl.subjectAltNames = endUserCert.extensions.subjectAlternativeNames.dnsNames;
    }

    return ssl;
  }

  /**
   * Parseia data no formato da API WhoisFreaks
   * Formato: "2025-11-28 12:47:42 UTC"
   */
  private parseDate(dateStr: string): Date | null {
    try {
      const normalized = dateStr.replace(' UTC', 'Z').replace(' ', 'T');
      return new Date(normalized);
    } catch {
      return null;
    }
  }
}

export default WhoisFreaksSSLCollector;
