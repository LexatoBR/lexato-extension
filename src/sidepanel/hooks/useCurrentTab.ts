/**
 * Hook para obter informações da aba atual
 *
 * Monitora a aba ativa e verifica se a URL pode ser capturada.
 * Usado para desabilitar o botão de captura em páginas bloqueadas.
 *
 * @module useCurrentTab
 */

import { useState, useEffect, useCallback } from 'react';
import { verificarUrlBloqueada, type VerificacaoUrlBloqueada } from '../../lib/blocked-urls';

/**
 * Estado da aba atual
 */
interface CurrentTabState {
  /** URL da aba atual */
  url: string | null;
  /** Título da aba atual */
  title: string | null;
  /** ID da aba atual */
  tabId: number | null;
  /** Se está carregando informações */
  isLoading: boolean;
  /** Verificação de URL bloqueada */
  verificacaoUrl: VerificacaoUrlBloqueada;
  /** Se a URL pode ser capturada */
  podeCapturar: boolean;
}

/**
 * Retorno do hook useCurrentTab
 */
interface UseCurrentTabReturn extends CurrentTabState {
  /** Atualiza informações da aba */
  refresh: () => Promise<void>;
}

/**
 * Hook para monitorar a aba atual e verificar se pode ser capturada
 *
 * @returns Estado da aba atual com verificação de URL bloqueada
 */
export function useCurrentTab(): UseCurrentTabReturn {
  const [state, setState] = useState<CurrentTabState>({
    url: null,
    title: null,
    tabId: null,
    isLoading: true,
    verificacaoUrl: { bloqueada: true, motivo: 'Carregando...' },
    podeCapturar: false,
  });

  /**
   * Carrega informações da aba ativa
   */
  const loadCurrentTab = useCallback(async () => {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!activeTab) {
        setState({
          url: null,
          title: null,
          tabId: null,
          isLoading: false,
          verificacaoUrl: { bloqueada: true, motivo: 'Nenhuma aba ativa encontrada' },
          podeCapturar: false,
        });
        return;
      }

      const verificacao = verificarUrlBloqueada(activeTab.url);

      setState({
        url: activeTab.url ?? null,
        title: activeTab.title ?? null,
        tabId: activeTab.id ?? null,
        isLoading: false,
        verificacaoUrl: verificacao,
        podeCapturar: !verificacao.bloqueada,
      });
    } catch (error) {
      console.error('[useCurrentTab] Erro ao obter aba atual:', error);
      setState({
        url: null,
        title: null,
        tabId: null,
        isLoading: false,
        verificacaoUrl: { bloqueada: true, motivo: 'Erro ao acessar aba' },
        podeCapturar: false,
      });
    }
  }, []);

  // Carregar ao montar
  useEffect(() => {
    loadCurrentTab();
  }, [loadCurrentTab]);

  // Escutar mudanças de aba
  useEffect(() => {
    const handleTabActivated = () => {
      loadCurrentTab();
    };

    const handleTabUpdated = (
      _tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab
    ) => {
      if (tab.active && changeInfo.url) {
        loadCurrentTab();
      }
    };

    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.tabs.onUpdated.addListener(handleTabUpdated);

    return () => {
      chrome.tabs.onActivated.removeListener(handleTabActivated);
      chrome.tabs.onUpdated.removeListener(handleTabUpdated);
    };
  }, [loadCurrentTab]);

  return {
    ...state,
    refresh: loadCurrentTab,
  };
}

export default useCurrentTab;
