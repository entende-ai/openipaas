import type { Operation, ResourceName } from './types';

/**
 * The one place that says which provider method serves which capability.
 *
 * The contract suite uses it to prove that manifests and implementations agree,
 * and the MCP server uses it to turn a capability matrix into callable tools.
 * A new resource method belongs here first: anything not listed is invisible to
 * both, which is the failure this map exists to prevent.
 */
export interface ResourceMethod {
  resource: ResourceName;
  operation: Operation;
}

export const RESOURCE_METHODS: Record<string, ResourceMethod> = {
  listCustomers: { resource: 'customers', operation: 'list' },
  getCustomer: { resource: 'customers', operation: 'get' },
  createCustomer: { resource: 'customers', operation: 'create' },
  updateCustomer: { resource: 'customers', operation: 'update' },
  bulkActivateCustomers: { resource: 'customers', operation: 'bulkActivate' },
  bulkDeactivateCustomers: { resource: 'customers', operation: 'bulkDeactivate' },
  bulkDeleteCustomers: { resource: 'customers', operation: 'bulkDelete' },
  listProducts: { resource: 'products', operation: 'list' },
  getProduct: { resource: 'products', operation: 'get' },
  createProduct: { resource: 'products', operation: 'create' },
  updateProduct: { resource: 'products', operation: 'update' },
  deleteProduct: { resource: 'products', operation: 'delete' },
  listCategories: { resource: 'categories', operation: 'list' },
  listBrands: { resource: 'brands', operation: 'list' },
  listUnits: { resource: 'units', operation: 'list' },
  listSales: { resource: 'sales', operation: 'list' },
  getSale: { resource: 'sales', operation: 'get' },
  createSale: { resource: 'sales', operation: 'create' },
  getSalePdf: { resource: 'sales', operation: 'pdf' },
  bulkDeleteSales: { resource: 'sales', operation: 'bulkDelete' },
  listSellers: { resource: 'sellers', operation: 'list' },
  listContacts: { resource: 'contacts', operation: 'list' },
  getContact: { resource: 'contacts', operation: 'get' },
  createContact: { resource: 'contacts', operation: 'create' },
  listCompanies: { resource: 'companies', operation: 'list' },
  getCompany: { resource: 'companies', operation: 'get' },
  createCompany: { resource: 'companies', operation: 'create' },
  listDeals: { resource: 'deals', operation: 'list' },
  getDeal: { resource: 'deals', operation: 'get' },
  createDeal: { resource: 'deals', operation: 'create' },
  listPipelines: { resource: 'pipelines', operation: 'list' },
};

/** The method that serves a capability, or undefined if nothing does. */
export function methodFor(resource: ResourceName, operation: Operation): string | undefined {
  return Object.keys(RESOURCE_METHODS).find(
    (method) => RESOURCE_METHODS[method].resource === resource && RESOURCE_METHODS[method].operation === operation
  );
}
