import { defineManifest } from '@crxjs/vite-plugin';
import { buildCSP } from './lib/csp/csp-builder';

/**
 * Manifest V3 da Extensão Chrome Lexato
 *
 * Define permissões, scripts e configurações da extensão
 * para captura de provas digitais com certificação blockchain.
 *
 * O manifest utiliza função async com parâmetro `env` do CRXJS para
 * gerar CSP condicional baseado no modo de build (development/production).
 * A lógica de construção do CSP está em `src/lib/csp/csp-builder.ts`
 * para permitir testes unitários independentes do CRXJS.
 *
 * @see https://developer.chrome.com/docs/extensions/mv3/manifest/
 *
 * Requisitos atendidos:
 * - 2.1: manifest_version 3 (obrigatório desde 2024)
 * - 2.2: Permissões necessárias para captura e notificações
 * - 2.3: host_permissions para captura em qualquer página
 * - 2.4: Service Worker como background script com type module
 * - 2.5: Content scripts injetados em todas as páginas
 * - 2.6: Action com ícones e título (Side Panel via onClicked)
 * - 2.7: web_accessible_resources para assets e overlay (reduzido - Req 7.1-7.4)
 * - 2.8: Content Security Policy restritiva e condicional por ambiente
 * - 4.1: CSP de produção sem referências a localhost
 * - 4.2: CSP de desenvolvimento com origens localhost
 * - 4.3: Domínios de serviços externos mantidos em ambos os ambientes
 * - 4.4: Alternância de CSP via detecção de modo de build
 * - 9.1: Comentários inline documentando finalidade de cada grupo de domínios
 * - 9.2: Domínios agrupados por categoria funcional
 * - 9.3: Justificativa para cada grupo de domínios
 */
export default defineManifest(async (env) => {
  const isDev = env.mode === 'development';

  return {
    // Requisito 2.1: Manifest V3 obrigatório pelo Google desde 2024
    manifest_version: 3,

    // Versão mínima do Chrome suportada
    // Chrome 116+ é necessário para suporte completo a MV3 APIs (sidePanel, offscreen, etc.)
    minimum_chrome_version: '116',

    // Informações básicas da extensão
    name: 'Lexato - Registro de Provas Digitais',
    version: '1.0.0',
    description:
      'Capture e certifique provas digitais com validade jurídica usando blockchain e ICP-Brasil',

    // Ícones da extensão em múltiplos tamanhos (PNG obrigatório para manifest)
    // NOTA: Chrome não suporta WebP para ícones do manifest
    // @see https://developer.chrome.com/docs/extensions/manifest/icons
    icons: {
      16: 'src/assets/branding/icon-16.png',
      32: 'src/assets/branding/icon-32.png',
      48: 'src/assets/branding/icon-48.png',
      128: 'src/assets/branding/icon-128.png',
    },

    /**
     * Requisito 2.2: Permissões obrigatórias (reduzidas)
     *
     * Princípio de permissão mínima: apenas permissões efetivamente utilizadas no código.
     * Permissões removidas (não utilizadas): cookies, webRequest
     * Permissões migradas para optional_permissions: management, notifications, tabCapture
     *
     * NOTA: activeTab foi REMOVIDO porque não funciona com Side Panel.
     * O Chrome intencionalmente não concede activeTab para interações no Side Panel
     * (diferente do popup, onde o clique no ícone concede automaticamente).
     * A captura via captureVisibleTab usa host_permissions em vez de activeTab.
     * Referência: https://groups.google.com/a/chromium.org/g/chromium-extensions/c/DET2SXCFnDg
     *
     * - storage: Armazenamento local de tokens e configurações
     * - tabs: Gerenciamento de abas para captura
     * - scripting: Injeção dinâmica de scripts para lockdown
     * - alarms: Agendamento de tarefas (refresh de token, polling)
     * - webNavigation: Monitoramento de navegações durante captura de vídeo
     * - offscreen: Criação de documento offscreen para APIs que requerem DOM
     * - sidePanel: Exibição de controles de gravação fora da área capturada (Requisito 10.1)
     * - identity: Autenticação OAuth2 com provedor de identidade
     */
    permissions: [
      'storage',
      'tabs',
      'scripting',
      'alarms',
      'webNavigation',
      'offscreen',
      'sidePanel',
      'identity',
    ],

    /**
     * Requisito: Login com Google Nativo via chrome.identity
     *
     * O client_id deve ser configurado via variável de ambiente VITE_GOOGLE_CLIENT_ID.
     * Para obter um client_id:
     * 1. Acesse https://console.cloud.google.com/
     * 2. Crie um projeto e configure credenciais OAuth 2.0
     * 3. Selecione "Extensão Chrome" como tipo de aplicativo
     * 4. Adicione o ID da extensão como origem autorizada
     *
     * @see https://developer.chrome.com/docs/extensions/mv3/tut_oauth/
     * @see .env.example para configuração
     */
    oauth2: {
      client_id: import.meta.env['VITE_GOOGLE_CLIENT_ID'] ?? '',
      scopes: ['openid', 'email', 'profile'],
    },

    /**
     * Permissões opcionais (solicitadas sob demanda via chrome.permissions.request)
     *
     * Migradas de permissions para reduzir avisos de instalação na CWS.
     * Cada permissão é solicitada no sidepanel com user gesture
     * no momento em que a funcionalidade correspondente é necessária.
     *
     * - management: Gerenciamento de extensões para isolamento durante captura
     * - notifications: Notificações de status de captura e certificação
     * - tabCapture: Captura de stream de vídeo da aba
     *
     * NOTA: geolocation não é uma permissão válida no Manifest V3.
     * A geolocalização é acessada via navigator.geolocation (API do DOM),
     * não requer declaração no manifest.
     *
     * @see https://developer.chrome.com/docs/extensions/reference/api/permissions
     */
    optional_permissions: [
      'management',
      'notifications',
      'tabCapture',
    ],

    /**
     * Permissões de host para captura em qualquer página
     * Requisito 2.3
     *
     * Necessário para:
     * - captureVisibleTab (screenshot) - substitui activeTab que não funciona com Side Panel
     * - Injeção de content scripts
     * - Ativação do modo lockdown
     *
     * CRÍTICO: Estas permissões são a base para chrome.tabs.captureVisibleTab()
     * funcionar a partir do Side Panel. O Chrome não concede activeTab para
     * interações no Side Panel, então host_permissions é obrigatório.
     */
    host_permissions: ['<all_urls>'],

    /**
     * Requisito 2.4: Service Worker (background script)
     *
     * - type: 'module' para suporte a ES modules
     * - Gerencia autenticação, API e orquestração de capturas
     * - Persiste estado entre sessões
     */
    background: {
      service_worker: 'src/background/service-worker.ts',
      type: 'module' as const,
    },

    /**
     * Requisito 2.5: Content scripts injetados em todas as páginas
     *
     * - matches: '<all_urls>' para injeção universal
     * - run_at: 'document_idle' para não bloquear carregamento
     * - Responsável por lockdown, captura e coleta de metadados
     */
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['src/content/content-script.ts'],
        run_at: 'document_idle' as const,
      },
      {
        matches: ['<all_urls>'],
        js: ['src/content/overlay.tsx'],
        run_at: 'document_idle' as const,
      },
      // Script de lockdown no mundo MAIN para bloquear DevTools
      // Executa no contexto da página (não isolado) para interceptar eventos antes do navegador
      {
        matches: ['<all_urls>'],
        js: ['src/content/lockdown-injector.ts'],
        run_at: 'document_start' as const,
        world: 'MAIN' as const,
      },
    ],

    /**
     * Requisito 2.6 / 1.1 / 8.3: Ação da extensão
     *
     * - default_popup: Popup como ponto de entrada principal
     *   Gerencia login, seleção de tipo de captura e obtenção de streamId
     *   para vídeo (tabCapture requer user gesture que o popup fornece)
     * - Ícones e título mantidos para identificação da extensão
     * - Para vídeo, o popup obtém streamId e abre o Side Panel
     */
    action: {
      default_icon: {
        16: 'src/assets/branding/icon-16.png',
        32: 'src/assets/branding/icon-32.png',
        48: 'src/assets/branding/icon-48.png',
        128: 'src/assets/branding/icon-128.png',
      },
      default_title: 'Lexato - Provas Digitais',
      default_popup: 'src/popup/index.html',
    },

    // Página de opções/configurações
    options_page: 'src/options/index.html',

    /**
     * Requisito 10.2: Configuração do Side Panel
     *
     * - default_path: Caminho relativo para o HTML do Side Panel
     * - Exibe controles de gravação de vídeo fora da área capturada
     * - Permite navegação durante gravação sem interferir no vídeo
     *
     * @see https://developer.chrome.com/docs/extensions/reference/sidePanel/
     */
    side_panel: {
      default_path: 'src/sidepanel/index.html',
    },

    /**
     * Requisito 2.7 / 7.1-7.4: Recursos acessíveis pelo web (reduzidos)
     *
     * Apenas recursos estritamente necessários para interação com páginas web:
     * - Assets: ícones, estilos, imagens injetados na página
     * - Overlay: componentes de UI injetados na página durante captura
     *
     * Recursos removidos (acessados internamente pela extensão, não por páginas web):
     * - Offscreen: acessado via chrome.offscreen.createDocument() (API interna)
     * - SidePanel: acessado via side_panel.default_path no manifest (API interna)
     *
     * Princípio de superfície de ataque mínima: não expor recursos internos
     * a páginas web externas quando não há necessidade.
     */
    web_accessible_resources: [
      {
        resources: ['src/assets/*', 'src/overlay/*', 'src/capture-bridge/*'],
        matches: ['<all_urls>'],
      },
    ],

    /**
     * Requisito 2.8: Content Security Policy restritiva e condicional
     *
     * CSP gerado condicionalmente baseado no modo de build via buildCSP():
     * - Produção: apenas domínios de serviços externos (sem localhost)
     * - Desenvolvimento: domínios de produção + localhost para dev server
     *
     * Domínios agrupados por categoria funcional com justificativa
     * (detalhes em src/lib/csp/csp-builder.ts):
     * - API + Supabase: Lexato REST + WebSocket + Auth via domínio customizado
     * - Armazenamento: AWS S3 + API Gateway
     * - Monitoramento: Sentry para captura de erros
     * - Forense: IP, DNS, WHOIS, Wayback Machine
     * - Blockchain: Polygon, Arbitrum, Optimism para certificação
     *
     * @see https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy
     */
    content_security_policy: {
      extension_pages: buildCSP(isDev),
    },

    /**
     * Permite comunicação externa com o webapp Lexato
     *
     * Habilita compartilhamento de sessão entre extensão e webapp:
     * - Webapp pode solicitar status de autenticação da extensão
     * - Extensão pode receber tokens após login no webapp
     * - Sincronização bidirecional de sessão
     *
     * @see https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable
     */
    externally_connectable: {
      matches: [
        'https://app.lexato.com.br/*',
        'https://admin.lexato.com.br/*',
        'https://lexato.com.br/*',
        'https://*.lexato.com.br/*',
      ],
    },

    /**
     * Comandos de atalho de teclado
     *
     * - open_diagnostic: Ctrl+Shift+D (Windows/Linux) / Cmd+Shift+D (Mac)
     *   Abre o Side Panel na aba de diagnóstico
     *
     * @see https://developer.chrome.com/docs/extensions/reference/commands/
     */
    commands: {
      open_diagnostic: {
        suggested_key: {
          default: 'Ctrl+Shift+D',
          mac: 'Command+Shift+D',
        },
        description: 'Abrir diagnóstico da extensão',
      },
    },
  };
});
