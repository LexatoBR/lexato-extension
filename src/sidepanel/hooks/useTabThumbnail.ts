/**
 * Hook para captura de thumbnail da aba atual
 *
 * Captura uma imagem de baixa qualidade da aba atual para preview visual.
 * IMPORTANTE: Esta captura é APENAS para fins visuais/UX, não tem validade legal.
 * Não gera hash, não registra em blockchain, não persiste em servidor.
 *
 * @module useTabThumbnail
 */

import { useState, useCallback, useEffect } from 'react';

/** Largura máxima da thumbnail em pixels */
const THUMBNAIL_MAX_WIDTH = 400;

/** Qualidade JPEG da thumbnail (0-100) */
const THUMBNAIL_QUALITY = 40;

/** Estado do hook */
interface TabThumbnailState {
  /** URL da thumbnail (data URL) */
  thumbnailUrl: string | null;
  /** Se está carregando */
  isLoading: boolean;
  /** Erro (se houver) */
  error: string | null;
  /** URL da página capturada */
  pageUrl: string | null;
  /** Título da página capturada */
  pageTitle: string | null;
}

/** Retorno do hook */
interface UseTabThumbnailReturn extends TabThumbnailState {
  /** Captura thumbnail da aba atual */
  captureThumbnail: () => Promise<void>;
  /** Limpa a thumbnail */
  clearThumbnail: () => void;
}

/**
 * Hook para capturar thumbnail da aba atual
 *
 * @param autoCapture - Se deve capturar automaticamente ao montar (default: false)
 * @returns Estado e funções para gerenciar thumbnail
 */
export function useTabThumbnail(autoCapture = false): UseTabThumbnailReturn {
  const [state, setState] = useState<TabThumbnailState>({
    thumbnailUrl: null,
    isLoading: false,
    error: null,
    pageUrl: null,
    pageTitle: null,
  });

  /**
   * Redimensiona imagem para thumbnail
   */
  const resizeImage = useCallback((dataUrl: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const ratio = THUMBNAIL_MAX_WIDTH / img.width;
        const width = THUMBNAIL_MAX_WIDTH;
        const height = Math.round(img.height * ratio);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Não foi possível criar contexto do canvas'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        const thumbnail = canvas.toDataURL('image/jpeg', THUMBNAIL_QUALITY / 100);
        resolve(thumbnail);
      };

      img.onerror = () => {
        reject(new Error('Erro ao carregar imagem para redimensionamento'));
      };

      img.src = dataUrl;
    });
  }, []);

  /**
   * Captura thumbnail da aba atual
   */
  const captureThumbnail = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_TAB_THUMBNAIL',
      });

      if (!response?.success) {
        throw new Error(response?.error ?? 'Erro ao capturar thumbnail');
      }

      const { imageData, url, title } = response.data;

      const thumbnail = await resizeImage(imageData);

      setState({
        thumbnailUrl: thumbnail,
        isLoading: false,
        error: null,
        pageUrl: url,
        pageTitle: title,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
      console.error('[useTabThumbnail] Erro ao capturar thumbnail:', errorMessage);

      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
    }
  }, [resizeImage]);

  /**
   * Limpa a thumbnail
   */
  const clearThumbnail = useCallback(() => {
    setState({
      thumbnailUrl: null,
      isLoading: false,
      error: null,
      pageUrl: null,
      pageTitle: null,
    });
  }, []);

  // Auto-captura ao montar (se habilitado)
  useEffect(() => {
    if (autoCapture) {
      captureThumbnail();
    }
  }, [autoCapture, captureThumbnail]);

  return {
    ...state,
    captureThumbnail,
    clearThumbnail,
  };
}

export default useTabThumbnail;
