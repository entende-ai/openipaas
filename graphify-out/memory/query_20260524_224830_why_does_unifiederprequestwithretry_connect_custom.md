---
type: "query"
date: "2026-05-24T22:48:30.430279+00:00"
question: "Why does unifiedErpRequestWithRetry connect Customer API communities?"
contributor: "graphify"
source_nodes: ["unifiedErpRequestWithRetry", "customerIdHandler", "bulkActivateHandler", "bulkDeactivateHandler", "bulkDeleteHandler", "connectedAccountHandler", "legacyHandler", "productIdHandler", "brandsHandler", "categoriesHandler"]
---

# Q: Why does unifiedErpRequestWithRetry connect Customer API communities?

## Answer

The graph shows unifiedErpRequestWithRetry as a bridge because the same retry helper in src/lib/unified-api-utils.ts is called by many customer and product route handlers, while also delegating to ContaAzulProvider.request via contaAzulRequest. This makes it the shared transport/retry layer between route-level API handlers and the Conta Azul provider implementation.

## Source Nodes

- unifiedErpRequestWithRetry
- customerIdHandler
- bulkActivateHandler
- bulkDeactivateHandler
- bulkDeleteHandler
- connectedAccountHandler
- legacyHandler
- productIdHandler
- brandsHandler
- categoriesHandler
- cestHandler
- ncmHandler
- unitsHandler
- ContaAzulProvider.request