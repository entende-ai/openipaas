import { 
  ContaAzulProduct, 
  ContaAzulProductCreate, 
  ContaAzulProductStatus,
  ContaAzulCategory, 
  ContaAzulBrand, 
  ContaAzulUnit 
} from "../types/products";
import { 
  UnifiedProduct, 
  UnifiedCategory, 
  UnifiedBrand, 
  UnifiedUnit 
} from "@/types/unified";
import { 
  UnifiedProductSchema, 
  UnifiedCategorySchema, 
  UnifiedBrandSchema, 
  UnifiedUnitSchema 
} from "@/lib/validations/unified-schemas";

export function mapContaAzulProductToUnified(ca: ContaAzulProduct): UnifiedProduct {
  const mappedData = {
    id: ca.id,
    name: ca.nome,
    sku: ca.sku || (ca as any).codigo_sku || ca.codigo || null,
    ean: ca.ean || (ca as any).codigo_ean || null,
    price: ca.valor_venda,
    costPrice: ca.custo_medio || (ca as any).estoque?.custo_medio || null,
    stockQuantity: ca.saldo || (ca as any).estoque?.quantidade_total || 0,
    status: (ca.status === 'ATIVO' || (ca as any).ativo === true ? 'ACTIVE' : 'INACTIVE') as 'ACTIVE' | 'INACTIVE',
    updatedAt: ca.ultima_atualizacao || null,
    description: ca.descricao,
    unit: ca.unidade_medida?.descricao,
    category: ca.categoria?.descricao,
    remoteData: {
      provider: "CONTA_AZUL",
      raw: ca
    }
  };

  return UnifiedProductSchema.parse(mappedData);
}

export function mapContaAzulProductListToUnified(caResponse: any) {
  if (!caResponse) return { items: [], totalItems: 0 };
  const rawItems = Array.isArray(caResponse) ? caResponse : (caResponse.items || []);
  const totalItems = caResponse.totalItems || rawItems.length;

  return {
    items: rawItems.map(mapContaAzulProductToUnified),
    totalItems
  };
}

export function mapUnifiedToContaAzulProductCreate(unified: Partial<UnifiedProduct>): ContaAzulProductCreate {
  return {
    nome: unified.name || '',
    valor_venda: unified.price,
    codigo_sku: unified.sku || undefined,
    codigo_ean: unified.ean || undefined,
    status: (unified.status === 'ACTIVE' ? 'ATIVO' : 'INATIVO') as ContaAzulProductStatus,
    descricao: unified.description
  };
}

export function mapContaAzulCategoryToUnified(ca: ContaAzulCategory): UnifiedCategory {
  const mappedData = {
    id: ca.uuid || ca.id.toString(),
    name: ca.descricao,
    remoteData: {
      provider: "CONTA_AZUL",
      raw: ca
    }
  };
  return UnifiedCategorySchema.parse(mappedData);
}

export function mapContaAzulBrandToUnified(ca: ContaAzulBrand): UnifiedBrand {
  const mappedData = {
    id: ca.id,
    name: ca.nome,
    remoteData: {
      provider: "CONTA_AZUL",
      raw: ca
    }
  };
  return UnifiedBrandSchema.parse(mappedData);
}

export function mapContaAzulUnitToUnified(ca: ContaAzulUnit): UnifiedUnit {
  const mappedData = {
    id: ca.id.toString(),
    name: ca.descricao,
    shortName: ca.abreviacao,
    remoteData: {
      provider: "CONTA_AZUL",
      raw: ca
    }
  };
  return UnifiedUnitSchema.parse(mappedData);
}

export function mapUnifiedToContaAzulProductPatch(unified: any): any {
  const patch: any = {};
  if (unified.name) patch.nome = unified.name;
  if (unified.sku) patch.codigo_sku = unified.sku;
  if (unified.ean) patch.codigo_ean = unified.ean;
  if (unified.price) patch.valor_venda = unified.price;
  if (unified.weightGross) patch.peso_bruto = unified.weightGross;
  if (unified.weightNet) patch.peso_liquido = unified.weightNet;
  if (unified.unitId) patch.unidade_medida = unified.unitId;
  if (unified.ncmId) patch.ncm = unified.ncmId;
  if (unified.cestId) patch.cest = unified.cestId;
  return patch;
}
