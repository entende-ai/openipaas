export interface CASeller {
  id: string;
  nome: string;
  id_legado: number;
}

export interface CAItem {
  id: string;
  id_item: string;
  nome: string;
  descricao: string;
  tipo: 'PRODUTO' | 'SERVICO' | 'ATIVOS_IMOBILIZADOS' | 'FINANCEIRO' | 'KIT_PRODUTOS';
  quantidade: number;
  valor: number;
  custo: number;
}

export interface CATotais {
  quantidade_produtos: number;
  quantidade_servicos: number;
  quantidade_nao_conciliados: number;
}

export interface CAItensPaginados {
  itens: CAItem[];
  itens_totais: number;
  totais: CATotais;
}

export interface CANaturezaOperacao {
  uuid: string;
  tipo_operacao: 'VENDA' | 'REMESSA' | 'COMPRA' | 'DEVOLUCAO';
  template_operacao: string;
  label: string;
  mudanca_financeira: boolean;
  mudanca_estoque: 'ENTRADA_ESTOQUE' | 'SAIDA_ESTOQUE' | 'NAO_ALTERA_ESTOQUE';
}

export interface CAStatus {
  nome: string;
  descricao: string;
  ativado?: boolean;
}

export interface CANegociacao {
  id: string;
  status: string;
  id_legado: number;
  tipo_negociacao: string;
  numero: number;
  id_categoria: string;
  data_compromisso: string;
  observacoes: string;
  id_cliente: string;
  versao: number;
  id_natureza_operacao: string;
  id_centro_custo: string;
  introducao: string;
  origem: string;
  composicao_valor: {
    valor_bruto: number;
    desconto: number;
    frete: number;
    impostos: number;
    impostos_deduzidos: number;
    seguro: number;
    despesas_incidentais: number;
    valor_liquido: number;
  };
  condicao_pagamento: {
    tipo_pagamento: string;
    id_conta_financeira: string;
    pagamento_a_vista: boolean;
    parcelas: CAParcelaNegociacao[];
    observacoes_pagamento: string;
    opcao_condicao_pagamento: string;
  };
}

export interface CAParcelaNegociacao {
  id: string;
  numero: number;
  data_vencimento: string;
  valor: number;
  descricao: string;
}

export interface CAObterVendaResponse {
  cliente: {
    uuid: string;
    tipo_pessoa: string;
    documento: string;
    nome: string;
  };
  venda: CANegociacao;
  vendedor: CASeller;
  natureza_operacao: CANaturezaOperacao;
}

export interface CAVendaListagem {
  id: string;
  total: number;
  id_legado: number;
  data: string;
  criado_em: string;
  data_alteracao: string;
  tipo: string;
  numero: number;
  cliente: {
    id: string;
    nome: string;
    email: string;
  };
  situacao: {
    nome: string;
    descricao: string;
  };
  origem: string;
}

export interface CAListagemVendasResponse {
  total_itens: number;
  itens: CAVendaListagem[];
}

// Request Types
export interface CACriacaoVendaRequest {
  id_cliente: string;
  numero: number;
  situacao: 'EM_ANDAMENTO' | 'APROVADO';
  data_venda: string;
  id_categoria?: string;
  id_centro_custo?: string;
  id_vendedor?: string;
  observacoes?: string;
  observacoes_pagamento?: string;
  itens: CAItemVendaRequest[];
  composicao_de_valor?: {
    frete?: number;
    desconto?: {
      tipo: 'PORCENTAGEM' | 'VALOR';
      valor: number;
    };
  };
  condicao_pagamento: {
    tipo_pagamento?: string;
    id_conta_financeira?: string;
    opcao_condicao_pagamento: string;
    parcelas: CAParcelaRequest[];
  };
}

export interface CAItemVendaRequest {
  id: string;
  descricao?: string;
  quantidade: number;
  valor: number;
  valor_custo?: number;
}

export interface CAParcelaRequest {
  data_vencimento: string;
  valor: number;
  descricao?: string;
}

export interface CACriacaoVendaResponse {
  id: string;
  id_legado: number;
  numero: number;
  versao: number;
}

export interface CAExclusaoLoteRequest {
  ids: string[];
}

export interface CAExclusaoLoteResponse {
  atualizados: number;
  ignorados: number;
}
