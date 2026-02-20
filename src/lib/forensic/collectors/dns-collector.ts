/**
 * DNSCollector - Coleta dados de DNS do domínio
 *
 * @module DNSCollector
 */

import { AuditLogger } from '../../audit-logger';
import { BaseCollector } from './base-collector';
import type { DNSInfo } from '../../../types/forensic-metadata.types';

const GOOGLE_DNS_API = 'https://dns.google/resolve';
const CLOUDFLARE_DNS_API = 'https://cloudflare-dns.com/dns-query';

/**
 * Coletor de informações DNS do domínio
 */
export class DNSCollector extends BaseCollector<DNSInfo> {
  private domain: string;

  constructor(logger: AuditLogger, domain: string, timeout = 5000) {
    super(logger, 'dns', timeout);
    this.domain = domain;
  }

  protected async doCollect(): Promise<DNSInfo> {
    const dns: DNSInfo = {
      domain: this.domain,
      queryTimestamp: new Date().toISOString(),
    };

    // Coleta registros A (IPv4)
    await this.collectARecords(dns);

    // Coleta registros AAAA (IPv6)
    await this.collectAAAARecords(dns);

    // Coleta registros MX (email)
    await this.collectMXRecords(dns);

    // Coleta registros NS (nameservers)
    await this.collectNSRecords(dns);

    // Coleta registros TXT
    await this.collectTXTRecords(dns);

    return dns;
  }

  /**
   * Coleta registros A (IPv4)
   */
  private async collectARecords(dns: DNSInfo): Promise<void> {
    try {
      const data = await this.queryDNS(this.domain, 'A');
      if (data?.Answer) {
        dns.aRecords = data.Answer
          .filter((r: { type: number }) => r.type === 1)
          .map((r: { data: string }) => r.data);

        const first = data.Answer[0] as { TTL?: number } | undefined;
        if (first && typeof first.TTL === 'number') {
          dns.ttl = first.TTL;
        }
      }
    } catch {
      // Silencioso
    }
  }

  /**
   * Coleta registros AAAA (IPv6)
   */
  private async collectAAAARecords(dns: DNSInfo): Promise<void> {
    try {
      const data = await this.queryDNS(this.domain, 'AAAA');
      if (data?.Answer) {
        dns.aaaaRecords = data.Answer
          .filter((r: { type: number }) => r.type === 28)
          .map((r: { data: string }) => r.data);
      }
    } catch {
      // Silencioso
    }
  }

  /**
   * Coleta registros MX (email)
   */
  private async collectMXRecords(dns: DNSInfo): Promise<void> {
    try {
      const data = await this.queryDNS(this.domain, 'MX');
      if (data?.Answer) {
        dns.mxRecords = data.Answer
          .filter((r: { type: number }) => r.type === 15)
          .map((r: { data: string }) => r.data.replace(/^\d+\s+/, '').replace(/\.$/, ''));
      }
    } catch {
      // Silencioso
    }
  }

  /**
   * Coleta registros NS (nameservers)
   */
  private async collectNSRecords(dns: DNSInfo): Promise<void> {
    try {
      const data = await this.queryDNS(this.domain, 'NS');
      if (data?.Answer) {
        dns.nsRecords = data.Answer
          .filter((r: { type: number }) => r.type === 2)
          .map((r: { data: string }) => r.data.replace(/\.$/, ''));
      }
    } catch {
      // Silencioso
    }
  }

  /**
   * Coleta registros TXT
   */
  private async collectTXTRecords(dns: DNSInfo): Promise<void> {
    try {
      const data = await this.queryDNS(this.domain, 'TXT');
      if (data?.Answer) {
        dns.txtRecords = data.Answer
          .filter((r: { type: number }) => r.type === 16)
          .map((r: { data: string }) => r.data.replace(/^"|"$/g, ''));
      }
    } catch {
      // Silencioso
    }
  }

  /**
   * Executa consulta DNS via API
   */
  private async queryDNS(domain: string, type: string): Promise<{ Answer?: Array<{ type: number; data: string; TTL?: number }> } | null> {
    // Tenta Google DNS primeiro
    try {
      const res = await fetch(`${GOOGLE_DNS_API}?name=${domain}&type=${type}`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Tenta Cloudflare como fallback
    }

    try {
      const res = await fetch(`${CLOUDFLARE_DNS_API}?name=${domain}&type=${type}`, {
        headers: { Accept: 'application/dns-json' },
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Silencioso
    }

    return null;
  }
}

export default DNSCollector;
