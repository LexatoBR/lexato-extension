/**
 * WhoisFreaksDNSCollector - Coleta DNS via WhoisFreaks API
 *
 * Fornece dados DNS mais completos e confiáveis que APIs públicas gratuitas.
 *
 * @module WhoisFreaksDNSCollector
 */

import { AuditLogger } from '../../audit-logger';
import { BaseCollector } from './base-collector';
import { WhoisFreaksService, extractHostname } from '../services/whoisfreaks-service';
import type { DNSInfo } from '../../../types/forensic-metadata.types';

/**
 * Coletor de DNS usando WhoisFreaks API
 */
export class WhoisFreaksDNSCollector extends BaseCollector<DNSInfo> {
  private domain: string;
  private service: WhoisFreaksService;

  constructor(logger: AuditLogger, domain: string, timeout = 10000) {
    super(logger, 'whoisfreaks-dns', timeout);
    this.domain = extractHostname(domain);
    this.service = new WhoisFreaksService(undefined, timeout);
  }

  protected async doCollect(): Promise<DNSInfo> {
    const dns: DNSInfo = {
      domain: this.domain,
      queryTimestamp: new Date().toISOString(),
    };

    // Verifica se API esta configurada (servico opcional)
    if (!this.service.isConfigured()) {
      return dns;
    }
    
    let response;
    try {
      response = await this.service.lookupDns(this.domain);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Erro desconhecido';
      throw new Error(`Falha na consulta DNS: ${errorMsg}`);
    }

    if (!response) {
      throw new Error('Resposta nula da API WhoisFreaks');
    }

    if (!response.dnsRecords || response.dnsRecords.length === 0) {
      return dns;
    }

    // Processa registros por tipo
    const aRecords: string[] = [];
    const aaaaRecords: string[] = [];
    const mxRecords: string[] = [];
    const nsRecords: string[] = [];
    const txtRecords: string[] = [];
    const cnameRecords: string[] = [];
    let ttl: number | undefined;

    for (const record of response.dnsRecords) {
      // Captura TTL do primeiro registro
      if (ttl === undefined && record.ttl > 0) {
        ttl = record.ttl;
      }

      switch (record.dnsType) {
        case 'A':
          if (record.address) {
            aRecords.push(record.address);
          }
          break;

        case 'AAAA':
          if (record.address) {
            aaaaRecords.push(record.address);
          }
          break;

        case 'MX':
          if (record.target) {
            const target = record.target.replace(/\.$/, '');
            const priority = record.priority ?? 0;
            mxRecords.push(`${priority} ${target}`);
          }
          break;

        case 'NS':
          if (record.singleName) {
            const ns = record.singleName.replace(/\.$/, '');
            nsRecords.push(ns);
          }
          break;

        case 'TXT':
        case 'SPF':
          if (record.strings) {
            txtRecords.push(...record.strings);
          }
          break;

        case 'CNAME':
          if (record.singleName) {
            const cname = record.singleName.replace(/\.$/, '');
            cnameRecords.push(cname);
          }
          break;
          
        default:
          break;
      }
    }

    // Atribui apenas se houver dados
    if (aRecords.length > 0) {
      dns.aRecords = aRecords;
    }
    if (aaaaRecords.length > 0) {
      dns.aaaaRecords = aaaaRecords;
    }
    if (mxRecords.length > 0) {
      dns.mxRecords = mxRecords;
    }
    if (nsRecords.length > 0) {
      dns.nsRecords = nsRecords;
    }
    if (txtRecords.length > 0) {
      dns.txtRecords = txtRecords;
    }
    if (cnameRecords.length > 0) {
      dns.cnameRecords = cnameRecords;
    }
    if (ttl !== undefined) {
      dns.ttl = ttl;
    }

    return dns;
  }
}

export default WhoisFreaksDNSCollector;
