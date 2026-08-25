export type ContaAzulProductStatus = 'ATIVO' | 'INATIVO';
export type ContaAzulProductType = 'PRODUTO' | 'KIT_PRODUTO' | 'VARIACAO_PRODUTO';
export type ContaAzulStockLevel = 'MINIMO' | 'MAXIMO' | 'PADRAO';
export type ContaAzulProductFormat = 'SIMPLES' | 'VARIACAO';

export interface ContaAzulCategory {
  id: number;
  uuid?: string;
  descricao: string;
}

export interface ContaAzulCEST {
  id: number;
  codigo: string;
  descricao: string;
}

export interface ContaAzulNCM {
  id: number;
  codigo: string;
  descricao: string;
}

export interface ContaAzulUnit {
  id: number;
  abreviacao: string;
  descricao: string;
  em_uso?: boolean;
}

export interface ContaAzulBrand {
  id: string;
  nome: string;
}

export interface ContaAzulProduct {
  id: string;
  id_legado?: number;
  nome: string;
  codigo?: string;
  ean?: string;
  sku?: string;
  valor_venda: number;
  custo_medio?: number;
  saldo?: number;
  status: ContaAzulProductStatus;
  tipo: ContaAzulProductType;
  nivel_estoque?: ContaAzulStockLevel;
  ultima_atualizacao?: string;
  descricao?: string;
  unidade_medida?: {
    id: number;
    descricao?: string;
  };
  categoria?: {
    id: number;
    descricao?: string;
    uuid?: string;
  };
  fiscal?: {
    ncm?: { id: number; codigo?: string; descricao?: string };
    cest?: { id: number; codigo?: string; descricao?: string };
    origem?: string;
    tipo_produto?: string;
  };
  ecommerce?: {
    integracao_ativa?: boolean;
    marca?: { id: string; nome?: string };
    categoria_ecommerce?: { id: string; descricao?: string };
  };
}

export interface ContaAzulProductCreate {
  nome: string;
  valor_venda?: number;
  codigo_ean?: string;
  codigo_sku?: string;
  descricao?: string;
  ativo?: boolean;
  status?: ContaAzulProductStatus;
  formato?: ContaAzulProductFormat;
  categoria?: {
    id: number;
  };
  unidade_medida?: {
    id: number;
  };
  ncm?: number;
  cest?: number;
  peso_bruto?: number;
  peso_liquido?: number;
}

export interface ContaAzulProductListResponse {
  items: ContaAzulProduct[];
  totalItems: number;
}
