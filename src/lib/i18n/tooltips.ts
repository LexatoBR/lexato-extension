/**
 * Tooltips e hints em português brasileiro
 *
 * Centraliza todos os tooltips e dicas contextuais da extensão Chrome Lexato.
 * Organizado por seção/componente para facilitar manutenção.
 */

/** Tooltips da barra lateral de navegação */
export const sidebarTooltips = {
  /** Navegação principal */
  nav: {
    capture: 'Nova Captura (Ctrl+Shift+C / Cmd+Shift+C)',
    history: 'Capturas Pendentes (Ctrl+H / Cmd+H)',
    quickCapture: 'Captura Rápida (Ctrl+Shift+Q / Cmd+Shift+Q)',
    diagnostic: 'Diagnóstico do Ambiente (Ctrl+Shift+D / Cmd+Shift+D)',
    settings: 'Configurações (Ctrl+, / Cmd+,)',
  },
  /** Rodapé */
  footer: {
    help: 'Central de Ajuda',
    version: 'Versão da extensão',
    logout: 'Sair da conta',
  },
  /** Badges */
  badges: {
    pendingCount: (count: number) =>
      count === 1 ? '1 captura pendente' : `${count} capturas pendentes`,
    newNotifications: (count: number) =>
      count === 1 ? '1 nova notificação' : `${count} novas notificações`,
  },
} as const;

/** Tooltips do cabeçalho */
export const headerTooltips = {
  /** Seletor de contexto */
  context: {
    personal: 'Usar conta pessoal',
    enterprise: 'Usar conta empresarial',
    switchContext: 'Clique para alternar entre conta pessoal e empresarial',
    currentContext: (context: string) => `Contexto atual: ${context}`,
  },
  /** Widget de créditos */
  credits: {
    title: 'Seus créditos disponíveis',
    remaining: (credits: number) =>
      credits === 1 ? '1 crédito restante' : `${credits} créditos restantes`,
    unlimited: 'Créditos ilimitados no plano Enterprise',
    lowCredits: 'Créditos baixos! Considere recarregar.',
    buyMore: 'Clique para comprar mais créditos',
    usage: (used: number, total: number) => `${used} de ${total} créditos usados este mês`,
  },
  /** Notificações */
  notifications: {
    title: 'Centro de notificações',
    unread: (count: number) =>
      count === 1 ? '1 notificação não lida' : `${count} notificações não lidas`,
    empty: 'Nenhuma notificação',
    markRead: 'Marcar como lida',
    markAllRead: 'Marcar todas como lidas',
  },
  /** Indicador de ambiente */
  environment: {
    healthy: 'Ambiente íntegro - Todas as verificações passaram',
    warnings: 'Avisos detectados - Clique para ver detalhes',
    critical: 'Problemas críticos - Ação necessária',
    checkDetails: 'Clique para ver diagnóstico completo',
  },
} as const;

/** Tooltips de armazenamento */
export const storageTooltips = {
  /** Tipos de armazenamento */
  types: {
    standard: 'Armazenamento padrão por 5 anos com Object Lock (incluído)',
    premium5: 'Armazenamento por 5 anos com Blockchain + ICP-Brasil',
    premium10: 'Armazenamento por 10 anos com Blockchain + ICP-Brasil',
    premium20: 'Armazenamento por 20 anos com Blockchain + ICP-Brasil',
  },
  /** Features */
  features: {
    objectLock: 'Proteção contra exclusão e modificação - Imutabilidade garantida',
    compliance: 'Conformidade com LGPD e regulamentações brasileiras',
    audit: 'Logs completos de auditoria para rastreabilidade',
    encryption: 'Criptografia AES-256 em repouso e em trânsito',
    redundancy: 'Redundância geográfica para alta disponibilidade',
  },
  /** Custos */
  costs: {
    free: 'Incluído no seu plano',
    credits: (amount: number) =>
      amount === 1 ? 'Custo: 1 crédito' : `Custo: ${amount} créditos`,
    perMonth: (amount: number) => `${amount} créditos por mês`,
  },
} as const;

/** Tooltips do wizard de captura */
export const wizardTooltips = {
  /** Etapas */
  steps: {
    type: 'Escolha entre screenshot ou gravação de vídeo',
    options: 'Configure as opções da sua captura',
    storage: 'Selecione o período de armazenamento da prova',
    terms: 'Leia e aceite os termos de uso e privacidade',
    confirm: 'Revise e confirme os detalhes da captura',
    start: 'Confirme e inicie a captura da prova digital',
  },
  /** Tipos de captura */
  captureTypes: {
    screenshot: 'Captura instantânea da página atual',
    video: 'Grave interações por até 30 minutos',
    fullPage: 'Captura a página inteira, incluindo área de scroll',
    visibleArea: 'Captura apenas a área visível da tela',
    selectedArea: 'Selecione uma área específica para capturar',
  },
  /** Opções */
  options: {
    includeMetadata: 'Inclui informações técnicas da página (URL, data, navegador)',
    includeGeolocation: 'Inclui localização geográfica aproximada',
    includeTimestamp: 'Inclui data e hora exatas da captura',
    audioEnabled: 'Grava o áudio do sistema durante a captura',
    microphoneEnabled: 'Inclui áudio do microfone na gravação',
    htmlPreserved: 'Preserva o código HTML original da página',
  },
  /** Navegação */
  navigation: {
    back: 'Voltar para a etapa anterior',
    next: 'Avançar para a próxima etapa',
    cancel: 'Cancelar e descartar a captura',
    confirm: 'Confirmar e iniciar a captura',
  },
} as const;

/** Tooltips de captura */
export const captureTooltips = {
  /** Ações */
  actions: {
    start: 'Iniciar captura da prova digital',
    stop: 'Parar gravação e processar captura',
    // NOTA: pause e resume foram removidos como parte do redesign.
    // A remoção de pause/resume garante integridade temporal da evidência.
     (Requirements 5.1, 5.2)
    cancel: 'Cancelar e descartar a captura atual',
    retry: 'Tentar capturar novamente',
  },
  /** Status */
  status: {
    preparing: 'Preparando ambiente de captura...',
    capturing: 'Captura em andamento...',
    processing: 'Processando e gerando hash...',
    uploading: 'Enviando para armazenamento seguro...',
    registering: 'Registrando em blockchain (Polygon + Arbitrum + Optimism)...',
    completed: 'Captura concluída com sucesso!',
    failed: 'Falha na captura - Clique para tentar novamente',
  },
  /** Limites */
  limits: {
    maxDuration: 'Tempo máximo de gravação: 30 minutos',
    timeRemaining: (minutes: number) =>
      minutes === 1 ? '1 minuto restante' : `${minutes} minutos restantes`,
    nearLimit: 'Atenção: Próximo do limite de tempo',
  },
} as const;

/** Tooltips de evidência */
export const evidenceTooltips = {
  /** Ações */
  actions: {
    view: 'Ver detalhes da evidência',
    download: 'Baixar arquivo original',
    downloadCertificate: 'Baixar certificado de autenticidade',
    share: 'Compartilhar link de verificação',
    copy: 'Copiar para área de transferência',
    copyHash: 'Copiar hash SHA-256',
    copyLink: 'Copiar link de verificação',
    delete: 'Excluir evidência permanentemente',
    verify: 'Verificar autenticidade na blockchain',
  },
  /** Status */
  status: {
    pending: 'Aguardando processamento',
    pendingConfirmation: 'Aguardando sua confirmação para prosseguir',
    processing: 'Processamento em andamento',
    completed: 'Evidência registrada e verificada',
    failed: 'Falha no processamento - Clique para detalhes',
    expired: 'Evidência expirada - Não pode mais ser acessada',
    discarded: 'Evidência descartada pelo usuário',
  },
  /** Blockchain */
  blockchain: {
    verified: 'Verificado nas três redes (Polygon + Arbitrum + Optimism)',
    pending: 'Aguardando confirmação na blockchain',
    confirming: 'Confirmando transação...',
    viewTransaction: 'Ver transação no explorador',
    tripleRegistration: 'Triplo registro para máxima segurança jurídica (Polygon + Arbitrum + Optimism)',
  },
  /** Preview */
  preview: {
    confirm: 'Confirmar e prosseguir com o registro',
    discard: 'Descartar esta captura',
    expiresIn: (minutes: number) =>
      minutes === 1
        ? 'Expira em 1 minuto'
        : `Expira em ${minutes} minutos`,
    expired: 'Preview expirado - Faça uma nova captura',
  },
} as const;

/** Tooltips de diagnóstico */
export const diagnosticTooltips = {
  /** Status */
  status: {
    healthy: 'Tudo funcionando corretamente',
    warning: 'Alguns avisos detectados',
    critical: 'Problemas que precisam de atenção',
  },
  /** Verificações */
  checks: {
    connection: 'Verifica conexão com a internet',
    api: 'Verifica comunicação com servidores Lexato',
    blockchain: 'Verifica conexão com redes blockchain',
    storage: 'Verifica espaço de armazenamento local',
    permissions: 'Verifica permissões necessárias do navegador',
    extensions: 'Verifica conflitos com outras extensões',
  },
  /** Ações */
  actions: {
    runDiagnostic: 'Executar verificação completa do ambiente',
    viewDetails: 'Ver detalhes desta verificação',
    fixIssue: 'Tentar corrigir automaticamente',
    exportReport: 'Exportar relatório para suporte',
  },
} as const;

/** Tooltips de configurações */
export const settingsTooltips = {
  /** Geral */
  general: {
    language: 'Idioma da interface',
    theme: 'Tema visual da extensão',
    autoStart: 'Iniciar extensão automaticamente com o navegador',
    showNotifications: 'Exibir notificações do sistema',
  },
  /** Captura */
  capture: {
    defaultType: 'Tipo de captura padrão ao iniciar',
    quality: 'Qualidade da imagem/vídeo capturado',
    format: 'Formato de arquivo para screenshots',
    maxDuration: 'Duração máxima para gravações de vídeo',
  },
  /** Atalhos */
  shortcuts: {
    quickCapture: 'Atalho para captura rápida',
    commandPalette: 'Atalho para abrir paleta de comandos',
    customize: 'Clique para personalizar este atalho',
  },
  /** Privacidade */
  privacy: {
    analytics: 'Enviar dados anônimos de uso para melhorias',
    crashReports: 'Enviar relatórios de erro automaticamente',
    clearData: 'Limpar todos os dados locais da extensão',
  },
} as const;

/** Tooltips de atalhos de teclado */
export const shortcutTooltips = {
  /** Ações principais */
  actions: {
    newCapture: 'Nova Captura (Ctrl+Shift+C / Cmd+Shift+C)',
    quickCapture: 'Captura Rápida (Ctrl+Shift+Q / Cmd+Shift+Q)',
    commandPalette: 'Abrir Paleta de Comandos (Ctrl+K / Cmd+K)',
    settings: 'Abrir Configurações (Ctrl+, / Cmd+,)',
    help: 'Abrir Ajuda',
    history: 'Ver Histórico (Ctrl+H / Cmd+H)',
    diagnostic: 'Diagnóstico (Ctrl+Shift+D / Cmd+Shift+D)',
  },
  /** Navegação */
  navigation: {
    nextTab: 'Próxima aba',
    previousTab: 'Aba anterior',
    closeTab: 'Fechar aba atual',
    goBack: 'Voltar',
    goForward: 'Avançar',
  },
  /** Formatação */
  format: {
    windows: (key: string) => `Ctrl+${key}`,
    mac: (key: string) => `⌘${key}`,
    windowsShift: (key: string) => `Ctrl+Shift+${key}`,
    macShift: (key: string) => `⌘⇧${key}`,
  },
} as const;

/** Tooltips de quick actions */
export const quickActionTooltips = {
  copyHash: 'Copiar hash SHA-256',
  openDetails: 'Abrir detalhes da evidência',
  download: 'Baixar arquivo original',
  share: 'Compartilhar link de verificação',
  verify: 'Verificar na blockchain',
} as const;

/** Tooltips de feedback */
export const feedbackTooltips = {
  /** Cópia */
  copy: {
    success: 'Copiado!',
    hashCopied: 'Hash copiado para área de transferência',
    linkCopied: 'Link copiado para área de transferência',
    textCopied: 'Texto copiado para área de transferência',
  },
  /** Ações */
  actions: {
    saved: 'Salvo com sucesso',
    deleted: 'Excluído com sucesso',
    updated: 'Atualizado com sucesso',
    sent: 'Enviado com sucesso',
  },
} as const;

/** Exportação consolidada de todos os tooltips */
export const tooltips = {
  sidebar: sidebarTooltips,
  header: headerTooltips,
  storage: storageTooltips,
  wizard: wizardTooltips,
  capture: captureTooltips,
  evidence: evidenceTooltips,
  diagnostic: diagnosticTooltips,
  settings: settingsTooltips,
  shortcuts: shortcutTooltips,
  quickActions: quickActionTooltips,
  feedback: feedbackTooltips,
} as const;

export type Tooltips = typeof tooltips;
