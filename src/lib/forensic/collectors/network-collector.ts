/**
 * NetworkCollector - Coleta dados de rede e IP
 *
 * @module NetworkCollector
 */

import { AuditLogger } from '../../audit-logger';
import { BaseCollector } from './base-collector';
import type { NetworkInfo } from '../../../types/forensic-metadata.types';

interface NetworkInformation {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  type?: string;
}

type EffectiveType = '4g' | '3g' | '2g' | 'slow-2g';

const IP_INFO_API = 'https://ipinfo.io/json';
const IP_API_FALLBACK = 'https://ip-api.com/json';

/**
 * Coletor de informações de rede e IP público
 */
export class NetworkCollector extends BaseCollector<NetworkInfo> {
  constructor(logger: AuditLogger, timeout = 5000) {
    super(logger, 'network', timeout);
  }

  protected async doCollect(): Promise<NetworkInfo> {
    const info: NetworkInfo = {};

    // Coleta informações da Network Information API
    this.collectConnectionInfo(info);

    // Coleta IP público e dados de geolocalização por IP
    await this.collectPublicIpInfo(info);

    return info;
  }

  /**
   * Coleta informações da Network Information API do navegador
   */
  private collectConnectionInfo(info: NetworkInfo): void {
    const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;

    if (!conn) {
      return;
    }

    const et = conn.effectiveType as EffectiveType | undefined;
    if (et === '4g' || et === '3g' || et === '2g' || et === 'slow-2g') {
      info.effectiveType = et;
    }

    if (typeof conn.downlink === 'number') {
      info.downlink = conn.downlink;
    }
    if (typeof conn.rtt === 'number') {
      info.rtt = conn.rtt;
    }
    if (typeof conn.saveData === 'boolean') {
      info.saveData = conn.saveData;
    }

    // Tipo de conexão (wifi, cellular, etc.)
    if (conn.type) {
      const connectionTypes: Record<string, NetworkInfo['connectionType']> = {
        wifi: 'wifi',
        cellular: 'cellular',
        ethernet: 'ethernet',
        bluetooth: 'bluetooth',
      };
      info.connectionType = connectionTypes[conn.type] ?? 'unknown';
    }
  }

  /**
   * Coleta IP público e informações de geolocalização via API externa
   */
  private async collectPublicIpInfo(info: NetworkInfo): Promise<void> {
    try {
      // Tenta ipinfo.io primeiro
      const res = await fetch(IP_INFO_API, {
        signal: AbortSignal.timeout(this.timeout - 1000),
      });

      if (res.ok) {
        const data = await res.json();
        this.parseIpInfoResponse(data, info);
        return;
      }
    } catch {
      // Tenta fallback
    }

    try {
      // Fallback para ip-api.com
      const res = await fetch(IP_API_FALLBACK, {
        signal: AbortSignal.timeout(this.timeout - 1000),
      });

      if (res.ok) {
        const data = await res.json();
        this.parseIpApiResponse(data, info);
      }
    } catch {
      // Silencioso - IP info é opcional
    }
  }

  /**
   * Parseia resposta do ipinfo.io
   */
  private parseIpInfoResponse(data: Record<string, unknown>, info: NetworkInfo): void {
    const ip = data['ip'];
    if (typeof ip === 'string') {
      info.publicIp = ip;
    }
    const city = data['city'];
    if (typeof city === 'string') {
      info.city = city;
    }
    const region = data['region'];
    if (typeof region === 'string') {
      info.region = region;
    }
    const country = data['country'];
    if (typeof country === 'string') {
      info.country = country;
      info.countryCode = country;
    }
    const timezone = data['timezone'];
    if (typeof timezone === 'string') {
      info.timezone = timezone;
    }
    const org = data['org'];
    if (typeof org === 'string') {
      info.organization = org;
      // Extrai ASN do formato "AS12345 Organization Name"
      const asnMatch = org.match(/^(AS\d+)/);
      if (asnMatch?.[1]) {
        info.asn = asnMatch[1];
      }
      // Extrai ISP (parte após o ASN)
      const ispMatch = org.match(/^AS\d+\s+(.+)$/);
      if (ispMatch?.[1]) {
        info.isp = ispMatch[1];
      }
    }
  }

  /**
   * Parseia resposta do ip-api.com (fallback)
   */
  private parseIpApiResponse(data: Record<string, unknown>, info: NetworkInfo): void {
    const query = data['query'];
    if (typeof query === 'string') {
      info.publicIp = query;
    }
    const city = data['city'];
    if (typeof city === 'string') {
      info.city = city;
    }
    const regionName = data['regionName'];
    if (typeof regionName === 'string') {
      info.region = regionName;
    }
    const country = data['country'];
    if (typeof country === 'string') {
      info.country = country;
    }
    const countryCode = data['countryCode'];
    if (typeof countryCode === 'string') {
      info.countryCode = countryCode;
    }
    const timezone = data['timezone'];
    if (typeof timezone === 'string') {
      info.timezone = timezone;
    }
    const isp = data['isp'];
    if (typeof isp === 'string') {
      info.isp = isp;
    }
    const org = data['org'];
    if (typeof org === 'string') {
      info.organization = org;
    }
    const asValue = data['as'];
    if (typeof asValue === 'string') {
      const asnMatch = asValue.match(/^(AS\d+)/);
      if (asnMatch?.[1]) {
        info.asn = asnMatch[1];
      }
    }
  }
}

export default NetworkCollector;
