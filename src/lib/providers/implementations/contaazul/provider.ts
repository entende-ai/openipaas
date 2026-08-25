import { BaseProvider } from '@/lib/providers/core/BaseProvider';
import { readPage, nextPageCursor } from '@/lib/providers/core/pagination';
import { ProviderError } from '@/lib/providers/core/errors';
import type {
  BulkResult,
  CustomerModule,
  ListParams,
  Page,
  ProductModule,
  ProviderContext,
  ProviderManifest,
  SalesModule,
} from '@/lib/providers/core/types';
import type {
  UnifiedBrand,
  UnifiedCategory,
  UnifiedCustomer,
  UnifiedProduct,
  UnifiedSale,
  UnifiedSeller,
  UnifiedUnit,
} from '@/types/unified';

import { contaAzulManifest } from './manifest';
import { mapContaAzulCustomerToUnified } from './mappers/customers';
import {
  mapContaAzulBrandToUnified,
  mapContaAzulCategoryToUnified,
  mapContaAzulProductToUnified,
  mapContaAzulUnitToUnified,
  mapUnifiedToContaAzulProductCreate,
  mapUnifiedToContaAzulProductPatch,
} from './mappers/products';
import { mapCADetailSaleToUnified, mapCAListSaleToUnified, mapCASellerToUnified } from './mappers/sales';

const DEFAULT_PAGE_SIZE = 50;

/** Conta Azul paginates with `pagina` / `tamanho_pagina` and returns `items`. */
function paged(params: ListParams) {
  const page = readPage(params.cursor);
  const size = Number(params.limit) > 0 ? Number(params.limit) : DEFAULT_PAGE_SIZE;
  return { page, size, query: { pagina: page, tamanho_pagina: size, busca_textual: params.search } };
}

function itemsOf(payload: any): any[] {
  if (!payload) return [];
  return Array.isArray(payload) ? payload : payload.items ?? [];
}

function totalOf(payload: any, fallback: number): number {
  return payload?.total_items ?? payload?.totalItems ?? fallback;
}

export class ContaAzulProvider extends BaseProvider implements CustomerModule, ProductModule, SalesModule {
  readonly manifest: ProviderManifest = contaAzulManifest;

  /* ------------------------------------------------------ customers */

  async listCustomers(ctx: ProviderContext, params: ListParams): Promise<Page<UnifiedCustomer>> {
    this.assertSupports('customers', 'list');
    const { page, size, query } = paged(params);
    const data = await this.request(ctx, { method: 'GET', path: '/pessoas', query });

    const raw = itemsOf(data);
    const totalItems = totalOf(data, raw.length);
    return this.page(raw.map(mapContaAzulCustomerToUnified), {
      totalItems,
      nextCursor: nextPageCursor(page, raw.length, size, totalItems),
    });
  }

  async getCustomer(ctx: ProviderContext, id: string): Promise<UnifiedCustomer> {
    this.assertSupports('customers', 'get');
    const data = await this.request(ctx, { method: 'GET', path: `/pessoas/${encodeURIComponent(id)}` });
    return mapContaAzulCustomerToUnified(data);
  }

  async updateCustomer(ctx: ProviderContext, id: string, data: Partial<UnifiedCustomer>): Promise<UnifiedCustomer> {
    this.assertSupports('customers', 'update');
    const updated = await this.request(ctx, {
      method: 'PUT',
      path: `/pessoas/${encodeURIComponent(id)}`,
      body: data,
    });
    return mapContaAzulCustomerToUnified(updated);
  }

  /** Legacy-id lookup. Returned raw: it has no unified counterpart. */
  async getCustomerByLegacyId(ctx: ProviderContext, id: string): Promise<unknown> {
    return this.request(ctx, { method: 'GET', path: `/pessoas/legado/${encodeURIComponent(id)}` });
  }

  async getConnectedAccount(ctx: ProviderContext): Promise<unknown> {
    return this.request(ctx, { method: 'GET', path: '/pessoas/conta-conectada' });
  }

  async bulkActivateCustomers(ctx: ProviderContext, ids: string[]): Promise<BulkResult> {
    this.assertSupports('customers', 'bulkActivate');
    return this.bulkCustomerAction(ctx, '/pessoas/ativar', ids);
  }

  async bulkDeactivateCustomers(ctx: ProviderContext, ids: string[]): Promise<BulkResult> {
    this.assertSupports('customers', 'bulkDeactivate');
    return this.bulkCustomerAction(ctx, '/pessoas/inativar', ids);
  }

  async bulkDeleteCustomers(ctx: ProviderContext, ids: string[]): Promise<BulkResult> {
    this.assertSupports('customers', 'bulkDelete');
    return this.bulkCustomerAction(ctx, '/pessoas/excluir', ids);
  }

  private async bulkCustomerAction(ctx: ProviderContext, path: string, ids: string[]): Promise<BulkResult> {
    assertIds(ids);
    const data = await this.request(ctx, { method: 'POST', path, body: { ids } });
    return { processedCount: data?.atualizados ?? 0, ignoredCount: data?.ignorados ?? 0 };
  }

  /* ------------------------------------------------------ products */

  async listProducts(ctx: ProviderContext, params: ListParams): Promise<Page<UnifiedProduct>> {
    this.assertSupports('products', 'list');
    const { page, size, query } = paged(params);
    const data = await this.request(ctx, { method: 'GET', path: '/produtos', query });

    const raw = itemsOf(data);
    const totalItems = totalOf(data, raw.length);
    return this.page(raw.map(mapContaAzulProductToUnified), {
      totalItems,
      nextCursor: nextPageCursor(page, raw.length, size, totalItems),
    });
  }

  async getProduct(ctx: ProviderContext, id: string): Promise<UnifiedProduct> {
    this.assertSupports('products', 'get');
    const data = await this.request(ctx, { method: 'GET', path: `/produtos/${encodeURIComponent(id)}` });
    return mapContaAzulProductToUnified(data);
  }

  async createProduct(ctx: ProviderContext, data: Partial<UnifiedProduct>): Promise<UnifiedProduct> {
    this.assertSupports('products', 'create');
    const created = await this.request(ctx, {
      method: 'POST',
      path: '/produtos',
      body: mapUnifiedToContaAzulProductCreate(data),
    });
    return mapContaAzulProductToUnified(created);
  }

  async updateProduct(ctx: ProviderContext, id: string, data: Partial<UnifiedProduct>): Promise<UnifiedProduct> {
    this.assertSupports('products', 'update');
    const updated = await this.request(ctx, {
      method: 'PATCH',
      path: `/produtos/${encodeURIComponent(id)}`,
      body: mapUnifiedToContaAzulProductPatch(data),
    });
    // PATCH can answer 204 with no body; re-read so callers always get the record.
    return updated ? mapContaAzulProductToUnified(updated) : this.getProduct(ctx, id);
  }

  async deleteProduct(ctx: ProviderContext, id: string): Promise<void> {
    this.assertSupports('products', 'delete');
    await this.request(ctx, { method: 'DELETE', path: `/produtos/${encodeURIComponent(id)}` });
  }

  async listCategories(ctx: ProviderContext, params: ListParams): Promise<Page<UnifiedCategory>> {
    this.assertSupports('categories', 'list');
    return this.listSimple(ctx, '/produtos/categorias', params, mapContaAzulCategoryToUnified);
  }

  async listBrands(ctx: ProviderContext, params: ListParams): Promise<Page<UnifiedBrand>> {
    this.assertSupports('brands', 'list');
    return this.listSimple(ctx, '/produtos/ecommerce-marcas', params, mapContaAzulBrandToUnified);
  }

  async listUnits(ctx: ProviderContext, params: ListParams): Promise<Page<UnifiedUnit>> {
    this.assertSupports('units', 'list');
    return this.listSimple(ctx, '/produtos/unidades-medida', params, mapContaAzulUnitToUnified);
  }

  /** NCM and CEST are fiscal reference tables with no unified counterpart. */
  async listNcm(ctx: ProviderContext, params: ListParams): Promise<unknown> {
    return this.request(ctx, { method: 'GET', path: '/produtos/ncm', query: { busca_textual: params.search } });
  }

  async listCest(ctx: ProviderContext, params: ListParams): Promise<unknown> {
    return this.request(ctx, { method: 'GET', path: '/produtos/cest', query: { busca_textual: params.search } });
  }

  private async listSimple<T>(
    ctx: ProviderContext,
    path: string,
    params: ListParams,
    map: (raw: any) => T
  ): Promise<Page<T>> {
    const { page, size, query } = paged(params);
    const data = await this.request(ctx, { method: 'GET', path, query });
    const raw = itemsOf(data);
    const totalItems = totalOf(data, raw.length);
    return this.page(raw.map(map), {
      totalItems,
      nextCursor: nextPageCursor(page, raw.length, size, totalItems),
    });
  }

  /* ------------------------------------------------------ sales */

  async listSales(ctx: ProviderContext, params: ListParams): Promise<Page<UnifiedSale>> {
    this.assertSupports('sales', 'list');
    const { page, size, query } = paged(params);
    const data = await this.request(ctx, { method: 'GET', path: '/venda/busca', query });

    const raw: any[] = data?.itens ?? [];
    const totalItems = data?.total_itens ?? raw.length;
    return this.page(raw.map(mapCAListSaleToUnified), {
      totalItems,
      nextCursor: nextPageCursor(page, raw.length, size, totalItems),
    });
  }

  async getSale(ctx: ProviderContext, id: string): Promise<UnifiedSale> {
    this.assertSupports('sales', 'get');
    const safeId = encodeURIComponent(id);
    const [sale, items] = await Promise.all([
      this.request(ctx, { method: 'GET', path: `/venda/${safeId}` }),
      this.request(ctx, { method: 'GET', path: `/venda/${safeId}/itens` }).catch(() => ({ itens: [] })),
    ]);
    return mapCADetailSaleToUnified(sale, items?.itens ?? []);
  }

  async getSalePdf(ctx: ProviderContext, id: string): Promise<ArrayBuffer> {
    this.assertSupports('sales', 'pdf');
    return this.requestBinary(ctx, { method: 'GET', path: `/venda/${encodeURIComponent(id)}/imprimir` });
  }

  async bulkDeleteSales(ctx: ProviderContext, ids: string[]): Promise<BulkResult> {
    this.assertSupports('sales', 'bulkDelete');
    assertIds(ids);
    const data = await this.request(ctx, { method: 'POST', path: '/venda/exclusao-lote', body: { ids } });
    return { processedCount: data?.atualizados ?? 0, ignoredCount: data?.ignorados ?? 0 };
  }

  async listSellers(ctx: ProviderContext, _params: ListParams): Promise<Page<UnifiedSeller>> {
    this.assertSupports('sellers', 'list');
    const data = await this.request(ctx, { method: 'GET', path: '/venda/vendedores' });
    const raw: any[] = Array.isArray(data) ? data : itemsOf(data);
    return this.page(raw.map(mapCASellerToUnified), { totalItems: raw.length });
  }
}

function assertIds(ids: unknown): asserts ids is string[] {
  if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== 'string')) {
    throw new ProviderError('INVALID_REQUEST', 'Field "ids" must be a non-empty array of strings.');
  }
}
