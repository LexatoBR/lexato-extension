/**
 * Implementação de Merkle Tree para certificação de evidências
 *
 * Usa SHA-256 via hash-wasm para cálculo de hashes.
 * Implementa padding com NULL_HASH para árvores com número ímpar de folhas.
 *
 * @module MerkleTree
 */

import { sha256 } from 'hash-wasm';

/**
 * Valor especial para padding de folhas nulas
 * NULL_HASH = SHA-256('LEXATO_MERKLE_NULL_LEAF')
 */
const NULL_LEAF_MARKER = 'LEXATO_MERKLE_NULL_LEAF';

/**
 * Nó da Merkle Tree
 */
export interface MerkleNode {
  /** Hash do nó */
  hash: string;
  /** Nó filho esquerdo (null para folhas) */
  left: MerkleNode | null;
  /** Nó filho direito (null para folhas) */
  right: MerkleNode | null;
  /** Se é um nó de padding (NULL_HASH) */
  isPadding: boolean;
  /** Dados originais (apenas para folhas) */
  data?: string;
}

/**
 * Prova de inclusão na Merkle Tree
 */
export interface MerkleProof {
  /** Hash da folha sendo provada */
  leafHash: string;
  /** Caminho de hashes irmãos até a raiz */
  siblings: Array<{
    /** Hash do nó irmão */
    hash: string;
    /** Posição do irmão: 'left' ou 'right' */
    position: 'left' | 'right';
  }>;
  /** Hash raiz da árvore */
  root: string;
  /** Índice da folha na árvore */
  leafIndex: number;
}

/**
 * Resultado da construção da Merkle Tree
 */
export interface MerkleTreeResult {
  /** Nó raiz da árvore */
  root: MerkleNode;
  /** Hash raiz (Merkle Root) */
  rootHash: string;
  /** Número de folhas originais (sem padding) */
  leafCount: number;
  /** Número total de folhas (com padding) */
  totalLeaves: number;
  /** Altura da árvore */
  height: number;
  /** Hashes de todas as folhas em ordem */
  leafHashes: string[];
}

/**
 * Erro lançado quando operação da Merkle Tree falha
 */
export class MerkleTreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MerkleTreeError';
  }
}

/**
 * Cache para NULL_HASH (calculado uma vez)
 */
let cachedNullHash: string | null = null;

/**
 * Obtém o NULL_HASH para padding
 * NULL_HASH = SHA-256('LEXATO_MERKLE_NULL_LEAF')
 */
export async function getNullHash(): Promise<string> {
  cachedNullHash ??= await sha256(NULL_LEAF_MARKER);
  return cachedNullHash;
}

/**
 * Calcula hash SHA-256 de uma string
 */
async function hashString(data: string): Promise<string> {
  return sha256(data);
}

/**
 * Combina dois hashes para criar hash do nó pai
 * Concatena na ordem fornecida (left + right)
 *
 * @param left - Hash do nó esquerdo
 * @param right - Hash do nó direito
 * @returns Hash combinado
 */
async function combineHashes(left: string, right: string): Promise<string> {
  return sha256(left + right);
}

/**
 * MerkleTree - Implementação de Merkle Tree para certificação
 *
 * Funcionalidades:
 * - Construção de árvore a partir de lista de hashes
 * - Padding automático com NULL_HASH para número ímpar de folhas
 * - Geração de provas de inclusão
 * - Verificação de provas
 */
export class MerkleTree {
  private root: MerkleNode | null = null;
  private leaves: MerkleNode[] = [];
  private leafHashes: string[] = [];
  private originalLeafCount = 0;
  /** Todos os níveis da árvore, do nível 0 (folhas) até a raiz */
  private allLevels: MerkleNode[][] = [];

  /**
   * Constrói Merkle Tree a partir de lista de hashes
   *
   * @param hashes - Lista de hashes das folhas
   * @returns Resultado da construção
   * @throws MerkleTreeError se lista estiver vazia
   */
  async build(hashes: string[]): Promise<MerkleTreeResult> {
    // Validar entrada
    if (!hashes || hashes.length === 0) {
      throw new MerkleTreeError('Lista de hashes não pode estar vazia');
    }

    // Validar formato dos hashes
    for (const hash of hashes) {
      if (!hash || typeof hash !== 'string') {
        throw new MerkleTreeError('Todos os hashes devem ser strings não vazias');
      }
      if (!/^[0-9a-f]{64}$/i.test(hash)) {
        throw new MerkleTreeError(`Hash inválido: ${hash}. Deve ser SHA-256 em hexadecimal`);
      }
    }

    this.originalLeafCount = hashes.length;
    this.leafHashes = [...hashes];

    // Criar nós folha
    this.leaves = hashes.map((hash) => ({
      hash: hash.toLowerCase(),
      left: null,
      right: null,
      isPadding: false,
      data: hash,
    }));

    // Adicionar padding se necessário (número ímpar de folhas)
    const nullHash = await getNullHash();
    while (this.leaves.length > 1 && this.leaves.length % 2 !== 0) {
      this.leaves.push({
        hash: nullHash,
        left: null,
        right: null,
        isPadding: true,
      });
    }

    // Armazenar nível 0 (folhas)
    this.allLevels = [this.leaves];

    // Construir árvore de baixo para cima
    let currentLevel = this.leaves;

    while (currentLevel.length > 1) {
      const nextLevel: MerkleNode[] = [];

      for (let i = 0; i < currentLevel.length; i += 2) {
        const left = currentLevel[i];
        const right = currentLevel[i + 1] ?? left; // Duplicar se ímpar

        if (!left) {
          throw new MerkleTreeError('Erro interno: nó esquerdo não encontrado');
        }

        if (!right) {
          throw new MerkleTreeError('Erro interno: nó direito não encontrado');
        }

        const parentHash = await combineHashes(left.hash, right.hash);

        nextLevel.push({
          hash: parentHash,
          left,
          right,
          isPadding: false,
        });
      }

      // Armazenar este nível
      this.allLevels.push(nextLevel);
      currentLevel = nextLevel;
    }

    this.root = currentLevel[0] ?? null;

    if (!this.root) {
      throw new MerkleTreeError('Erro ao construir árvore: raiz não encontrada');
    }

    return {
      root: this.root,
      rootHash: this.root.hash,
      leafCount: this.originalLeafCount,
      totalLeaves: this.leaves.length,
      height: this.calculateHeight(),
      leafHashes: this.leafHashes,
    };
  }

  /**
   * Constrói Merkle Tree a partir de dados brutos
   * Calcula hash de cada item antes de construir
   *
   * @param items - Lista de strings para criar folhas
   * @returns Resultado da construção
   */
  async buildFromData(items: string[]): Promise<MerkleTreeResult> {
    if (!items || items.length === 0) {
      throw new MerkleTreeError('Lista de itens não pode estar vazia');
    }

    const hashes: string[] = [];
    for (const item of items) {
      if (item === null || item === undefined) {
        throw new MerkleTreeError('Itens não podem ser null ou undefined');
      }
      const hash = await hashString(String(item));
      hashes.push(hash);
    }

    return await this.build(hashes);
  }

  /**
   * Obtém hash raiz da árvore
   */
  getRootHash(): string {
    if (!this.root) {
      throw new MerkleTreeError('Árvore não foi construída');
    }
    return this.root.hash;
  }

  /**
   * Obtém nó raiz da árvore
   */
  getRoot(): MerkleNode {
    if (!this.root) {
      throw new MerkleTreeError('Árvore não foi construída');
    }
    return this.root;
  }

  /**
   * Gera prova de inclusão para uma folha
   *
   * @param leafIndex - Índice da folha (0-based)
   * @returns Prova de inclusão
   */
  async getProof(leafIndex: number): Promise<MerkleProof> {
    if (!this.root) {
      throw new MerkleTreeError('Árvore não foi construída');
    }

    if (leafIndex < 0 || leafIndex >= this.originalLeafCount) {
      throw new MerkleTreeError(
        `Índice de folha inválido: ${leafIndex}. Deve estar entre 0 e ${this.originalLeafCount - 1}`
      );
    }

    const leaf = this.leaves[leafIndex];
    if (!leaf) {
      throw new MerkleTreeError(`Folha não encontrada no índice ${leafIndex}`);
    }

    const siblings: MerkleProof['siblings'] = [];
    let currentIndex = leafIndex;

    // Percorrer todos os níveis exceto o último (raiz)
    for (let levelIdx = 0; levelIdx < this.allLevels.length - 1; levelIdx++) {
      const currentLevel = this.allLevels[levelIdx];
      if (!currentLevel) {
        continue;
      }

      // Encontrar o irmão
      const siblingIndex = currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;

      if (siblingIndex >= 0 && siblingIndex < currentLevel.length) {
        const sibling = currentLevel[siblingIndex];
        if (sibling) {
          siblings.push({
            hash: sibling.hash,
            // Se estamos em índice par, o irmão está à direita
            // Se estamos em índice ímpar, o irmão está à esquerda
            position: currentIndex % 2 === 0 ? 'right' : 'left',
          });
        }
      }

      // Subir para o próximo nível
      currentIndex = Math.floor(currentIndex / 2);
    }

    return {
      leafHash: leaf.hash,
      siblings,
      root: this.root.hash,
      leafIndex,
    };
  }

  /**
   * Verifica prova de inclusão
   *
   * @param proof - Prova de inclusão
   * @returns true se a prova é válida
   */
  async verifyProof(proof: MerkleProof): Promise<boolean> {
    if (!proof?.leafHash || !proof.root) {
      return false;
    }

    let currentHash = proof.leafHash;

    for (const sibling of proof.siblings) {
      // Se o irmão está à esquerda, ele vem primeiro na concatenação
      // Se o irmão está à direita, o hash atual vem primeiro
      if (sibling.position === 'left') {
        currentHash = await combineHashes(sibling.hash, currentHash);
      } else {
        currentHash = await combineHashes(currentHash, sibling.hash);
      }
    }

    return currentHash.toLowerCase() === proof.root.toLowerCase();
  }

  /**
   * Verifica se um hash está presente na árvore
   *
   * @param hash - Hash para verificar
   * @returns true se o hash está presente
   */
  containsHash(hash: string): boolean {
    return this.leafHashes.includes(hash.toLowerCase());
  }

  /**
   * Obtém índice de um hash na árvore
   *
   * @param hash - Hash para buscar
   * @returns Índice ou -1 se não encontrado
   */
  getHashIndex(hash: string): number {
    return this.leafHashes.indexOf(hash.toLowerCase());
  }

  /**
   * Calcula altura da árvore
   */
  private calculateHeight(): number {
    if (this.leaves.length === 0) {
      return 0;
    }
    return Math.ceil(Math.log2(this.leaves.length)) + 1;
  }

  /**
   * Obtém número de folhas originais (sem padding)
   */
  getLeafCount(): number {
    return this.originalLeafCount;
  }

  /**
   * Obtém todos os hashes das folhas
   */
  getLeafHashes(): string[] {
    return [...this.leafHashes];
  }

  /**
   * Serializa a árvore para JSON
   */
  toJSON(): {
    rootHash: string;
    leafCount: number;
    leafHashes: string[];
    height: number;
  } {
    if (!this.root) {
      throw new MerkleTreeError('Árvore não foi construída');
    }

    return {
      rootHash: this.root.hash,
      leafCount: this.originalLeafCount,
      leafHashes: this.leafHashes,
      height: this.calculateHeight(),
    };
  }
}

/**
 * Função utilitária para criar Merkle Tree a partir de hashes
 *
 * @param hashes - Lista de hashes SHA-256
 * @returns Resultado da construção
 */
export async function createMerkleTree(hashes: string[]): Promise<MerkleTreeResult> {
  const tree = new MerkleTree();
  return tree.build(hashes);
}

/**
 * Função utilitária para criar Merkle Tree a partir de dados
 *
 * @param items - Lista de strings
 * @returns Resultado da construção
 */
export async function createMerkleTreeFromData(items: string[]): Promise<MerkleTreeResult> {
  const tree = new MerkleTree();
  return tree.buildFromData(items);
}

/**
 * Função utilitária para verificar prova de inclusão
 *
 * @param proof - Prova de inclusão
 * @returns true se a prova é válida
 */
export async function verifyMerkleProof(proof: MerkleProof): Promise<boolean> {
  const tree = new MerkleTree();
  return tree.verifyProof(proof);
}

export default MerkleTree;
