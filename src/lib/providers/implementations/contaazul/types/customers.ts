export type ContaAzulPersonType = 'Física' | 'Jurídica' | 'Estrangeira' | 'FISICA' | 'JURIDICA' | 'ESTRANGEIRA';
export type ContaAzulProfileType = 'Cliente' | 'Fornecedor' | 'Transportadora';
export type ContaAzulIEIndicator = 'NAO CONTRIBUINTE' | 'CONTRIBUINTE' | 'ISENTO';

export interface ContaAzulAddress {
  id?: string;
  id_cidade?: number;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
  cidade?: string;
  estado?: string;
  pais?: string;
}

export interface ContaAzulInscription {
  id?: string;
  indicador_inscricao_estadual?: ContaAzulIEIndicator;
  inscricao_estadual?: string;
  inscricao_municipal?: string;
  inscricao_suframa?: string;
}

export interface ContaAzulContact {
  id?: string;
  nome: string;
  email?: string;
  cargo?: string;
  telefone_celular?: string;
  telefone_comercial?: string;
}

export interface ContaAzulBillingContact {
  emails?: string[];
  whatsapp?: string;
}

export interface ContaAzulProfile {
  id?: string;
  tipo_perfil: ContaAzulProfileType;
}

export interface ContaAzulCustomer {
  id: string;
  id_legado?: number;
  uuid_legado?: string;
  nome: string;
  email?: string;
  documento?: string;
  tipo_pessoa: ContaAzulPersonType;
  ativo: boolean;
  data_criacao: string;
  data_alteracao?: string;
  telefone?: string;
  observacoes_gerais?: string;
  perfis?: ContaAzulProfileType[];
  endereco?: ContaAzulAddress;
  // Detalhes extras presentes no GET por ID
  codigo?: string;
  data_nascimento?: string;
  rg?: string;
  nome_empresa?: string;
  optante_simples_nacional?: boolean;
  orgao_publico?: boolean;
  observacao?: string;
}

export interface ContaAzulCustomerCreate {
  nome: string;
  tipo_pessoa: ContaAzulPersonType;
  email?: string;
  cpf?: string;
  cnpj?: string;
  rg?: string;
  data_nascimento?: string;
  codigo?: string;
  ativo?: boolean;
  observacao?: string;
  nome_fantasia?: string;
  agencia_publica?: boolean;
  optante_simples?: boolean;
  telefone_celular?: string;
  telefone_comercial?: string;
  perfis?: { tipo_perfil: ContaAzulProfileType }[];
  enderecos?: ContaAzulAddress[];
  inscricoes?: ContaAzulInscription[];
  contato_cobranca_faturamento?: ContaAzulBillingContact;
  outros_contatos?: ContaAzulContact[];
}

export interface ContaAzulCustomerUpdate extends Partial<ContaAzulCustomerCreate> {
  id?: string; // Algumas vezes o ID vem no body, mas geralmente no path
}

export interface ContaAzulListResponse {
  items: ContaAzulCustomer[];
  totalItems: number;
}
