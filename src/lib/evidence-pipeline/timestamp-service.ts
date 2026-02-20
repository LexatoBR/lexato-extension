/**
 * Serviço de Timestamp
 *
 * Responsável por obter carimbos do tempo confiáveis para as evidências.
 * Tenta priorizar carimbo ICP-Brasil (RFC 3161) via backend.
 * Em caso de falha, realiza fallback para NTP.
 *
 * @module TimestampService
 */

import { getAPIClient, type APIClient } from '../../background/api-client';
import { AuditLogger } from '../audit-logger';
import { type TimestampResult } from './types';
import { calcularHashSHA256 } from './crypto-helper';

// Configuração de Retry
const RETRY_ATTEMPTS = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // 1s, 2s, 4s

/**
 * Interface para resposta da API de Timestamp
 */
interface TimestampAPIResponse {
  token?: string; // Base64 DER
  tokenHash?: string;
  appliedAt: string;
  tsa: 'SERPRO' | 'LOCAL';
  accuracy?: number;
}

/**
 * Interface para resposta da API de NTP
 */
interface NTPAPIResponse {
  timestamp: string; // ISO 8601
  accuracy: number; // ms
  source: string;
}

export class TimestampService {
  private _client: APIClient | null;
  private logger: AuditLogger;

  constructor(client?: APIClient, logger?: AuditLogger) {
    // Lazy initialization: só obtém o cliente quando necessário
    this._client = client ?? null;
    this.logger = logger ?? new AuditLogger();
  }

  /**
   * Obtém o cliente API (lazy initialization)
   */
  private get client(): APIClient {
    this._client ??= getAPIClient();
    return this._client;
  }

  /**
   * Solicita um timestamp para o Merkle Root fornecido.
   *
   * Tenta obter carimbo ICP-Brasil com retries.
   * Se falhar todas as tentativas, faz fallback para NTP.
   *
   * @param merkleRoot - Merkle Root da evidência para carimbar
   * @returns TimestampResult com carimbo ICP-Brasil ou NTP
   */
  async requestTimestamp(merkleRoot: string): Promise<TimestampResult> {
    this.logger.info('FORENSIC', 'REQUEST_INITIATED', { merkleRoot });

    // 1. Tentar ICP-Brasil (Prioridade)
    try {
      const icpResult = await this.tryICPBrasilWithRetry(merkleRoot);
      this.logger.info('FORENSIC', 'ICP_BRASIL_SUCCESS', {  
        tsa: icpResult.tsa,
        appliedAt: icpResult.appliedAt 
      });
      return icpResult;
    } catch (error) {
      this.logger.warn('FORENSIC', 'ICP_BRASIL_FAILED', {
        error: error instanceof Error ? error.message : String(error),
        merkleRoot
      });
    }

    // 2. Fallback para NTP
    this.logger.info('FORENSIC', 'FALLBACK_INITIATED', { merkleRoot });
    try {
      const ntpResult = await this.fallbackToNTP(merkleRoot);
      this.logger.warn('FORENSIC', 'FALLBACK_SUCCESS', {
        source: 'NTP',
        appliedAt: ntpResult.appliedAt
      });
      return ntpResult;
    } catch (fallbackError) {
      // 3. Último Recurso: Local Time (Worst case)
      // O requisito diz "Fallback NTP", se NTP falhar, o sistema pode estar offline.
      // Vamos retornar um erro ou um Local Time com warning severo?
      // Pelo types.ts, temos type: 'NTP_LOCAL'.
      this.logger.error('FORENSIC', 'FALLBACK_FAILED', {
        error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      });
      
      return this.localTimeFallback(merkleRoot, 'Falha em ICP-Brasil e NTP. Relógio local não confiável.');
    }
  }

  /**
   * Tenta obter timestamp ICP-Brasil com retry exponencial
   */
  private async tryICPBrasilWithRetry(merkleRoot: string): Promise<TimestampResult> {
    let lastError: Error | unknown;

    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      try {
        if (attempt > 0) {
          await this.delay(RETRY_DELAYS[attempt - 1] ?? 1000);
          this.logger.info('FORENSIC', 'RETRY_ATTEMPT', { attempt: attempt + 1, merkleRoot });
        }

        const response = await this.client.post<TimestampAPIResponse>('/evidence/timestamp', {
          merkleRoot
        });

        if (!response.success || !response.data) {
          throw new Error(response.error ?? 'Resposta inválida da API de Timestamp');
        }

        const data = response.data;

        // NOTA: Mantemos o token como Base64 string para evitar problemas de serialização JSON
        // ArrayBuffer não pode ser serializado via chrome.runtime.sendMessage
        const result: TimestampResult = {
          type: 'ICP_BRASIL',
          tokenHash: data.tokenHash ?? '',
          appliedAt: data.appliedAt,
          tsa: data.tsa,
          merkleRoot: merkleRoot,
        };
        
        // Token RFC 3161 em Base64 (não convertemos para ArrayBuffer)
        if (data.token) {
           result.tokenBase64 = data.token;
        }
        
        if (data.accuracy) {
            result.accuracy = data.accuracy;
        }

        return result;

      } catch (error) {
        lastError = error;
        // Se for erro 4xx (client error), não adianta tentar de novo, exceto 429
        // Mas o APIClient já trata alguns, vamos assumir retry por robustez
        console.warn(`[TimestampService] Tentativa ${attempt + 1} falhou:`, error);
      }
    }

    throw lastError ?? new Error('Todas as tentativas de timestamp ICP-Brasil falharam');
  }

  /**
   * Fallback para endpoint NTP simples
   */
  private async fallbackToNTP(merkleRoot: string): Promise<TimestampResult> {
    // Endpoint dedicado para hora certa, mais leve que o timestamp completo
    const response = await this.client.get<NTPAPIResponse>('/time/ntp');

    if (!response.success || !response.data) {
      throw new Error(response.error ?? 'Falha ao obter hora NTP');
    }

    const { timestamp, source } = response.data;
    const tokenSimulator = `NTP-PROOF:${source}:${timestamp}:${merkleRoot}`;
    const tokenHash = await calcularHashSHA256(tokenSimulator);

    return {
      type: 'NTP_LOCAL',
      tokenHash: tokenHash,
      appliedAt: timestamp,
      tsa: 'LOCAL', // NTP é considerado "local" no sentido de não ser autoridade certificadora
      merkleRoot: merkleRoot,
      warning: `Timestamp ICP-Brasil indisponível. Horário obtido via NTP (${source}).`
    };
  }

  /**
   * Fallback final local
   */
  private async localTimeFallback(merkleRoot: string, warning: string): Promise<TimestampResult> {
    const now = new Date().toISOString();
    const tokenHash = await calcularHashSHA256(`LOCAL:${now}:${merkleRoot}`);

    return {
      type: 'NTP_LOCAL',
      tokenHash: tokenHash,
      appliedAt: now,
      tsa: 'LOCAL',
      merkleRoot: merkleRoot,
      warning: warning
    };
  }

  /**
   * Utilitário de delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Converte Base64 para ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

export default TimestampService;
