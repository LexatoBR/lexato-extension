/**
 * @fileoverview Cliente Realtime para mudancas de status de evidencias
 *
 * Subscreve a mudancas na tabela `evidences` via Supabase Realtime
 * (postgres_changes) e notifica a extensao quando o status de uma
 * evidencia muda (ex: pending_review -> certified).
 *
 * @module EvidenceRealtimeClient
 * @author Equipe Lexato
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient } from '../supabase/client';
import { addBreadcrumb, captureException } from '../sentry';

// =============================================================================
// TIPOS
// =============================================================================

/**
 * Status possiveis de uma evidencia
 */
export type EvidenceStatus =
  | 'pending_review'
  | 'approved'
  | 'processing'
  | 'certified'
  | 'discarded'
  | 'expired'
  | 'error';

/**
 * Registro de evidencia recebido via Realtime
 */
export interface EvidenceRecord {
  id: string;
  user_id: string;
  team_id: string | null;
  type: 'screenshot' | 'video';
  status: EvidenceStatus;
  url: string;
  title: string;
  hash_sha256: string;
  created_at: string;
  updated_at: string;
}

/**
 * Callback para mudancas de status de evidencia
 */
export type EvidenceStatusChangeCallback = (
  oldRecord: Partial<EvidenceRecord>,
  newRecord: EvidenceRecord
) => void;

/**
 * Callback para novas evidencias inseridas
 */
export type EvidenceInsertCallback = (record: EvidenceRecord) => void;

/**
 * Opcoes de configuracao do cliente
 */
export interface EvidenceRealtimeClientOptions {
  /** ID do usuario autenticado para filtrar mudancas */
  userId: string;
}

// =============================================================================
// MAPEAMENTO DE STATUS PARA MENSAGENS
// =============================================================================

/**
 * Mapeamento de status para titulo de notificacao
 */
const STATUS_NOTIFICATION_TITLE: Record<EvidenceStatus, string> = {
  pending_review: 'Evidencia em Revisao',
  approved: 'Evidencia Aprovada',
  processing: 'Evidencia em Processamento',
  certified: 'Evidencia Certificada',
  discarded: 'Evidencia Descartada',
  expired: 'Evidencia Expirada',
  error: 'Erro na Evidencia',
};

/**
 * Mapeamento de status para mensagem de notificacao
 */
const STATUS_NOTIFICATION_MESSAGE: Record<EvidenceStatus, string> = {
  pending_review: 'Sua evidencia esta aguardando revisao.',
  approved: 'Sua evidencia foi aprovada com sucesso.',
  processing: 'Sua evidencia esta sendo processada.',
  certified: 'Sua evidencia foi certificada e esta disponivel para download.',
  discarded: 'Sua evidencia foi descartada.',
  expired: 'Sua evidencia expirou.',
  error: 'Ocorreu um erro ao processar sua evidencia.',
};

// =============================================================================
// CLASSE PRINCIPAL
// =============================================================================

/**
 * Cliente Realtime para monitorar mudancas de status de evidencias
 *
 * Usa Supabase Realtime postgres_changes para receber atualizacoes
 * em tempo real quando o status de uma evidencia muda no banco.
 *
 * @example
 * ```typescript
 * const client = new EvidenceRealtimeClient({ userId: 'user-123' });
 * client.onStatusChange((oldRecord, newRecord) => {
 *   console.log(`Status mudou de ${oldRecord.status} para ${newRecord.status}`);
 * });
 * await client.subscribe();
 * ```
 */
export class EvidenceRealtimeClient {
  private channel: RealtimeChannel | null = null;
  private userId: string;
  private statusChangeCallbacks: Set<EvidenceStatusChangeCallback> = new Set();
  private insertCallbacks: Set<EvidenceInsertCallback> = new Set();
  private isSubscribed = false;

  constructor(options: EvidenceRealtimeClientOptions) {
    this.userId = options.userId;
  }

  /**
   * Subscreve ao canal de mudancas de evidencias
   * Escuta INSERT e UPDATE na tabela `evidences` filtrado por user_id
   */
  async subscribe(): Promise<void> {
    if (this.isSubscribed) {
      addBreadcrumb({
        category: 'evidence-realtime',
        message: 'Ja subscrito ao canal de evidencias',
        level: 'warning',
      });
      return;
    }

    try {
      const supabase = getSupabaseClient();
      const channelName = `evidence-changes:${this.userId}`;

      addBreadcrumb({
        category: 'evidence-realtime',
        message: `Subscrevendo ao canal ${channelName}`,
        level: 'info',
      });

      this.channel = supabase.channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'evidences',
            filter: `user_id=eq.${this.userId}`,
          },
          (payload) => {
            this.handleUpdate(
              payload.old as Partial<EvidenceRecord>,
              payload.new as EvidenceRecord
            );
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'evidences',
            filter: `user_id=eq.${this.userId}`,
          },
          (payload) => {
            this.handleInsert(payload.new as EvidenceRecord);
          }
        )
        .subscribe((status) => {
          addBreadcrumb({
            category: 'evidence-realtime',
            message: `Status de subscricao: ${status}`,
            level: 'info',
          });

          if (status === 'SUBSCRIBED') {
            this.isSubscribed = true;
            addBreadcrumb({
              category: 'evidence-realtime',
              message: 'Subscrito com sucesso ao canal de evidencias',
              level: 'info',
            });
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            this.isSubscribed = false;
            addBreadcrumb({
              category: 'evidence-realtime',
              message: `Erro ao subscrever: ${status}`,
              level: 'error',
            });
            captureException(
              new Error(`[EvidenceRealtimeClient] Erro de subscricao: ${status}`)
            );
          } else if (status === 'CLOSED') {
            this.isSubscribed = false;
          }
        });
    } catch (error) {
      addBreadcrumb({
        category: 'evidence-realtime',
        message: 'Erro ao subscrever ao canal de evidencias',
        level: 'error',
      });
      captureException(error);
      throw error;
    }
  }

  /**
   * Cancela subscricao e limpa recursos
   */
  async unsubscribe(): Promise<void> {
    if (this.channel) {
      addBreadcrumb({
        category: 'evidence-realtime',
        message: 'Cancelando subscricao do canal de evidencias',
        level: 'info',
      });

      await this.channel.unsubscribe();
      this.channel = null;
    }

    this.isSubscribed = false;
  }

  /**
   * Registra callback para mudancas de status
   */
  onStatusChange(callback: EvidenceStatusChangeCallback): void {
    this.statusChangeCallbacks.add(callback);
  }

  /**
   * Remove callback de mudanca de status
   */
  offStatusChange(callback: EvidenceStatusChangeCallback): void {
    this.statusChangeCallbacks.delete(callback);
  }

  /**
   * Registra callback para novas evidencias
   */
  onInsert(callback: EvidenceInsertCallback): void {
    this.insertCallbacks.add(callback);
  }

  /**
   * Remove callback de insercao
   */
  offInsert(callback: EvidenceInsertCallback): void {
    this.insertCallbacks.delete(callback);
  }

  /**
   * Verifica se esta subscrito
   */
  getIsSubscribed(): boolean {
    return this.isSubscribed;
  }

  // ===========================================================================
  // METODOS PRIVADOS
  // ===========================================================================

  /**
   * Processa UPDATE recebido via Realtime
   */
  private handleUpdate(
    oldRecord: Partial<EvidenceRecord>,
    newRecord: EvidenceRecord
  ): void {
    try {
      addBreadcrumb({
        category: 'evidence-realtime',
        message: `Evidencia atualizada: ${newRecord.id}`,
        level: 'info',
        data: {
          oldStatus: oldRecord.status,
          newStatus: newRecord.status,
          evidenceId: newRecord.id,
        },
      });

      // Notificar callbacks de mudanca de status
      this.statusChangeCallbacks.forEach((callback) => {
        try {
          callback(oldRecord, newRecord);
        } catch (error) {
          addBreadcrumb({
            category: 'evidence-realtime',
            message: 'Erro em callback de mudanca de status',
            level: 'error',
          });
          captureException(error);
        }
      });
    } catch (error) {
      addBreadcrumb({
        category: 'evidence-realtime',
        message: 'Erro ao processar UPDATE de evidencia',
        level: 'error',
      });
      captureException(error);
    }
  }

  /**
   * Processa INSERT recebido via Realtime
   */
  private handleInsert(record: EvidenceRecord): void {
    try {
      addBreadcrumb({
        category: 'evidence-realtime',
        message: `Nova evidencia inserida: ${record.id}`,
        level: 'info',
        data: {
          status: record.status,
          type: record.type,
          evidenceId: record.id,
        },
      });

      // Notificar callbacks de insercao
      this.insertCallbacks.forEach((callback) => {
        try {
          callback(record);
        } catch (error) {
          addBreadcrumb({
            category: 'evidence-realtime',
            message: 'Erro em callback de insercao',
            level: 'error',
          });
          captureException(error);
        }
      });
    } catch (error) {
      addBreadcrumb({
        category: 'evidence-realtime',
        message: 'Erro ao processar INSERT de evidencia',
        level: 'error',
      });
      captureException(error);
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Cria instancia do cliente Realtime para evidencias
 *
 * @param options - Opcoes de configuracao
 * @returns Instancia do cliente
 */
export function createEvidenceRealtimeClient(
  options: EvidenceRealtimeClientOptions
): EvidenceRealtimeClient {
  return new EvidenceRealtimeClient(options);
}

// =============================================================================
// UTILITARIOS EXPORTADOS
// =============================================================================

/**
 * Retorna titulo de notificacao para um status de evidencia
 */
export function getStatusNotificationTitle(status: EvidenceStatus): string {
  return STATUS_NOTIFICATION_TITLE[status] ?? 'Atualizacao de Evidencia';
}

/**
 * Retorna mensagem de notificacao para um status de evidencia
 */
export function getStatusNotificationMessage(status: EvidenceStatus): string {
  return STATUS_NOTIFICATION_MESSAGE[status] ?? 'O status da sua evidencia foi atualizado.';
}
