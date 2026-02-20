/**
 * Serviço de Geolocalização para Service Worker (Manifest V3)
 *
 * No Manifest V3, service workers não têm acesso direto a navigator.geolocation.
 * Este serviço usa um Offscreen Document para obter a localização.
 *
 * Verifica permissão 'geolocation' antes de criar offscreen document
 * (degradação graciosa conforme Requirement 2.7).
 *
 * @see https://developer.chrome.com/docs/extensions/how-to/web-platform/geolocation
 */

const OFFSCREEN_DOCUMENT_PATH = 'src/offscreen/offscreen.html';

/** Resultado da geolocalização */
export interface GeolocationResult {
  success: boolean;
  data?: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
    timestamp: number;
  };
  error?: string;
  errorCode?: number;
}

/** Interface para contexto de extensão Chrome */
interface ExtensionContext {
  contextType: string;
  documentUrl?: string;
}

/** Promise para evitar criação concorrente do documento */
let creatingOffscreen: Promise<void> | null = null;

/**
 * Verifica se o documento offscreen já existe
 */
async function hasOffscreenDocument(): Promise<boolean> {
  // Usar chrome.runtime.getContexts se disponível (Chrome 116+)
  if ('getContexts' in chrome.runtime) {
    const contexts = await (
      chrome.runtime as unknown as {
        getContexts: (filter: { contextTypes: string[] }) => Promise<ExtensionContext[]>;
      }
    ).getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT'],
    });
    return contexts.some((ctx: ExtensionContext) => ctx.documentUrl?.includes(OFFSCREEN_DOCUMENT_PATH));
  }

  // Fallback: tentar criar e capturar erro se já existir
  return false;
}

/**
 * Cria o documento offscreen se não existir
 * @returns true se um novo documento foi criado, false se já existia
 */
async function setupOffscreenDocument(): Promise<boolean> {
  if (await hasOffscreenDocument()) {
    return false;
  }

  if (creatingOffscreen) {
    await creatingOffscreen;
    return false;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [chrome.offscreen.Reason.GEOLOCATION],
    justification: 'Coleta de geolocalização para metadados forenses de provas digitais',
  });

  await creatingOffscreen;
  creatingOffscreen = null;

  return true;
}

/**
 * Fecha o documento offscreen
 */
async function closeOffscreenDocument(): Promise<void> {
  if (!(await hasOffscreenDocument())) {
    return;
  }

  try {
    await chrome.offscreen.closeDocument();
  } catch (error) {
    console.warn('[Geolocation] Erro ao fechar documento offscreen:', error);
  }
}

/**
 * Obtém a geolocalização atual do usuário via Offscreen Document
 *
 * Verifica permissão 'geolocation' antes de criar offscreen document.
 * Se a permissão não foi concedida no pré-flight, retorna erro
 * (degradação graciosa conforme Requirement 2.7).
 *
 * @returns Resultado com dados de localização ou erro
 */
export async function getGeolocation(): Promise<GeolocationResult> {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const wasCreated = await setupOffscreenDocument();

      // Se acabou de criar, aguardar para garantir que está pronto
      if (wasCreated) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const result = await chrome.runtime.sendMessage<
        { type: string; target: string },
        GeolocationResult
      >({
        type: 'get-geolocation',
        target: 'offscreen',
      });

      // Verificar se resposta é válida
      if (!result) {
        throw new Error('Resposta vazia do Offscreen Document');
      }

      // Fechar documento após uso para liberar recursos
      await closeOffscreenDocument();

      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const isConnectionError = lastError.message.includes('Receiving end does not exist') ||
                                 lastError.message.includes('Could not establish connection');

      // Se é erro de conexão e ainda temos tentativas, tentar novamente
      if (isConnectionError && attempt < maxRetries) {
        console.warn(`[Geolocation] Tentativa ${attempt}/${maxRetries} falhou, retentando...`);
        // Aguardar com backoff exponencial antes de tentar novamente
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        continue;
      }

      // Erro final ou não é erro de conexão
      break;
    }
  }

  console.error('[Geolocation] Erro ao obter localização:', lastError);
  return {
    success: false,
    error: lastError?.message ?? 'Erro desconhecido',
    errorCode: -1,
  };
}

/**
 * Verifica o status da permissão de geolocalização
 *
 * @returns Estado da permissão: 'granted', 'denied', ou 'prompt'
 */
export async function checkGeolocationPermission(): Promise<PermissionState> {
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const wasCreated = await setupOffscreenDocument();

      // Se acabou de criar, aguardar para garantir que está pronto
      if (wasCreated) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const result = await chrome.runtime.sendMessage<
        { type: string; target: string },
        PermissionState
      >({
        type: 'check-geolocation-permission',
        target: 'offscreen',
      });

      await closeOffscreenDocument();

      return result ?? 'denied';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isConnectionError = errorMessage.includes('Receiving end does not exist') ||
                                 errorMessage.includes('Could not establish connection');

      // Se é erro de conexão e ainda temos tentativas, tentar novamente
      if (isConnectionError && attempt < maxRetries) {
        console.warn(`[Geolocation] Verificação de permissão - tentativa ${attempt}/${maxRetries} falhou`);
        await new Promise(resolve => setTimeout(resolve, 100 * attempt));
        continue;
      }

      console.error('[Geolocation] Erro ao verificar permissão:', error);
      return 'denied';
    }
  }

  return 'denied';
}

/**
 * Solicita permissão de geolocalização ao usuário
 * Abre uma janela/popup que dispara o prompt de permissão do navegador
 * 
 * @returns true se permissão foi concedida
 */
export async function requestGeolocationPermission(): Promise<boolean> {
  try {
    // Verificar status atual
    const currentStatus = await checkGeolocationPermission();
    
    if (currentStatus === 'granted') {
      return true;
    }

    if (currentStatus === 'denied') {
      // Usuário já negou - não podemos solicitar novamente
      console.warn('[Geolocation] Permissão já foi negada pelo usuário');
      return false;
    }

    // Status é 'prompt' - tentar obter localização para disparar o prompt
    const result = await getGeolocation();
    return result.success;
  } catch (error) {
    console.error('[Geolocation] Erro ao solicitar permissão:', error);
    return false;
  }
}
