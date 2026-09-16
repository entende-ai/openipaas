export type UnifiedPersonType = 'NATURAL' | 'LEGAL' | 'FOREIGN' | 'UNKNOWN';

export interface UnifiedBaseRecord {
  remoteData?: {
    provider: string;
    raw: any;
  };
}

export interface UnifiedCustomer extends UnifiedBaseRecord {
  id: string;
  name: string;
  email: string | null;
  document: string | null;
  personType: UnifiedPersonType;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  phones: string[];
}

export interface UnifiedProduct extends UnifiedBaseRecord {
  id: string;
  name: string;
  sku: string | null;
  ean: string | null;
  price: number;
  costPrice: number | null;
  stockQuantity: number;
  status: 'ACTIVE' | 'INACTIVE';
  updatedAt: string | null;
  description?: string;
  unit?: string;
  category?: string;
}

export interface UnifiedCategory extends UnifiedBaseRecord {
  id: string;
  name: string;
}

export interface UnifiedBrand extends UnifiedBaseRecord {
  id: string;
  name: string;
}

export interface UnifiedUnit extends UnifiedBaseRecord {
  id: string;
  name: string;
  shortName: string;
}

export interface UnifiedListResponse<T> {
  items: T[];
  totalItems: number;
}

export type UnifiedSaleStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED' | 'INVOICED' | 'QUOTATION' | 'OTHER';

export interface UnifiedSaleItem {
  id: string;
  productId: string;
  name: string;
  description: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface UnifiedInstallment {
  id?: string;
  number: number;
  dueDate: string;
  amount: number;
  description: string;
}

export interface UnifiedSale extends UnifiedBaseRecord {
  id: string;
  number: number;
  saleDate: string;
  totalAmount: number;
  status: UnifiedSaleStatus;
  customerId: string;
  customerName?: string;
  sellerId?: string;
  notes?: string;
  items: UnifiedSaleItem[];
  installments: UnifiedInstallment[];
  createdAt: string;
  updatedAt?: string;
}

export interface UnifiedSeller extends UnifiedBaseRecord {
  id: string;
  name: string;
  externalId?: string;
}

/* ------------------------------------------------------------------ *
 * CRM
 *
 * A CRM tracks relationships and opportunities, not orders, so these are
 * their own shapes rather than a reinterpretation of UnifiedCustomer. A
 * contact is a person, a company is who they work for, and a deal is the
 * opportunity moving through a pipeline.
 * ------------------------------------------------------------------ */

/** Who inside the client's team owns a record. */
export interface UnifiedOwner {
  id: string | null;
  name: string | null;
  email: string | null;
}

export interface UnifiedContact extends UnifiedBaseRecord {
  id: string;
  name: string;
  /** The first address, for the common case. `emails` has them all. */
  email: string | null;
  emails: string[];
  phones: string[];
  /** Job title, where the provider records one. */
  title: string | null;
  companyId: string | null;
  companyName: string | null;
  owner: UnifiedOwner | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface UnifiedCompany extends UnifiedBaseRecord {
  id: string;
  name: string;
  /** CNPJ or the local equivalent, digits only, when the provider has one. */
  document: string | null;
  website: string | null;
  phones: string[];
  owner: UnifiedOwner | null;
  createdAt: string;
  updatedAt: string | null;
}

/**
 * Whether the opportunity is still in play. Providers spell this in their own
 * words; anything that is not clearly won or lost stays OPEN.
 */
export type UnifiedDealStatus = 'OPEN' | 'WON' | 'LOST' | 'UNKNOWN';

export interface UnifiedDeal extends UnifiedBaseRecord {
  id: string;
  name: string;
  status: UnifiedDealStatus;
  /** Null when the provider has no value on the deal, which is not zero. */
  amount: number | null;
  currency: string | null;
  pipelineId: string | null;
  pipelineName: string | null;
  stageId: string | null;
  stageName: string | null;
  companyId: string | null;
  companyName: string | null;
  /** A deal can involve several people, so this is a list even when it holds one. */
  contactIds: string[];
  owner: UnifiedOwner | null;
  /** When it was won or lost. Null while it is open. */
  closedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface UnifiedPipelineStage {
  id: string;
  name: string;
  /** Position in the pipeline, starting at 1. */
  order: number;
}

export interface UnifiedPipeline extends UnifiedBaseRecord {
  id: string;
  name: string;
  /** Stages come with the pipeline: they are meaningless apart from it. */
  stages: UnifiedPipelineStage[];
}
