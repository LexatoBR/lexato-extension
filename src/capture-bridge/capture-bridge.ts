/**
 * Ponte de Captura - Janela intermediária para obter streamId via tabCapture
 *
 * Esta página é aberta como uma janela popup mínima pelo service worker
 * quando o usuário inicia uma captura de vídeo a partir do Side Panel.
 *
 * O Side Panel não concede activeTab/user gesture para tabCapture.
 * Esta janela, sendo uma foreground page da extensão, tem acesso à API
 * tabCapture.getMediaStreamId() e pode obter o streamId sem picker.
 *
 * Fluxo:
 * 1. Service worker abre esta janela com ?tabId=X na URL
 * 2. Esta página obtém o streamId via tabCapture.getMediaStreamId()
 * 3. Envia o streamId de volta ao service worker via chrome.runtime.sendMessage
 * 4. Fecha automaticamente
 *
 * Tempo total: < 500ms (imperceptível para o usuário)
 */

async function main(): Promise<void> {
  try {
    // Extrair tabId da URL
    const params = new URLSearchParams(window.location.search);
    const tabIdStr = params.get('tabId');

    if (!tabIdStr) {
      console.error('[CaptureBridge] tabId ausente na URL');
      await notifyError('tabId ausente na URL');
      return;
    }

    const tabId = parseInt(tabIdStr, 10);
    if (isNaN(tabId)) {
      console.error('[CaptureBridge] tabId invalido:', tabIdStr);
      await notifyError('tabId invalido');
      return;
    }

    // Obter streamId via tabCapture (funciona porque esta e uma foreground page)
    const streamId = await new Promise<string>((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (!id) {
          reject(new Error('streamId vazio'));
        } else {
          resolve(id);
        }
      });
    });

    // Enviar streamId ao service worker
    await chrome.runtime.sendMessage({
      type: 'CAPTURE_BRIDGE_STREAM_ID',
      payload: { streamId, tabId },
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[CaptureBridge] Erro:', msg);
    await notifyError(msg);
  } finally {
    // Fechar esta janela automaticamente
    window.close();
  }
}

async function notifyError(error: string): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: 'CAPTURE_BRIDGE_ERROR',
      payload: { error },
    });
  } catch {
    // Ignora se service worker nao estiver ouvindo
  }
}

// Executar imediatamente
main();
