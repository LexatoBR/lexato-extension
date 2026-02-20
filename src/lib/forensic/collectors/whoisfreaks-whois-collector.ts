/**
 * WhoisFreaksWHOISCollector - Coleta WHOIS via WhoisFreaks API
 *
 * Fornece dados WHOIS completos incluindo registrante, datas e nameservers.
 * Trata corretamente domínios brasileiros (.com.br, .adv.br, etc.)
 *
 * @module WhoisFreaksWHOISCollector
 */

import { AuditLogger } from '../../audit-logger';
import { BaseCollector } from './base-collector';
import { WhoisFreaksService, extractRootDomain } from '../services/whoisfreaks-service';
import type { WHOISInfo } from '../../../types/forensic-metadata.types';

/**
 * Coletor de WHOIS usando WhoisFreaks API
 */
export class WhoisFreaksWHOISCollector extends BaseCollector<WHOISInfo> {
  private domain: string;
  private service: WhoisFreaksService;

  constructor(logger: AuditLogger, domain: string, timeout = 10000) {
    super(logger, 'whoisfreaks-whois', timeout);
    this.domain = extractRootDomain(domain);
    this.service = new WhoisFreaksService(undefined, timeout);
  }

  protected async doCollect(): Promise<WHOISInfo> {
    const whois: WHOISInfo = {
      domain: this.domain,
    };

    const response = await this.service.lookupWhois(this.domain);

    if (!response?.status) {
      return whois;
    }

    // Dados do registrar
    if (response.domain_registrar?.registrar_name) {
      whois.registrar = response.domain_registrar.registrar_name;
    }
    if (response.domain_registrar?.referral_url) {
      whois.registrarUrl = response.domain_registrar.referral_url;
    }

    // Datas
    if (response.create_date) {
      whois.creationDate = response.create_date;
    }
    if (response.update_date) {
      whois.updatedDate = response.update_date;
    }
    if (response.expiry_date) {
      whois.expirationDate = response.expiry_date;
    }

    // Status do domínio
    if (response.domain_status && response.domain_status.length > 0) {
      whois.status = response.domain_status;
    }

    // Dados do registrante
    if (response.registrant_contact) {
      const reg = response.registrant_contact;
      if (reg.organization) {
        whois.registrantOrganization = reg.organization;
      } else if (reg.name) {
        whois.registrantOrganization = reg.name;
      }
      if (reg.country_name) {
        whois.registrantCountry = reg.country_name;
      } else if (reg.country_code) {
        whois.registrantCountry = reg.country_code;
      }
    }

    // Nameservers
    if (response.name_servers && response.name_servers.length > 0) {
      whois.nameServers = response.name_servers.map((ns) => ns.toLowerCase());
    }

    // DNSSEC
    if (response.dnssec) {
      whois.dnssec = response.dnssec.toLowerCase() === 'signed' ||
                     response.dnssec.toLowerCase() === 'yes' ||
                     response.dnssec.toLowerCase() === 'true';
    }

    return whois;
  }
}

export default WhoisFreaksWHOISCollector;
