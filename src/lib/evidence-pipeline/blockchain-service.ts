/**
 * Serviço de Registro em Blockchain
 * 
 * Responsável por solicitar o registro da evidência em múltiplas blockchains
 * (Polygon e Arbitrum) através da API do backend.
 * 
 * Requisito Funcional: Fase 5 - Integração Blockchain
 * 
 * @module BlockchainService
 */

import { getAPIClient } from '../../background/api-client';
import { captureException } from '../../lib/sentry';
import type { LexatoError as _LexatoError, ErrorCodes as _ErrorCodes } from '../errors';
import type { BlockchainResult, BlockchainProof } from './types';

export class BlockchainService {
  /**
   * Solicita o registro da evidência nas blockchains configuradas
   * 
   * @param evidenceId - ID da evidência
   * @param timestampHash - Hash do timestamp ICP-Brasil (ligação criptográfica)
   * @returns Resultado da solicitação
   */
  async register(evidenceId: string, timestampHash: string): Promise<BlockchainResult> {
    try {
      const client = getAPIClient();
      
      // Payload conforme definido na API do backend
      const payload = {
        icpTimestampHash: timestampHash
      };

      // POST /evidence/{id}/blockchain
      const response = await client.post<BlockchainProof>(
        `/evidence/${evidenceId}/blockchain`,
        payload
      );

      if (!response.success && !response.data) {
        throw new Error(response.error ?? 'Falha ao solicitar registro em blockchain');
      }

      // Retornar resultado - só incluir proof se existir
      const result: BlockchainResult = {
        success: true,
        status: 'processing', // Blockchain é assíncrono, backend retorna 'processing' ou 'pending'
      };
      
      if (response.data) {
        result.proof = response.data;
      }

      return result;

    } catch (error) {
      // Converter para LexatoError se necessário ou repassar
      captureException(error instanceof Error ? error : new Error(String(error)), {
        tags: { component: 'BlockchainService', operation: 'register' },
        evidenceId,
      });
      
      return {
        success: false,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Erro desconhecido durante registro blockchain'
      };
    }
  }

  /**
   * Verifica o status do registro (polling ou consulta)
   * 
   * @param evidenceId - ID da evidência
   * @returns Status atualizado e provas se disponíveis
   */
  async checkStatus(evidenceId: string): Promise<BlockchainResult> {
    try {
      const client = getAPIClient();
      
      // GET /evidence/{id}/status (ou endpoint específico de blockchain se houver)
      // Aqui assumimos que vamos consultar o endpoint de status geral e extrair info de blockchain
      // Mas o implementation plan sugeriu endpoint específico ou uso do CertificationStatusResponse
      // Vamos usar um endpoint hipotético específico ou adaptar conforme API real.
      // Ajuste: GET /evidence/{id}/blockchain
      
      const response = await client.get<BlockchainProof>(`/evidence/${evidenceId}/blockchain`);

      if (!response.success) {
        throw new Error(response.error ?? 'Erro ao consultar status blockchain');
      }

      // Analisar se temos as provas
      const proof = response.data;
      const isComplete = !!(proof?.txHashPolygon && proof?.txHashArbitrum);
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- Lógica booleana intencional
      const isPartial = !!(proof?.txHashPolygon || proof?.txHashArbitrum);

      const result: BlockchainResult = {
        success: true,
        status: isComplete ? 'completed' : (isPartial ? 'partial' : 'processing'),
      };
      
      if (proof) {
        result.proof = proof;
      }

      return result;

    } catch (error) {
       return {
        success: false,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Erro ao consultar status'
      };
    }
  }
}