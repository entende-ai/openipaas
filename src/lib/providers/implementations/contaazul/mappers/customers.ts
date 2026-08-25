import { ContaAzulCustomer, ContaAzulPersonType } from "../types/customers";
import { UnifiedCustomer, UnifiedPersonType } from "@/types/unified";
import { UnifiedCustomerSchema } from "@/lib/validations/unified-schemas";

function mapPersonType(caType: ContaAzulPersonType): UnifiedPersonType {
  if (!caType) return 'UNKNOWN';
  const normalized = caType.toUpperCase();
  if (normalized.includes('FÍSICA') || normalized.includes('FISICA')) return 'NATURAL';
  if (normalized.includes('JURÍDICA') || normalized.includes('JURIDICA')) return 'LEGAL';
  if (normalized.includes('ESTRANGEIRA')) return 'FOREIGN';
  return 'UNKNOWN';
}

export function mapContaAzulCustomerToUnified(ca: ContaAzulCustomer): UnifiedCustomer {
  const mappedData = {
    id: ca.id,
    name: ca.nome,
    email: ca.email || null,
    document: ca.documento || (ca as any).cpf || (ca as any).cnpj || null,
    personType: mapPersonType(ca.tipo_pessoa),
    isActive: ca.ativo,
    createdAt: ca.data_criacao || (ca as any).criado_em,
    updatedAt: ca.data_alteracao || null,
    phones: ca.telefone ? [ca.telefone] : [],
    remoteData: {
      provider: "CONTA_AZUL",
      raw: ca
    }
  };

  return UnifiedCustomerSchema.parse(mappedData);
}

export function mapContaAzulListToUnified(caResponse: any) {
  if (!caResponse) return { items: [], totalItems: 0 };

  const rawItems = Array.isArray(caResponse) ? caResponse : (caResponse.items || []);
  const totalItems = caResponse.totalItems || rawItems.length;

  return {
    items: rawItems.map(mapContaAzulCustomerToUnified),
    totalItems
  };
}
