/**
 * WaybackCollector - Coleta dados do Wayback Machine
 *
 * @module WaybackCollector
 */

import { AuditLogger } from '../../audit-logger';
import { BaseCollector } from './base-collector';
import type { WaybackMachineInfo } from '../../../types/forensic-metadata.types';

const WAYBACK_API = 'https://archive.org/wayback/available';

/**
 * Coletor de informações do Internet Archive (Wayback Machine)
 */
export class WaybackCollector extends BaseCollector<WaybackMachineInfo> {
  private url: string;

  constructor(logger: AuditLogger, url: string, timeout = 5000) {
    super(logger, 'wayback', timeout);
    this.url = url;
  }

  protected async doCollect(): Promise<WaybackMachineInfo> {
    const info: WaybackMachineInfo = {
      url: this.url,
      archived: false,
      queryTimestamp: new Date().toISOString(),
    };

    try {
      const res = await fetch(
        `${WAYBACK_API}?url=${encodeURIComponent(this.url)}`,
        { signal: AbortSignal.timeout(this.timeout - 1000) }
      );

      if (!res.ok) {
        return info;
      }

      const data = await res.json();

      if (data.archived_snapshots?.closest) {
        const snapshot = data.archived_snapshots.closest;
        info.archived = true;
        info.latestSnapshotUrl = snapshot.url;
        info.latestSnapshotDate = this.formatWaybackDate(snapshot.timestamp);
      }
    } catch {
      // Silencioso - Wayback é opcional
    }

    return info;
  }

  /**
   * Formata timestamp do Wayback Machine (YYYYMMDDHHmmss) para ISO
   */
  private formatWaybackDate(timestamp: string): string {
    if (!timestamp || timestamp.length < 14) {
      return timestamp;
    }

    try {
      const year = timestamp.slice(0, 4);
      const month = timestamp.slice(4, 6);
      const day = timestamp.slice(6, 8);
      const hour = timestamp.slice(8, 10);
      const minute = timestamp.slice(10, 12);
      const second = timestamp.slice(12, 14);

      return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
    } catch {
      return timestamp;
    }
  }
}

export default WaybackCollector;
