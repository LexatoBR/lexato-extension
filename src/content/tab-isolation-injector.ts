/**
 * Script injetado no contexto da página (world: MAIN)
 * Intercepta window.open() e links target="_blank"
 * 
 * NOTA: Este script executa no contexto da página (MAIN world), não isolado (ISOLATED world).
 * Isso permite acesso direto API window do site.
 */

(function () {
    'use strict';

    // Flag para verificar se isolamento está ativo
    // Inicialmente false, ativado via mensagem
    let isolationActive = false;

    // Log prefix
    const LOG_PREFIX = '[Lexato Tab Isolation]';

    // Escutar mensagens do content script isolado (que fala com o background)
    window.addEventListener('message', (event) => {
        // Aceitar apenas mensagens da própria janela
        if (event.source !== window) {return;}

        // Validar formato da mensagem: deve ser objeto com type string prefixado LEXATO_
        if (
            !event.data ||
            typeof event.data !== 'object' ||
            typeof event.data.type !== 'string' ||
            !event.data.type.startsWith('LEXATO_')
        ) {
            return;
        }

        if (event.data.type === 'LEXATO_ISOLATION_ACTIVATE') {
            isolationActive = true;
        } else if (event.data.type === 'LEXATO_ISOLATION_DEACTIVATE') {
            isolationActive = false;
        }
    });

    // Guardar referência original
    const originalWindowOpen = window.open;

    // Sobrescrever window.open
    window.open = function (url?: string | URL, target?: string, features?: string): Window | null {
        if (!isolationActive) {
            return originalWindowOpen.call(window, url, target, features);
        }

        // Notificar content script isolado sobre tentativa bloqueada
        // O content script isolado repassará para o background
        window.postMessage({
            type: 'LEXATO_WINDOW_OPEN_BLOCKED',
            url: url?.toString() ?? '',
            target: target,
            timestamp: Date.now(),
        }, '*');

        console.warn(`${LOG_PREFIX} window.open interceptado para manter cadeia de custódia.`);

        // Redirecionar na mesma aba se URL válida
        if (url) {
            const urlString = url.toString();
            // Não redirecionar se for 'about:blank' ou vazio
            if (urlString && urlString !== 'about:blank') {
                window.location.href = urlString;
            }
        }

        // Retornar null (indica ao site que popup foi bloqueado)
        // ou retornar window para "enganar" scripts simples, mas null é mais seguro para evitar acesso cruzado
        return null;
    };

    // Interceptar links com target="_blank" via event delegation
    document.addEventListener('click', (event) => {
        if (!isolationActive) {return;}

        const target = event.target as HTMLElement;
        // Encontrar link mais próximo (para cliques em elementos dentro do <a>)
        const link = target.closest('a[target="_blank"], a[target="_new"], a[target="blank"]');

        if (link instanceof HTMLAnchorElement) {
            event.preventDefault();
            event.stopPropagation();

            console.warn(`${LOG_PREFIX} Link target=_blank interceptado.`);

            // Notificar content script isolado
            window.postMessage({
                type: 'LEXATO_TARGET_BLANK_BLOCKED',
                url: link.href,
                timestamp: Date.now(),
            }, '*');

            // Navegar na mesma aba
            if (link.href) {
                window.location.href = link.href;
            }
        }
    }, true); // Fase de captura para interceptar antes de outros listeners

    // Notificar que script foi injetado com sucesso

})();
