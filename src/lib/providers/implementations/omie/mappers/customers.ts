import { UnifiedCustomer, UnifiedListResponse } from "@/types/unified";
import { UnifiedCustomerSchema } from "@/lib/validations/unified-schemas";

export interface OmieCustomer {
  codigo_cliente: number;
  codigo_cliente_integracao?: string;
  razao_social: string;
  cnpj_cpf: string;
  email: string;
  telefone1_numero?: string;
  endereco?: string;
  endereco_numero?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  inativo?: "S" | "N";
}

export interface OmieListCustomersResponse {
  pagina: number;
  total_de_paginas: number;
  registros: number;
  total_de_registros: number;
  clientes_cadastro: OmieCustomer[];
}

export function mapOmieCustomerToUnified(omieCustomer: OmieCustomer): UnifiedCustomer {
  // Simple heuristic for person type in Brazil
  const document = omieCustomer.cnpj_cpf.replace(/\D/g, "");
  const personType = (document.length <= 11 ? "NATURAL" : "LEGAL") as 'NATURAL' | 'LEGAL';

  const mappedData = {
    id: omieCustomer.codigo_cliente.toString(),
    name: omieCustomer.razao_social,
    email: omieCustomer.email,
    document: omieCustomer.cnpj_cpf,
    personType: personType,
    isActive: omieCustomer.inativo !== "S",
    createdAt: new Date().toISOString(), // Omie doesn't always provide this in list
    updatedAt: null,
    phones: omieCustomer.telefone1_numero ? [omieCustomer.telefone1_numero] : [],
    remoteData: {
      provider: "OMIE",
      raw: omieCustomer
    }
  };

  return UnifiedCustomerSchema.parse(mappedData);
}

export function mapOmieListToUnified(omieResponse: OmieListCustomersResponse): UnifiedListResponse<UnifiedCustomer> {
  return {
    items: (omieResponse.clientes_cadastro || []).map(mapOmieCustomerToUnified),
    totalItems: omieResponse.total_de_registros,
  };
}
