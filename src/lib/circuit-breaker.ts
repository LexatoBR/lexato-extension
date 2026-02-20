/**
 * Circuit Breaker para proteção contra falhas em cascata
 *
 * Implementa padrão Circuit Breaker com estados CLOSED, OPEN e HALF_OPEN
 *
 * @module CircuitBreaker
 */

/**
 * Estados possíveis do Circuit Breaker
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Configuração do Circuit Breaker
 */
export interface CircuitBreakerConfig {
  /** Nome do serviço (para identificação) */
  serviceName: string;
  /** Número de falhas consecutivas para abrir o circuito */
  failureThreshold: number;
  /** Tempo em ms para tentar resetar (passar para HALF_OPEN) */
  resetTimeoutMs: number;
  /** Número de requisições permitidas em HALF_OPEN para teste */
  halfOpenRequests: number;
}

/**
 * Configurações padrão por tipo de serviço
 */
export const DEFAULT_CONFIGS: Record<string, Omit<CircuitBreakerConfig, 'serviceName'>> = {
  'icp-brasil': {
    failureThreshold: 5,
    resetTimeoutMs: 5 * 60 * 1000, // 5 minutos
    halfOpenRequests: 1,
  },
  blockchain: {
    failureThreshold: 5,
    resetTimeoutMs: 1 * 60 * 1000, // 1 minuto
    halfOpenRequests: 2,
  },
  'canal-seguro': {
    failureThreshold: 3,
    resetTimeoutMs: 30 * 1000, // 30 segundos
    halfOpenRequests: 1,
  },
  default: {
    failureThreshold: 5,
    resetTimeoutMs: 60 * 1000, // 1 minuto
    halfOpenRequests: 1,
  },
};

/**
 * Estado interno do Circuit Breaker
 */
interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number | null;
  halfOpenAttempts: number;
}

/**
 * Estatísticas do Circuit Breaker
 */
export interface CircuitBreakerStats {
  serviceName: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: string | null;
  config: CircuitBreakerConfig;
}

/**
 * Erro lançado quando circuito está aberto
 */
export class CircuitOpenError extends Error {
  constructor(serviceName: string) {
    super(`Serviço ${serviceName} temporariamente indisponível. Tente novamente em alguns minutos.`);
    this.name = 'CircuitOpenError';
  }
}

/**
 * CircuitBreaker - Proteção contra falhas em cascata
 *
 * Estados:
 * - CLOSED: Operação normal, requisições passam
 * - OPEN: Circuito aberto, requisições são rejeitadas imediatamente
 * - HALF_OPEN: Testando se serviço voltou, permite algumas requisições
 *
 * Transições:
 * - CLOSED → OPEN: Após failureThreshold falhas consecutivas
 * - OPEN → HALF_OPEN: Após resetTimeoutMs
 * - HALF_OPEN → CLOSED: Após sucesso em requisição de teste
 * - HALF_OPEN → OPEN: Após falha em requisição de teste
 */
export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private internalState: CircuitBreakerState;

  /**
   * Cria nova instância do Circuit Breaker
   *
   * @param config - Configuração completa ou parcial
   */
  constructor(config: Partial<CircuitBreakerConfig> & { serviceName: string }) {
    const serviceType = this.detectServiceType(config.serviceName);
    const defaultConfig = DEFAULT_CONFIGS[serviceType] ?? DEFAULT_CONFIGS['default'];
    const safeDefaultConfig = defaultConfig ?? {
      failureThreshold: 5,
      resetTimeoutMs: 60 * 1000,
      halfOpenRequests: 1,
    };

    this.config = {
      serviceName: config.serviceName,
      failureThreshold: config.failureThreshold ?? safeDefaultConfig.failureThreshold,
      resetTimeoutMs: config.resetTimeoutMs ?? safeDefaultConfig.resetTimeoutMs,
      halfOpenRequests: config.halfOpenRequests ?? safeDefaultConfig.halfOpenRequests,
    };

    this.internalState = {
      state: 'CLOSED',
      failureCount: 0,
      successCount: 0,
      lastFailureTime: null,
      halfOpenAttempts: 0,
    };
  }

  /**
   * Detecta tipo de serviço pelo nome
   */
  private detectServiceType(serviceName: string): string {
    const lowerName = serviceName.toLowerCase();

    if (lowerName.includes('icp') || lowerName.includes('brasil')) {
      return 'icp-brasil';
    }
    if (lowerName.includes('blockchain') || lowerName.includes('polygon') || lowerName.includes('arbitrum')) {
      return 'blockchain';
    }
    if (lowerName.includes('canal') || lowerName.includes('channel')) {
      return 'canal-seguro';
    }

    return 'default';
  }

  /**
   * Obtém estado atual do circuito
   */
  getState(): CircuitState {
    this.checkStateTransition();
    return this.internalState.state;
  }

  /**
   * Verifica se deve fazer transição de estado
   */
  private checkStateTransition(): void {
    if (this.internalState.state === 'OPEN' && this.internalState.lastFailureTime !== null) {
      const timeSinceLastFailure = Date.now() - this.internalState.lastFailureTime;

      if (timeSinceLastFailure >= this.config.resetTimeoutMs) {
        this.transitionTo('HALF_OPEN');
      }
    }
  }

  /**
   * Transiciona para novo estado
   */
  private transitionTo(newState: CircuitState): void {
    const oldState = this.internalState.state;
    this.internalState.state = newState;

    if (newState === 'HALF_OPEN') {
      this.internalState.halfOpenAttempts = 0;
    }

    if (newState === 'CLOSED') {
      this.internalState.failureCount = 0;
      this.internalState.halfOpenAttempts = 0;
    }

    // Log da transição (em produção, usar AuditLogger)
    console.warn(`[CircuitBreaker][${this.config.serviceName}] ${oldState} → ${newState}`);
  }

  /**
   * Verifica se requisição pode prosseguir
   *
   * @returns true se requisição pode prosseguir
   * @throws CircuitOpenError se circuito está aberto
   */
  canExecute(): boolean {
    this.checkStateTransition();

    switch (this.internalState.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        throw new CircuitOpenError(this.config.serviceName);

      case 'HALF_OPEN':
        if (this.internalState.halfOpenAttempts < this.config.halfOpenRequests) {
          this.internalState.halfOpenAttempts++;
          return true;
        }
        throw new CircuitOpenError(this.config.serviceName);
    }
  }

  /**
   * Registra sucesso de requisição
   */
  recordSuccess(): void {
    this.internalState.successCount++;

    if (this.internalState.state === 'HALF_OPEN') {
      // Sucesso em HALF_OPEN → volta para CLOSED
      this.transitionTo('CLOSED');
    } else if (this.internalState.state === 'CLOSED') {
      // Reset contador de falhas em sucesso
      this.internalState.failureCount = 0;
    }
  }

  /**
   * Registra falha de requisição
   */
  recordFailure(): void {
    this.internalState.failureCount++;
    this.internalState.lastFailureTime = Date.now();

    if (this.internalState.state === 'HALF_OPEN') {
      // Falha em HALF_OPEN → volta para OPEN
      this.transitionTo('OPEN');
    } else if (this.internalState.state === 'CLOSED') {
      // Verifica se atingiu threshold
      if (this.internalState.failureCount >= this.config.failureThreshold) {
        this.transitionTo('OPEN');
      }
    }
  }

  /**
   * Executa função com proteção do Circuit Breaker
   *
   * @param fn - Função assíncrona para executar
   * @returns Resultado da função
   * @throws CircuitOpenError se circuito está aberto
   * @throws Erro original se função falhar
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.canExecute();

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  /**
   * Obtém estatísticas do Circuit Breaker
   */
  getStats(): CircuitBreakerStats {
    this.checkStateTransition();

    return {
      serviceName: this.config.serviceName,
      state: this.internalState.state,
      failureCount: this.internalState.failureCount,
      successCount: this.internalState.successCount,
      lastFailureTime: this.internalState.lastFailureTime
        ? new Date(this.internalState.lastFailureTime).toISOString()
        : null,
      config: { ...this.config },
    };
  }

  /**
   * Reseta o Circuit Breaker para estado inicial
   */
  reset(): void {
    this.internalState = {
      state: 'CLOSED',
      failureCount: 0,
      successCount: 0,
      lastFailureTime: null,
      halfOpenAttempts: 0,
    };
  }

  /**
   * Força abertura do circuito (para testes ou manutenção)
   */
  forceOpen(): void {
    this.transitionTo('OPEN');
    this.internalState.lastFailureTime = Date.now();
  }

  /**
   * Força fechamento do circuito (para testes ou manutenção)
   */
  forceClose(): void {
    this.transitionTo('CLOSED');
  }
}

/**
 * Registry de Circuit Breakers por serviço
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Obtém ou cria Circuit Breaker para um serviço
   *
   * @param serviceName - Nome do serviço
   * @param config - Configuração opcional
   * @returns Circuit Breaker para o serviço
   */
  getBreaker(serviceName: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    let breaker = this.breakers.get(serviceName);

    if (!breaker) {
      breaker = new CircuitBreaker({ serviceName, ...config });
      this.breakers.set(serviceName, breaker);
    }

    return breaker;
  }

  /**
   * Obtém estatísticas de todos os Circuit Breakers
   */
  getAllStats(): CircuitBreakerStats[] {
    return Array.from(this.breakers.values()).map((breaker) => breaker.getStats());
  }

  /**
   * Reseta todos os Circuit Breakers
   */
  resetAll(): void {
    this.breakers.forEach((breaker) => breaker.reset());
  }
}

// Instância global do registry
export const circuitBreakerRegistry = new CircuitBreakerRegistry();

export default CircuitBreaker;
