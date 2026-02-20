# Guia de Contribuição

Obrigado por querer contribuir com a [Lexato](https://lexato.com.br). Este projeto é a primeira e única extensão de captura de provas digitais open source do Brasil, e contribuições da comunidade são fundamentais para manter esse compromisso com transparência e segurança.

## Como Contribuir

### Reportando Bugs

1. Verifique se o bug já não foi reportado em [Issues](https://github.com/LexatoBR/lexato-extension/issues)
2. Abra uma issue com o template de bug report
3. Inclua: versão do Chrome, versão da extensão, passos para reproduzir, comportamento esperado vs. atual

### Sugerindo Melhorias

1. Abra uma issue com o template de feature request
2. Descreva o problema que a melhoria resolve
3. Aguarde discussão antes de implementar

### Auditorias de Segurança

A [Lexato](https://lexato.com.br) incentiva auditorias independentes do código-fonte. Se você é pesquisador de segurança:

1. Revise o código livremente — é open source por esse motivo
2. Para vulnerabilidades, siga o processo em [SECURITY.md](SECURITY.md)
3. Para melhorias de segurança sem vulnerabilidade, abra um Pull Request normalmente

### Pull Requests

1. Fork o repositório
2. Crie um branch a partir de `main`:
   ```bash
   git checkout -b feat/minha-funcionalidade
   ```
3. Faça suas alterações seguindo os padrões abaixo
4. Execute os testes:
   ```bash
   npm run test
   npm run typecheck
   npm run lint
   ```
5. Commit usando [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: adiciona suporte a captura de vídeo em 4K
   fix: corrige timeout na renovação de token
   docs: atualiza README com exemplo de configuração
   ```
6. Abra o Pull Request descrevendo as mudanças

## Padrões de Código

### TypeScript

- Tipagem estrita — sem `any` sem justificativa
- Prefira `??` a `||` para nullish coalescing
- Documente funções públicas com JSDoc
- Comentários em português com acentuação perfeita
- Nomes de variáveis e funções em inglês

### Segurança

- **Nunca** inclua chaves de API, tokens ou credenciais no código
- Todas as credenciais devem vir de variáveis de ambiente (`VITE_*`)
- Para acesso ao Supabase, use sempre o cliente configurado em `src/lib/supabase/client.ts`
- Criptografia deve seguir os padrões FIPS 140-3 (AES-256-GCM) e FIPS 204 (ML-DSA-87)

### Testes

- Novos recursos devem vir com testes unitários em `tests/unit/`
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

## Áreas Prioritárias para Contribuição

A [Lexato](https://lexato.com.br) valoriza especialmente contribuições em:

- **Revisão de segurança** — auditorias independentes do código criptográfico
- **Testes de propriedade** — validação de invariantes em hashing, Merkle tree e cadeia de custódia
- **Coleta forense** — novos collectors para metadados adicionais
- **Internacionalização** — traduções para novos idiomas além de pt-BR, en e es
- **Acessibilidade** — melhorias de conformidade WCAG na interface
- **Documentação** — guias técnicos e jurídicos sobre o processo de certificação

## Estrutura de Branches

| Branch | Propósito |
|--------|-----------|
| `main` | Código estável, sincronizado com a versão publicada na Chrome Web Store |
| `develop` | Integração de features em desenvolvimento |
| `feat/*` | Novas funcionalidades |
| `fix/*` | Correções de bugs |
| `docs/*` | Apenas documentação |
| `security/*` | Correções de segurança |

## Código de Conduta

Este projeto adota o [Contributor Covenant](https://www.contributor-covenant.org/). Respeite os outros colaboradores e mantenha um ambiente inclusivo e acolhedor.

## Dúvidas?

- [Discussions](https://github.com/LexatoBR/lexato-extension/discussions) — perguntas e discussões técnicas
- [contato@lexato.com.br](mailto:contato@lexato.com.br) — contato direto
- [lexato.com.br/suporte](https://lexato.com.br/suporte) — suporte 24/7
