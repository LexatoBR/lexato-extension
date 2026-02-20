/**
 * Labels de UI em português brasileiro
 *
 * Centraliza todos os textos de interface da extensão Chrome Lexato.
 * Organizado por seção/componente para facilitar manutenção.
 */

/** Labels da barra lateral de navegação */
export const sidebarLabels = {
  /** Navegação principal */
  nav: {
    capture: 'Captura',
    history: 'Histórico',
    quickCapture: 'Captura Rápida',
    diagnostic: 'Diagnóstico',
    settings: 'Configurações',
  },
  /** Rodapé */
  footer: {
    help: 'Ajuda',
    version: 'Versão',
  },
} as const;

/** Labels do cabeçalho */
export const headerLabels = {
  /** Seletor de contexto */
  context: {
    personal: 'Pessoal',
    enterprise: 'Empresa',
    switchContext: 'Alternar contexto',
  },
  /** Widget de créditos */
  credits: {
    title: 'Créditos',
    remaining: 'restantes',
    unlimited: 'Ilimitado',
    buyMore: 'Comprar mais',
    lowCredits: 'Créditos baixos',
  },
  /** Notificações */
  notifications: {
    title: 'Notificações',
    empty: 'Nenhuma notificação',
    markAllRead: 'Marcar todas como lidas',
    viewAll: 'Ver todas',
  },
  /** Badge enterprise */
  enterprise: {
    badge: 'ENTERPRISE',
  },
} as const;

/** Labels da tela de captura */
export const captureLabels = {
  /** Tipos de captura */
  types: {
    screenshot: 'Captura de Tela',
    video: 'Gravação de Vídeo',
    fullPage: 'Página Completa',
    visibleArea: 'Área Visível',
    selectedArea: 'Área Selecionada',
  },
  /** Ações */
  actions: {
    startCapture: 'Iniciar Captura',
    stopCapture: 'Parar Captura',
    pauseCapture: 'Pausar Captura',
    resumeCapture: 'Retomar Captura',
    cancelCapture: 'Cancelar Captura',
    newCapture: 'Nova Captura',
    retryCapture: 'Tentar Novamente',
  },
  /** Status */
  status: {
    preparing: 'Preparando...',
    capturing: 'Capturando...',
    processing: 'Processando...',
    uploading: 'Enviando...',
    registering: 'Registrando na blockchain...',
    completed: 'Concluído',
    failed: 'Falhou',
  },
  /** Opções */
  options: {
    includeMetadata: 'Incluir metadados',
    includeGeolocation: 'Incluir geolocalização',
    includeTimestamp: 'Incluir data/hora',
    audioEnabled: 'Gravar áudio',
    microphoneEnabled: 'Incluir microfone',
  },
  /** Limites */
  limits: {
    maxDuration: 'Duração máxima',
    timeRemaining: 'Tempo restante',
    storageUsed: 'Armazenamento usado',
  },
} as const;

/** Labels de features/funcionalidades */
export const featureLabels = {
  /** Blockchain */
  blockchain: {
    title: 'Registro Blockchain',
    polygon: 'Polygon',
    arbitrum: 'Arbitrum',
    dualRegistration: 'Triplo Registro',
    transactionHash: 'Hash da Transação',
    blockNumber: 'Número do Bloco',
    timestamp: 'Data/Hora do Registro',
    verified: 'Verificado',
    pending: 'Pendente',
    confirming: 'Confirmando',
  },
  /** Certificação */
  certification: {
    title: 'Certificação Digital',
    hash: 'Hash SHA-256',
    signature: 'Assinatura Digital',
    certificate: 'Certificado',
    downloadCertificate: 'Baixar Certificado',
    verifyCertificate: 'Verificar Certificado',
  },
  /** Metadados */
  metadata: {
    title: 'Metadados',
    url: 'URL',
    domain: 'Domínio',
    capturedAt: 'Capturado em',
    browser: 'Navegador',
    resolution: 'Resolução',
    fileSize: 'Tamanho do Arquivo',
    mimeType: 'Tipo de Arquivo',
  },
  /** Forense */
  forensic: {
    title: 'Dados Forenses',
    ipAddress: 'Endereço IP',
    userAgent: 'User Agent',
    timezone: 'Fuso Horário',
    language: 'Idioma',
    screenResolution: 'Resolução da Tela',
    colorDepth: 'Profundidade de Cor',
  },
} as const;

/** Labels de armazenamento */
export const storageLabels = {
  /** Geral */
  general: {
    title: 'Armazenamento',
    used: 'Usado',
    available: 'Disponível',
    total: 'Total',
  },
  /** Tipos */
  types: {
    local: 'Local',
    cloud: 'Nuvem',
    blockchain: 'Blockchain',
  },
  /** Ações */
  actions: {
    clearCache: 'Limpar Cache',
    exportData: 'Exportar Dados',
    importData: 'Importar Dados',
  },
} as const;

/** Labels de botões genéricos */
export const buttonLabels = {
  /** Ações primárias */
  primary: {
    save: 'Salvar',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    delete: 'Excluir',
    edit: 'Editar',
    close: 'Fechar',
  },
  /** Ações secundárias */
  secondary: {
    back: 'Voltar',
    next: 'Próximo',
    previous: 'Anterior',
    skip: 'Pular',
    retry: 'Tentar Novamente',
    refresh: 'Atualizar',
  },
  /** Ações de dados */
  data: {
    copy: 'Copiar',
    download: 'Baixar',
    share: 'Compartilhar',
    export: 'Exportar',
    import: 'Importar',
  },
  /** Autenticação */
  auth: {
    login: 'Entrar',
    logout: 'Sair',
    register: 'Cadastrar',
    forgotPassword: 'Esqueci a senha',
  },
} as const;

/** Labels de status */
export const statusLabels = {
  /** Estados de evidência */
  evidence: {
    pending: 'Pendente',
    pendingUpload: 'Aguardando Upload',
    pendingConfirmation: 'Aguardando Confirmação',
    processing: 'Processando',
    completed: 'Concluído',
    failed: 'Falhou',
    expired: 'Expirado',
    discarded: 'Descartado',
  },
  /** Estados de conexão */
  connection: {
    online: 'Online',
    offline: 'Offline',
    connecting: 'Conectando...',
    reconnecting: 'Reconectando...',
    disconnected: 'Desconectado',
  },
  /** Estados de sincronização */
  sync: {
    synced: 'Sincronizado',
    syncing: 'Sincronizando...',
    pendingSync: 'Sincronização Pendente',
    syncFailed: 'Falha na Sincronização',
    lastSync: 'Última sincronização',
  },
} as const;

/** Labels de tempo relativo */
export const timeLabels = {
  /** Unidades */
  units: {
    seconds: 'segundos',
    minutes: 'minutos',
    hours: 'horas',
    days: 'dias',
    weeks: 'semanas',
    months: 'meses',
    years: 'anos',
  },
  /** Relativos */
  relative: {
    now: 'Agora',
    justNow: 'Agora mesmo',
    ago: 'atrás',
    in: 'em',
    today: 'Hoje',
    yesterday: 'Ontem',
    tomorrow: 'Amanhã',
  },
} as const;

/** Labels de configurações */
export const settingsLabels = {
  /** Seções */
  sections: {
    general: 'Geral',
    capture: 'Captura',
    storage: 'Armazenamento',
    notifications: 'Notificações',
    privacy: 'Privacidade',
    advanced: 'Avançado',
    shortcuts: 'Atalhos de Teclado',
    about: 'Sobre',
  },
  /** Opções gerais */
  general: {
    language: 'Idioma',
    theme: 'Tema',
    autoStart: 'Iniciar automaticamente',
    showNotifications: 'Mostrar notificações',
  },
  /** Opções de captura */
  capture: {
    defaultType: 'Tipo padrão de captura',
    quality: 'Qualidade',
    format: 'Formato',
    maxDuration: 'Duração máxima de vídeo',
  },
} as const;

/** Labels de diagnóstico */
export const diagnosticLabels = {
  /** Status do ambiente */
  environment: {
    title: 'Status do Ambiente',
    healthy: 'Ambiente Íntegro',
    warnings: 'Avisos Detectados',
    critical: 'Problemas Críticos',
  },
  /** Verificações */
  checks: {
    connection: 'Conexão com Internet',
    api: 'Conexão com API',
    blockchain: 'Conexão com Blockchain',
    storage: 'Armazenamento Local',
    permissions: 'Permissões do Navegador',
    extensions: 'Conflitos com Extensões',
  },
  /** Ações */
  actions: {
    runDiagnostic: 'Executar Diagnóstico',
    viewDetails: 'Ver Detalhes',
    fixIssues: 'Corrigir Problemas',
    exportReport: 'Exportar Relatório',
  },
} as const;

/** Labels de atividade */
export const activityLabels = {
  /** Tipos de atividade */
  types: {
    capture: 'Captura realizada',
    upload: 'Upload concluído',
    blockchain: 'Registro blockchain',
    login: 'Login realizado',
    logout: 'Logout realizado',
    sync: 'Sincronização',
    error: 'Erro detectado',
  },
  /** Cabeçalho */
  header: {
    title: 'Atividade Recente',
    viewAll: 'Ver histórico completo',
  },
} as const;

/** Labels de widget de última captura */
export const lastCaptureLabels = {
  title: 'Última Captura',
  viewDetails: 'Ver Detalhes',
  newCapture: 'Nova Captura',
  empty: {
    title: 'Nenhuma captura ainda',
    description: 'Faça sua primeira captura para começar',
    cta: 'Fazer Primeira Captura',
  },
} as const;

/** Labels de command palette */
export const commandPaletteLabels = {
  placeholder: 'Digite um comando ou busque...',
  noResults: 'Nenhum comando encontrado',
  categories: {
    capture: 'Captura',
    navigation: 'Navegação',
    settings: 'Configurações',
    help: 'Ajuda',
  },
} as const;

/** Exportação consolidada de todos os labels */
export const labels = {
  sidebar: sidebarLabels,
  header: headerLabels,
  capture: captureLabels,
  features: featureLabels,
  storage: storageLabels,
  buttons: buttonLabels,
  status: statusLabels,
  time: timeLabels,
  settings: settingsLabels,
  diagnostic: diagnosticLabels,
  activity: activityLabels,
  lastCapture: lastCaptureLabels,
  commandPalette: commandPaletteLabels,
} as const;

export type Labels = typeof labels;
