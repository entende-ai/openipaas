import { z } from 'zod';

export const UnifiedBaseRecordSchema = z.object({
  remoteData: z.object({
    provider: z.string(),
    raw: z.any(),
  }).optional(),
});

export const UnifiedCustomerSchema = UnifiedBaseRecordSchema.extend({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  document: z.string().nullable(),
  personType: z.enum(['NATURAL', 'LEGAL', 'FOREIGN', 'UNKNOWN']),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
  phones: z.array(z.string()),
});

export const UnifiedProductSchema = UnifiedBaseRecordSchema.extend({
  id: z.string(),
  name: z.string(),
  sku: z.string().nullable(),
  ean: z.string().nullable(),
  price: z.number(),
  costPrice: z.number().nullable(),
  stockQuantity: z.number(),
  status: z.enum(['ACTIVE', 'INACTIVE']),
  updatedAt: z.string().nullable(),
  description: z.string().optional(),
  unit: z.string().optional(),
  category: z.string().optional(),
});

export const UnifiedCategorySchema = UnifiedBaseRecordSchema.extend({
  id: z.string(),
  name: z.string(),
});

export const UnifiedBrandSchema = UnifiedBaseRecordSchema.extend({
  id: z.string(),
  name: z.string(),
});

export const UnifiedUnitSchema = UnifiedBaseRecordSchema.extend({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
});

export const UnifiedSaleItemSchema = z.object({
  id: z.string(),
  productId: z.string(),
  name: z.string(),
  description: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  totalPrice: z.number(),
});

export const UnifiedInstallmentSchema = z.object({
  id: z.string().optional(),
  number: z.number(),
  dueDate: z.string(),
  amount: z.number(),
  description: z.string(),
});

export const UnifiedSaleSchema = UnifiedBaseRecordSchema.extend({
  id: z.string(),
  number: z.number(),
  saleDate: z.string(),
  totalAmount: z.number(),
  status: z.enum(['DRAFT', 'CONFIRMED', 'CANCELLED', 'INVOICED', 'QUOTATION', 'OTHER']),
  customerId: z.string(),
  customerName: z.string().optional(),
  sellerId: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(UnifiedSaleItemSchema),
  installments: z.array(UnifiedInstallmentSchema),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

export const UnifiedSellerSchema = UnifiedBaseRecordSchema.extend({
  id: z.string(),
  name: z.string(),
  externalId: z.string().optional(),
});

/* ------------------------------------------------------------------ *
 * CRM
 * ------------------------------------------------------------------ */

export const UnifiedOwnerSchema = z.object({
  id: z.string().nullable(),
  name: z.string().nullable(),
  email: z.string().nullable(),
});

export const UnifiedContactSchema = UnifiedBaseRecordSchema.extend({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  emails: z.array(z.string()),
  phones: z.array(z.string()),
  title: z.string().nullable(),
  companyId: z.string().nullable(),
  companyName: z.string().nullable(),
  owner: UnifiedOwnerSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
});

export const UnifiedCompanySchema = UnifiedBaseRecordSchema.extend({
  id: z.string(),
  name: z.string(),
  document: z.string().nullable(),
  website: z.string().nullable(),
  phones: z.array(z.string()),
  owner: UnifiedOwnerSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
});

export const UnifiedDealSchema = UnifiedBaseRecordSchema.extend({
  id: z.string(),
  name: z.string(),
  status: z.enum(['OPEN', 'WON', 'LOST', 'UNKNOWN']),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  pipelineId: z.string().nullable(),
  pipelineName: z.string().nullable(),
  stageId: z.string().nullable(),
  stageName: z.string().nullable(),
  companyId: z.string().nullable(),
  companyName: z.string().nullable(),
  contactIds: z.array(z.string()),
  owner: UnifiedOwnerSchema.nullable(),
  closedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
});

export const UnifiedPipelineStageSchema = z.object({
  id: z.string(),
  name: z.string(),
  order: z.number(),
});

export const UnifiedPipelineSchema = UnifiedBaseRecordSchema.extend({
  id: z.string(),
  name: z.string(),
  stages: z.array(UnifiedPipelineStageSchema),
});
