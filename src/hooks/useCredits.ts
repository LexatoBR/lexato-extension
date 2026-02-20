/**
 * Hook de créditos para a Extensão Lexato
 *
 * Gerencia saldo de créditos e verificação de permissões para storage premium.
 *
 * Requisitos atendidos:
 * - 4.2: Exibir saldo de créditos do usuário autenticado
 * - 4.9: Desabilitar premium se créditos insuficientes
 * - 14.1: Utilizar Zustand para gerenciamento de estado global
 *
 * @module useCredits
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { captureException } from '../lib/sentry';
import type { StorageType } from '../types/capture.types';

/**
 * Custo de certificação em créditos
 * 
 * IMPORTANTE: Confirmação de captura custa SEMPRE 1 crédito, independente do
 * tipo de armazenamento. O período de 5 anos está incluído na confirmação.
 * 
 * Extensões de prazo (10 ou 20 anos) são pagas em R$ via Stripe, não créditos.

 */
const CERTIFICATION_COST = 1;

/**
 * Estado de créditos do hook
 */
interface UseCreditsState {
  /** Saldo de créditos */
  credits: number;
  /** Se está carregando */
  isLoading: boolean;
  /** Mensagem de erro */
  error: string | null;
}

/**
 * Retorno do hook useCredits
 */
interface UseCreditsReturn extends UseCreditsState {
  /** Verifica se pode usar storage premium */
  canUsePremium: (type: StorageType) => boolean;
  /** Obtém custo de um tipo de storage */
  getStorageCost: (type: StorageType) => number;
  /** Atualiza saldo de créditos */
  refreshCredits: () => Promise<void>;
  /** Verifica se tem créditos suficientes */
  hasEnoughCredits: (type: StorageType) => boolean;
}

/**
 * Chave de armazenamento para usuário
 * 
 * IMPORTANTE: Usar prefixo 'lexato_' para evitar conflitos com outras extensões
 * e manter consistência com constants.ts e handlers de captura.
 */
const USER_STORAGE_KEY = 'lexato_user';

/**
 * Hook de créditos
 *
 * Funcionalidades:
 * - Obtém saldo de créditos do usuário
 * - Verifica permissões para storage premium
 * - Calcula custos de armazenamento
 * - Sincroniza com chrome.storage.local
 */
export function useCredits(): UseCreditsReturn {
  const [state, setState] = useState<UseCreditsState>({
    credits: 0,
    isLoading: true,
    error: null,
  });

  /**
   * Carrega créditos do storage
   */
  const loadCredits = useCallback(async () => {
    try {
      const result = await chrome.storage.local.get([USER_STORAGE_KEY]);
      const user = result[USER_STORAGE_KEY] as { credits?: number } | undefined;

      setState({
        credits: user?.credits ?? 0,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { component: 'useCredits', operation: 'loadCredits' },
      });
      setState({
        credits: 0,
        isLoading: false,
        error: 'Erro ao carregar créditos',
      });
    }
  }, []);

  /**
   * Atualiza saldo de créditos do servidor
   */
  const refreshCredits = useCallback(async (): Promise<void> => {
    try {
      const result = await chrome.runtime.sendMessage({ type: 'CREDITS_REFRESH' });

      if (result?.credits !== undefined) {
        setState((prev) => ({ ...prev, credits: result.credits }));
      }
    } catch (err) {
      captureException(err instanceof Error ? err : new Error(String(err)), {
        tags: { component: 'useCredits', operation: 'refreshCredits' },
      });
    }
  }, []);

  /**
   * Obtém custo de certificação
   * 
   * IMPORTANTE: Custo é sempre 1 crédito, independente do tipo de armazenamento.
   * Extensões de prazo são pagas em R$ via Stripe.
   */
  const getStorageCost = useCallback((_type: StorageType): number => {
    return CERTIFICATION_COST;
  }, []);

  /**
   * Verifica se tem créditos suficientes para certificação
   */
  const hasEnoughCredits = useCallback(
    (_type: StorageType): boolean => {
      return state.credits >= CERTIFICATION_COST;
    },
    [state.credits]
  );

  /**
   * Verifica se pode usar storage premium
   * 
   * NOTA: Todos os tipos de armazenamento custam 1 crédito para certificação.
   * Extensões de prazo (10/20 anos) são pagas em R$ via Stripe após confirmação.
   */
  const canUsePremium = useCallback(
    (_type: StorageType): boolean => {
      return state.credits >= CERTIFICATION_COST;
    },
    [state.credits]
  );

  // Carregar créditos inicial
  useEffect(() => {
    loadCredits();
  }, [loadCredits]);

  // Escutar mudanças no storage
  useEffect(() => {
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ): void => {
      if (areaName !== 'local') {
        return;
      }

      if (changes[USER_STORAGE_KEY]) {
        const newUser = changes[USER_STORAGE_KEY].newValue as { credits?: number } | undefined;
        setState((prev) => ({
          ...prev,
          credits: newUser?.credits ?? 0,
        }));
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // Escutar mensagens de atualização de créditos
  useEffect(() => {
    const handleMessage = (
      message: { type: string; payload?: unknown },
      _sender: chrome.runtime.MessageSender,
      _sendResponse: (response?: unknown) => void
    ): boolean | void => {
      if (message.type === 'CREDITS_UPDATED') {
        const payload = message.payload as { credits: number } | undefined;
        if (payload?.credits !== undefined) {
          setState((prev) => ({ ...prev, credits: payload.credits }));
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []);

  return useMemo(
    () => ({
      ...state,
      canUsePremium,
      getStorageCost,
      refreshCredits,
      hasEnoughCredits,
    }),
    [state, canUsePremium, getStorageCost, refreshCredits, hasEnoughCredits]
  );
}

export default useCredits;
