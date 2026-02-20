# Guia de Contribuição

A [Lexato](https://lexato.com.br) é a primeira e única ferramenta de captura de provas digitais Open Source do Brasil. Esse compromisso com transparência só se sustenta com a participação da comunidade — seja revisando código, reportando falhas, propondo melhorias ou auditando a segurança do sistema.

Este guia explica como contribuir de forma efetiva.

## Como contribuir

### Reportando bugs

Antes de abrir uma issue, verifique se o problema já não foi reportado em [Issues](https://github.com/LexatoBR/lexato-extension/issues). Se não encontrar nada relacionado:

1. Abra uma issue com o template de bug report
2. Inclua a versão do Chrome, a versão da ferramenta, os passos para reproduzir o problema e o comportamento esperado versus o observado
3. Se possível, anexe screenshots ou logs do console

### Sugerindo melhorias

1. Abra uma issue com o template de feature request
2. Descreva o problema concreto que a melhoria resolve — propostas com contexto claro têm mais chances de serem aceitas
3. Aguarde a discussão antes de iniciar a implementação

### Auditorias de segurança

A [Lexato](https://lexato.com.br) incentiva ativamente auditorias independentes. O código é Open Source justamente para que pesquisadores de segurança possam inspecioná-lo sem restrições:

- Revise o código livremente — é Open Source por esse motivo
- Para vulnerabilidades encontradas, siga o processo descrito em [SECURITY.md](SECURITY.md) — não abra issues públicas
- Para melhorias de segurança que não envolvam vulnerabilidades, abra um Pull Request normalmente

### Pull Requests

1. Faça um fork do repositório
2. Crie um branch a partir de `main`:
   ```bash
   git checkout -b feat/minha-funcionalidade
   ```
3. Implemente suas alterações seguindo os padrões descritos abaixo
4. Execute os testes antes de submeter:
   ```bash
   npm run test
   npm run typecheck
   npm run lint
   ```
5. Faça commits usando [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: adiciona suporte a captura de vídeo em 4K
   fix: corrige timeout na renovação de token
   docs: atualiza README com exemplo de configuração
   ```
6. Abra o Pull Request com uma descrição clara das mudanças e da motivação

## Padrões de código

### TypeScript

- Tipagem estrita — sem `any` sem justificativa documentada
- Prefira `??` a `||` para nullish coalescing
- Documente funções públicas com JSDoc
- Comentários em português com acentuação perfeita
- Nomes de variáveis e funções em inglês

### Segurança

- Nunca inclua chaves de API, tokens ou credenciais no código — todas as credenciais devem vir de variáveis de ambiente (`VITE_*`)
- Para acesso ao Supabase, use sempre o cliente configurado em `src/lib/supabase/client.ts`
- Criptografia deve seguir os padrões FIPS 140-3 (AES-256-GCM) e FIPS 204 (ML-DSA-87)

### Testes

- Novos recursos devem incluir testes unitários em `tests/unit/`
- Para lógica crítica de segurança e criptografia, adicione testes de propriedade em `tests/property/`
- Mantenha a cobertura de testes acima de 70%:
  ```bash
  npm run test:coverage
  ```

### Componentes React

- Componentes funcionais com hooks
- Prefira composição a herança
- CSS via Tailwind CSS 4 — use tokens do design system em `src/styles/tokens/`
- Textos visíveis ao usuário devem usar o sistema de i18n (pt-BR, en, es)

## Áreas prioritárias

A [Lexato](https://lexato.com.br) valoriza especialmente contribuições nas seguintes áreas:

- **Revisão de segurança** — auditorias independentes do código criptográfico e da cadeia de custódia
- **Testes de propriedade** — validação de invariantes em hashing, árvore Merkle e cadeia de custódia
- **Coleta forense** — novos collectors para metadados adicionais
- **Internacionalização** — traduções para novos idiomas além de pt-BR, en e es
- **Acessibilidade** — melhorias de conformidade WCAG na interface
- **Documentação** — guias técnicos e jurídicos sobre o processo de certificação

## Estrutura de branches

| Branch | Propósito |
|--------|-----------|
| `main` | Código estável, sincronizado com a versão publicada na Chrome Web Store |
| `develop` | Integração de features em desenvolvimento |
| `feat/*` | Novas funcionalidades |
| `fix/*` | Correções de bugs |
| `docs/*` | Apenas documentação |
| `security/*` | Correções de segurança |

## Código de conduta

Este projeto adota o [Contributor Covenant](https://www.contributor-covenant.org/). Respeite os demais colaboradores e mantenha um ambiente inclusivo e acolhedor.

## Dúvidas?

- [Discussions](https://github.com/LexatoBR/lexato-extension/discussions) — perguntas e discussões técnicas
- [contato@lexato.com.br](mailto:contato@lexato.com.br) — contato direto
- [lexato.com.br/suporte](https://lexato.com.br/suporte) — suporte 24/7
