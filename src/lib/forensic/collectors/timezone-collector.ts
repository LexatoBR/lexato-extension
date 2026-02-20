/**
 * TimezoneCollector - Coleta evidências de timezone
 *
 * Obtém timezone de múltiplas fontes para validação cruzada.
 * Inconsistências podem indicar uso de VPN ou manipulação.
 *
 * @module TimezoneCollector
 */

import { AuditLogger } from '../../audit-logger';
import { BaseCollector } from './base-collector';
import type { TimezoneEvidence } from '../../../types/forensic-metadata.types';

// ============================================================================
// Constantes
// ============================================================================

/** Tolerância em minutos para considerar offset inconsistente (1 hora) */
const OFFSET_TOLERANCE_MINUTES = 60;

/** Mapa de offsets esperados para timezones brasileiros (em minutos) */
const BRAZILIAN_TIMEZONE_OFFSETS: Readonly<Record<string, number>> = {
  'America/Sao_Paulo': 180,
  'America/Fortaleza': 180,
  'America/Recife': 180,
  'America/Bahia': 180,
  'America/Belem': 180,
  'America/Manaus': 240,
  'America/Cuiaba': 240,
  'America/Porto_Velho': 240,
  'America/Boa_Vista': 240,
  'America/Rio_Branco': 300,
  'America/Noronha': 120,
} as const;

/**
 * Coletor de evidências de timezone
 */
export class TimezoneCollector extends BaseCollector<TimezoneEvidence> {
  private ipTimezone: string | undefined;

  constructor(logger: AuditLogger, ipTimezone?: string, timeout = 2000) {
    super(logger, 'timezone', timeout);
    this.ipTimezone = ipTimezone ?? undefined;
  }

  protected async doCollect(): Promise<TimezoneEvidence> {
    const result: TimezoneEvidence = {
      sources: [],
      consistent: true,
    };

    const timezones: string[] = [];

    // Fonte 1: Intl.DateTimeFormat
    try {
      const intlTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      result.intlTimezone = intlTimezone;
      result.sources.push({ source: 'Intl.DateTimeFormat', value: intlTimezone });
      timezones.push(intlTimezone);
    } catch {
      // Silencioso
    }

    // Fonte 2: Date.getTimezoneOffset
    try {
      const offset = new Date().getTimezoneOffset();
      result.offsetMinutes = offset;
      const offsetStr = this.offsetToTimezoneString(offset);
      result.offsetString = offsetStr;
      result.sources.push({ source: 'Date.getTimezoneOffset', value: offsetStr });
    } catch {
      // Silencioso
    }

    // Fonte 3: Timezone do IP (se fornecido)
    if (this.ipTimezone !== undefined) {
      const ipTz = this.ipTimezone;
      result.ipTimezone = ipTz;
      result.sources.push({ source: 'IP Geolocation', value: ipTz });
      timezones.push(ipTz);
    }

    // Fonte 4: Performance timing (para detectar manipulação)
    try {
      const now = Date.now();
      const perfNow = performance.now();
      result.performanceNow = perfNow;
      result.dateNow = now;
    } catch {
      // Silencioso
    }

    // Fonte 5: Locale do navegador
    try {
      const locale = navigator.language;
      result.locale = locale;
      result.sources.push({ source: 'navigator.language', value: locale });
    } catch {
      // Silencioso
    }

    // Verifica consistência entre fontes
    if (timezones.length > 1) {
      const uniqueTimezones = [...new Set(timezones)];
      result.consistent = uniqueTimezones.length === 1;

      if (!result.consistent) {
        result.inconsistencyDetails = `Timezones diferentes detectados: ${uniqueTimezones.join(', ')}`;
      }
    }

    // Detecta possível manipulação de timezone
    result.possibleManipulation = this.detectManipulation(result);

    return result;
  }

  /**
   * Converte offset em minutos para string de timezone
   */
  private offsetToTimezoneString(offsetMinutes: number): string {
    const sign = offsetMinutes <= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetMinutes);
    const hours = Math.floor(absOffset / 60);
    const minutes = absOffset % 60;
    return `UTC${sign}${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  }

  /**
   * Detecta possíveis sinais de manipulação de timezone
   */
  private detectManipulation(evidence: TimezoneEvidence): boolean {
    // Se há inconsistência entre fontes, pode indicar manipulação
    if (!evidence.consistent) {
      return true;
    }

    // Se o offset não corresponde ao timezone declarado
    if (evidence.intlTimezone && evidence.offsetMinutes !== undefined) {
      const expectedOffset = this.getExpectedOffset(evidence.intlTimezone);
      if (expectedOffset !== null && Math.abs(expectedOffset - evidence.offsetMinutes) > OFFSET_TOLERANCE_MINUTES) {
        return true;
      }
    }

    return false;
  }

  /**
   * Obtém offset esperado para um timezone brasileiro
   * @param timezone - Nome do timezone IANA
   * @returns Offset em minutos ou null se não mapeado
   */
  private getExpectedOffset(timezone: string): number | null {
    return BRAZILIAN_TIMEZONE_OFFSETS[timezone] ?? null;
  }
}


export default TimezoneCollector;
