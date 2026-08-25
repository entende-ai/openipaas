import { 
  CAVendaListagem, 
  CAObterVendaResponse, 
  CASeller, 
  CACriacaoVendaRequest,
  CAItem,
  CAParcelaNegociacao
} from "../types/sales";
import { 
  UnifiedSale, 
  UnifiedSaleStatus, 
  UnifiedSeller, 
  UnifiedSaleItem,
  UnifiedInstallment
} from "@/types/unified";
import { 
  UnifiedSaleSchema, 
  UnifiedSellerSchema 
} from "@/lib/validations/unified-schemas";

/**
 * Maps Conta Azul status to Unified status
 */
export function mapCAStatusToUnified(caStatus: string): UnifiedSaleStatus {
  const status = caStatus.toUpperCase();
  if (status === 'APROVADO') return 'CONFIRMED';
  if (status === 'EM_ANDAMENTO') return 'DRAFT';
  if (status === 'CANCELADO') return 'CANCELLED';
  if (status === 'FATURADO') return 'INVOICED';
  if (status === 'ORCAMENTO') return 'QUOTATION';
  return 'OTHER';
}

/**
 * Maps Unified status to Conta Azul status (for creation)
 */
export function mapUnifiedStatusToCA(unifiedStatus: UnifiedSaleStatus): 'EM_ANDAMENTO' | 'APROVADO' {
  if (unifiedStatus === 'CONFIRMED' || unifiedStatus === 'INVOICED') return 'APROVADO';
  return 'EM_ANDAMENTO';
}

/**
 * Maps a single Sale item from CA to Unified
 */
export function mapCAItemToUnified(item: CAItem): UnifiedSaleItem {
  return {
    id: item.id,
    productId: item.id_item,
    name: item.nome,
    description: item.descricao,
    quantity: item.quantidade,
    unitPrice: item.valor,
    totalPrice: item.quantidade * item.valor
  };
}

/**
 * Maps a single installment from CA to Unified
 */
export function mapCAParcelaToUnified(parcela: CAParcelaNegociacao): UnifiedInstallment {
  return {
    id: parcela.id,
    number: parcela.numero,
    dueDate: parcela.data_vencimento,
    amount: parcela.valor,
    description: parcela.descricao
  };
}

/**
 * Maps a Sale from Conta Azul (Listagem) to Unified
 * Note: Listagem doesn't have items or installments
 */
export function mapCAListSaleToUnified(caSale: CAVendaListagem): UnifiedSale {
  const mappedData = {
    id: caSale.id,
    number: caSale.numero,
    saleDate: caSale.data,
    totalAmount: caSale.total,
    status: mapCAStatusToUnified(caSale.situacao.nome),
    customerId: caSale.cliente.id,
    customerName: caSale.cliente.nome,
    items: [], // Not available in list view
    installments: [], // Not available in list view
    createdAt: caSale.criado_em,
    updatedAt: caSale.data_alteracao,
    remoteData: {
      provider: "CONTA_AZUL",
      raw: caSale
    }
  };
  return UnifiedSaleSchema.parse(mappedData);
}

/**
 * Maps a full Sale from Conta Azul (Detailed) to Unified
 */
export function mapCADetailSaleToUnified(caResponse: CAObterVendaResponse, items: CAItem[]): UnifiedSale {
  const { venda, cliente, vendedor } = caResponse;
  
  const mappedData = {
    id: venda.id,
    number: venda.numero,
    saleDate: venda.data_compromisso,
    totalAmount: venda.composicao_valor.valor_liquido,
    status: mapCAStatusToUnified(venda.status),
    customerId: cliente.uuid,
    customerName: cliente.nome,
    sellerId: vendedor?.id,
    notes: venda.observacoes,
    items: items.map(mapCAItemToUnified),
    installments: venda.condicao_pagamento.parcelas.map(mapCAParcelaToUnified),
    createdAt: "", // Not directly available in detailed view
    updatedAt: "",
    remoteData: {
      provider: "CONTA_AZUL",
      raw: caResponse
    }
  };
  return UnifiedSaleSchema.parse(mappedData);
}

/**
 * Maps Unified Seller to Unified
 */
export function mapCASellerToUnified(caSeller: CASeller): UnifiedSeller {
  const mappedData = {
    id: caSeller.id,
    name: caSeller.nome,
    externalId: caSeller.id_legado.toString(),
    remoteData: {
      provider: "CONTA_AZUL",
      raw: caSeller
    }
  };
  return UnifiedSellerSchema.parse(mappedData);
}

/**
 * Reverse Mapper: Maps Unified Sale to Conta Azul Request
 */
export function mapUnifiedToCARequest(sale: Partial<UnifiedSale>): CACriacaoVendaRequest {
  return {
    id_cliente: sale.customerId || "",
    numero: sale.number || 0,
    situacao: mapUnifiedStatusToCA(sale.status || 'DRAFT'),
    data_venda: sale.saleDate || new Date().toISOString().split('T')[0],
    id_vendedor: sale.sellerId,
    observacoes: sale.notes,
    itens: (sale.items || []).map(item => ({
      id: item.productId,
      quantidade: item.quantity,
      valor: item.unitPrice,
      descricao: item.name
    })),
    condicao_pagamento: {
      opcao_condicao_pagamento: "À vista", // Default fallback
      parcelas: (sale.installments || []).map(inst => ({
        data_vencimento: inst.dueDate,
        valor: inst.amount,
        descricao: inst.description
      }))
    }
  };
}
