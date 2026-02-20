# Justificativas Técnicas para Conformidade Chrome Web Store

Documento de justificativas técnicas para permissões e configurações especiais da extensão Chrome Lexato v1.0.0, destinado à equipe de revisão da Chrome Web Store.

## 1. `host_permissions: ["<all_urls>"]`

### Finalidade

A extensão Lexato é uma ferramenta de captura e certificação de provas digitais com validade jurídica. Sua função principal é registrar o estado exato de qualquer página web visitada pelo usuário, incluindo screenshot, código-fonte HTML, metadados HTTP, informações DNS/WHOIS/SSL e hash SHA-256 de todos os artefatos coletados.

### Justificativa técnica

A permissão `<all_urls>` é necessária por três razões interdependentes:

1. **`chrome.tabs.captureVisibleTab()`**: A extensão opera via Side Panel (não popup). O Chrome intencionalmente não concede `activeTab` para interações originadas no Side Panel ([referência](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/DET2SXCFnDg)). Portanto, `host_permissions` com `<all_urls>` é o único mecanismo para capturar screenshots de qualquer aba ativa.

2. **Injeção de content scripts**: A extensão injeta três content scripts em todas as páginas:
   - `content-script.ts`: Coleta metadados forenses do DOM (título, meta tags, links, scripts)
   - `overlay.tsx`: Exibe indicador visual de captura em andamento
   - `lockdown-injector.ts`: Bloqueia DevTools e edição do DOM durante captura para garantir integridade da prova

3. **Coleta forense universal**: Provas digitais podem ser capturadas em qualquer domínio. Restringir `host_permissions` a domínios específicos inviabilizaria o propósito da extensão, pois o usuário precisa registrar evidências de qualquer URL.

### Alternativas consideradas e descartadas

- **`activeTab`**: Não funciona com Side Panel. O Chrome não concede a permissão temporária para cliques no Side Panel.
- **`optional_host_permissions` com solicitação dinâmica**: Inviável para uso forense, pois a captura precisa ser imediata e sem interrupções. Solicitar permissão por domínio quebraria o fluxo de coleta de provas.

### Mitigações de segurança

- Content scripts executam no mundo isolado (exceto `lockdown-injector.ts` que usa `world: MAIN` apenas para interceptar eventos de DevTools)
- A extensão não modifica conteúdo de páginas; apenas lê e captura
- Todas as comunicações externas são restritas pelo CSP a domínios específicos
- O service worker valida origem de todas as mensagens recebidas

---

## 2. `wasm-unsafe-eval` no Content Security Policy

### Finalidade

A diretiva `'wasm-unsafe-eval'` na CSP da extensão permite a execução de WebAssembly, necessária para a biblioteca `hash-wasm` que fornece hashing SHA-256 de alta performance.

### Justificativa técnica

A extensão calcula hashes SHA-256 de todos os artefatos coletados (screenshot, HTML, metadados) para garantir integridade criptográfica das provas digitais. A biblioteca `hash-wasm` utiliza WebAssembly para performance otimizada e é usada nos seguintes módulos:

- `crypto-utils.ts`: Utilitários criptográficos gerais (SHA-256 de strings e buffers)
- `crypto-helper.ts`: Hash de componentes individuais da evidência (screenshot, HTML, metadados)
- `merkle-tree.ts`: Construção de Merkle Tree para certificação blockchain (hash de nós intermediários)
- `pcc-local.ts`: Prova de Completude Criptográfica local (hash combinado de todos os componentes)
- `hash-generator.ts`: Geração do hash final combinado da evidência

### Por que não usar Web Crypto API nativa

A extensão já utiliza Web Crypto API nativa em content scripts (`crypto-utils-native.ts`), pois content scripts estão sujeitos ao CSP da página visitada (que pode bloquear WebAssembly). Porém, no service worker e nas páginas da extensão (popup, side panel, options), `hash-wasm` via WebAssembly é preferido por:

- Performance consistente para hashing de arquivos grandes (screenshots em alta resolução, vídeos)
- Suporte a streaming hash (`createSHA256`) para processar dados em chunks sem carregar tudo em memória
- Compatibilidade com a construção de Merkle Trees que requer centenas de operações de hash sequenciais

### Conformidade com políticas do Chrome

A diretiva `'wasm-unsafe-eval'` é explicitamente permitida pelo Chrome em extensões Manifest V3, conforme documentação oficial:
- [Content Security Policy - Chrome Extensions](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)

A diretiva permite apenas execução de WebAssembly; não permite `eval()` nem execução de strings como código JavaScript.

---

## 3. Permissões amplas (`host_permissions` + `permissions`)

### Visão geral das permissões declaradas

| Permissão | Justificativa |
|-----------|---------------|
| `storage` | Armazenamento local de tokens de autenticação, configurações do usuário e estado de capturas |
| `tabs` | Gerenciamento de abas para identificar a aba ativa durante captura e obter URL/título |
| `scripting` | Injeção dinâmica de scripts de lockdown durante captura de vídeo |
| `alarms` | Agendamento de refresh de token de autenticação e polling de status de certificação |
| `webNavigation` | Monitoramento de navegações durante captura de vídeo para detectar mudança de página |
| `offscreen` | Criação de documento offscreen para APIs que requerem DOM (ex: MediaRecorder para vídeo) |
| `sidePanel` | Exibição de controles de gravação de vídeo fora da área capturada |
| `identity` | Autenticação OAuth2 com Google via `chrome.identity` |

### Permissões opcionais (solicitadas sob demanda)

| Permissão | Justificativa |
|-----------|---------------|
| `management` | Isolamento de outras extensões durante captura para evitar interferência na prova |
| `notifications` | Notificações de conclusão de captura e certificação |
| `tabCapture` | Captura de stream de vídeo da aba para gravação de provas em vídeo |

### Princípio de permissão mínima

- Permissões como `cookies` e `webRequest` foram removidas por não serem utilizadas
- `management`, `notifications` e `tabCapture` foram migradas para `optional_permissions` para reduzir avisos de instalação
- `activeTab` foi removido por ser ineficaz com Side Panel
- Geolocalização é acessada via `navigator.geolocation` (API do DOM), sem necessidade de declaração no manifest

### Segurança do CSP

O CSP de produção restringe `connect-src` exclusivamente a domínios específicos e necessários:

- `*.lexato.com.br`: API principal, autenticação Supabase e WebSocket
- `*.s3.sa-east-1.amazonaws.com`: Upload de artefatos via presigned URLs
- `*.execute-api.sa-east-1.amazonaws.com`: API Gateway para processamento
- `*.sentry.io`: Monitoramento de erros em produção
- Serviços de coleta forense: `ipinfo.io`, `ip-api.com`, `dns.google`, `cloudflare-dns.com`, `archive.org`
- Blockchain RPCs: `polygon-rpc.com`, `arbitrum.io`, `optimism.io` (certificação de hash)

Wildcards genéricos (`https://*`, `http://*`) foram removidos. Chamadas a APIs de terceiros (WHOIS, SSL) são intermediadas pelo backend proxy (`api.lexato.com.br`).
