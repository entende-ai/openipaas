# Graph Report - .  (2026-05-24)

## Corpus Check
- Corpus is ~20,504 words - fits in a single context window. You may not need a graph.

## Summary
- 732 nodes · 1111 edges · 67 communities (47 shown, 20 thin omitted)
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 65 edges (avg confidence: 0.82)
- Token cost: 21,300 input · 9,900 output

## Community Hubs (Navigation)
- [[_COMMUNITY_OAuth Integration|OAuth Integration]]
- [[_COMMUNITY_Customer API|Customer API]]
- [[_COMMUNITY_Customer API|Customer API]]
- [[_COMMUNITY_Dashboard UI|Dashboard UI]]
- [[_COMMUNITY_Dashboard UI|Dashboard UI]]
- [[_COMMUNITY_Customer API|Customer API]]
- [[_COMMUNITY_Sales API|Sales API]]
- [[_COMMUNITY_Customer API|Customer API]]
- [[_COMMUNITY_Customer API|Customer API]]
- [[_COMMUNITY_Components Aliases|Components Aliases]]
- [[_COMMUNITY_Product API|Product API]]
- [[_COMMUNITY_Allowjs Compileroptions|Allowjs Compileroptions]]
- [[_COMMUNITY_Client Management|Client Management]]
- [[_COMMUNITY_Database Access|Database Access]]
- [[_COMMUNITY_Customer API|Customer API]]
- [[_COMMUNITY_Mapper Tests|Mapper Tests]]
- [[_COMMUNITY_OAuth Integration|OAuth Integration]]
- [[_COMMUNITY_Customer API|Customer API]]
- [[_COMMUNITY_Customer API|Customer API]]
- [[_COMMUNITY_Database Access|Database Access]]
- [[_COMMUNITY_Codecomparison Demoicons|Codecomparison Demoicons]]
- [[_COMMUNITY_Product API|Product API]]
- [[_COMMUNITY_Next.js Assets|Next.js Assets]]
- [[_COMMUNITY_Mapper Tests|Mapper Tests]]
- [[_COMMUNITY_Customer API|Customer API]]
- [[_COMMUNITY_Theme System|Theme System]]
- [[_COMMUNITY_Integration Logos|Integration Logos]]
- [[_COMMUNITY_Integration Logos|Integration Logos]]
- [[_COMMUNITY_Integration Logos|Integration Logos]]
- [[_COMMUNITY_Dashboard UI|Dashboard UI]]
- [[_COMMUNITY_OpenAPI Docs|OpenAPI Docs]]
- [[_COMMUNITY_Database Access|Database Access]]
- [[_COMMUNITY_Integration Logos|Integration Logos]]
- [[_COMMUNITY_Tailwind Configuration|Tailwind Configuration]]
- [[_COMMUNITY_Integration Logos|Integration Logos]]
- [[_COMMUNITY_Document Content|Document Content]]
- [[_COMMUNITY_Integration Logos|Integration Logos]]
- [[_COMMUNITY_Integration Logos|Integration Logos]]
- [[_COMMUNITY_Omie Provider|Omie Provider]]
- [[_COMMUNITY_Opencode Plugin|Opencode Plugin]]
- [[_COMMUNITY_Dependencies Opencode|Dependencies Opencode]]
- [[_COMMUNITY_Database Access|Database Access]]
- [[_COMMUNITY_Window Asset|Window Asset]]
- [[_COMMUNITY_Sales API|Sales API]]
- [[_COMMUNITY_Integration Logos|Integration Logos]]
- [[_COMMUNITY_Integration Logos|Integration Logos]]
- [[_COMMUNITY_Middleware Config|Middleware Config]]
- [[_COMMUNITY_Integration Logos|Integration Logos]]
- [[_COMMUNITY_Integration Logos|Integration Logos]]
- [[_COMMUNITY_Integration Logos|Integration Logos]]
- [[_COMMUNITY_Customer API|Customer API]]
- [[_COMMUNITY_Calistagemvendasresponse Cavendalistagem|Calistagemvendasresponse Cavendalistagem]]
- [[_COMMUNITY_Config Eslint|Config Eslint]]
- [[_COMMUNITY_Globe Asset|Globe Asset]]
- [[_COMMUNITY_Dashboard UI|Dashboard UI]]
- [[_COMMUNITY_Next.js Assets|Next.js Assets]]
- [[_COMMUNITY_Integration Logos|Integration Logos]]
- [[_COMMUNITY_Config Mjs|Config Mjs]]
- [[_COMMUNITY_Docker Entrypoint|Docker Entrypoint]]
- [[_COMMUNITY_Class Components|Class Components]]
- [[_COMMUNITY_Mapper Tests|Mapper Tests]]
- [[_COMMUNITY_Next.js Assets|Next.js Assets]]
- [[_COMMUNITY_Dependencies Runtime|Dependencies Runtime]]
- [[_COMMUNITY_Dependency Opencode|Dependency Opencode]]
- [[_COMMUNITY_Next.js Assets|Next.js Assets]]

## God Nodes (most connected - your core abstractions)
1. `cn()` - 46 edges
2. `unifiedErpRequestWithRetry()` - 28 edges
3. `UnifiedAuthContext` - 20 edges
4. `withUnifiedAuth()` - 20 edges
5. `compilerOptions` - 16 edges
6. `UnifiedListResponse` - 15 edges
7. `UnifiedSale` - 12 edges
8. `unifiedErpRequestWithRetry` - 12 edges
9. `scripts` - 11 edges
10. `OmieProvider` - 11 edges

## Surprising Connections (you probably didn't know these)
- `Graphify Workflow Rules` --conceptually_related_to--> `Graphify OpenCode Plugin`  [INFERRED]
  AGENTS.md → .opencode/plugins/graphify.js
- `Root Metadata` --references--> `Open IpaaS`  [EXTRACTED]
  src/app/layout.tsx → README.md
- `Mock Linked Accounts Seed` --shares_data_with--> `Docker DATABASE_URL`  [INFERRED]
  prisma/seed.ts → docker-compose.yml
- `tool.execute.before Hook` --conceptually_related_to--> `Graphify Workflow Rules`  [EXTRACTED]
  .opencode/plugins/graphify.js → AGENTS.md
- `CodeComparison Component` --conceptually_related_to--> `English-First Architecture`  [EXTRACTED]
  src/app/page.tsx → README.md

## Hyperedges (group relationships)
- **Open IpaaS Architecture Flow** — readme_open_ipaas, readme_provider_factory, readme_saas_provider_plugin, readme_zod_shield, readme_universal_b2b_integrations [EXTRACTED 1.00]
- **Dockerized Development Environment** — docker_compose_postgres_service, docker_compose_web_service, docker_entrypoint_database_bootstrap, package_prisma_seed_config, seed_prisma_seed_main [INFERRED 0.86]
- **Landing Page Marketing Concepts** — page_landingpage, page_codecomparison, page_featurecard, readme_english_first_architecture, readme_zod_shield, readme_universal_plugin_architecture [EXTRACTED 1.00]
- **Unified Auth Wrapped Routes** — customers_route_customersHandler, customer_id_route_customerIdHandler, bulk_activate_route_bulkActivateHandler, bulk_deactivate_route_bulkDeactivateHandler, bulk_delete_route_bulkDeleteHandler, connected_account_route_connectedAccountHandler, legacy_customer_route_legacyHandler, products_route_productsHandler, product_id_route_productIdHandler, brands_route_brandsHandler, categories_route_categoriesHandler, cest_route_cestHandler, ncm_route_ncmHandler, units_route_unitsHandler, sales_route_salesHandler, sale_id_route_saleDetailHandler, sale_pdf_route_salePdfHandler, sales_bulk_route_bulkDeleteSalesHandler, api_auth_withUnifiedAuth [EXTRACTED 1.00]
- **Conta Azul Retry Endpoint Routes** — customer_id_route_customerIdHandler, bulk_activate_route_bulkActivateHandler, bulk_deactivate_route_bulkDeactivateHandler, bulk_delete_route_bulkDeleteHandler, connected_account_route_connectedAccountHandler, legacy_customer_route_legacyHandler, product_id_route_productIdHandler, brands_route_brandsHandler, categories_route_categoriesHandler, cest_route_cestHandler, ncm_route_ncmHandler, units_route_unitsHandler, unified_api_utils_unifiedErpRequestWithRetry [EXTRACTED 1.00]
- **Provider Factory Resource Routes** — customers_route_customersHandler, products_route_productsHandler, sales_route_salesHandler, sale_id_route_saleDetailHandler, sale_pdf_route_salePdfHandler, sales_bulk_route_bulkDeleteSalesHandler, provider_factory_getProvider [EXTRACTED 1.00]
- **Dashboard Admin Pages** — dashboard_layout, sidebar_navigation, clients_page, linked_accounts_page, logs_page [EXTRACTED 1.00]
- **Client API Key Management Flow** — clients_page, create_client_dialog, create_client_dialog_on_submit, client_action_create_client, generate_key_button, generate_key_button_handle_generate, client_action_generate_api_key [EXTRACTED 1.00]
- **Linked Account Unified API Flow** — linked_accounts_page, connect_erp_dialog, oauth_action_get_conta_azul_auth_url, copy_token_button, test_api_dialog, test_api_action_test_unified_api, route_sellers_handler [INFERRED 0.82]
- **Unified Provider Implementations** — providers_iunified_provider, contaazul_provider, omie_provider, tiny_provider [EXTRACTED 1.00]
- **Customer Mapping Validation Flow** — contaazul_map_customer, omie_customers_map_customer, validations_unified_schemas, customers_mapper_tests [INFERRED 0.90]
- **Unified API Provider Contract** — openapi_unified_api_spec, providers_iunified_provider, validations_unified_schemas, contaazul_provider, omie_provider [INFERRED 0.82]
- **Conta Azul Product Model Group** — contaazul_products_ContaAzulProduct, contaazul_products_ContaAzulProductCreate, contaazul_products_ContaAzulProductListResponse, unified_UnifiedProduct [INFERRED 0.86]
- **Conta Azul Sale Model Group** — contaazul_sales_CANegociacao, contaazul_sales_CACriacaoVendaRequest, contaazul_sales_CAObterVendaResponse, unified_UnifiedSale [INFERRED 0.86]
- **Unified Remote Data Records** — unified_UnifiedCustomer, unified_UnifiedProduct, unified_UnifiedSale, unified_UnifiedSeller, unified_UnifiedBaseRecord [EXTRACTED 1.00]
- **Generic File Icon Composition** — file_svg_generic_file_icon, file_svg_folded_corner_document_shape, file_svg_document_content_lines [EXTRACTED 1.00]
- **OpenIPAAS Logo Visual Identity** — logo_yellow_brand_identity, logo_black_app_container, logo_white_internal_marks, logo_upward_chevron_accent [EXTRACTED 1.00]

## Communities (67 total, 20 thin omitted)

### Community 0 - "OAuth Integration"
Cohesion: 0.06
Nodes (55): createClient(), generateApiKey(), getContaAzulAuthUrl(), testUnifiedApi(), ConnectErpDialog(), CopyTokenButton(), CreateClientDialog(), GenerateKeyButton() (+47 more)

### Community 1 - "Customer API"
Cohesion: 0.05
Nodes (47): bulkActivateHandler(), POST, brandsHandler(), GET, DELETE, POST, categoriesHandler(), GET (+39 more)

### Community 2 - "Customer API"
Cohesion: 0.11
Nodes (16): ContaAzulProvider, OmieProvider, TinyProvider, omieRequest(), mapOmieListToUnified(), OmieCustomer, OmieListCustomersResponse, mapContaAzulProductListToUnified() (+8 more)

### Community 3 - "Dashboard UI"
Cohesion: 0.06
Nodes (43): Badge Component, Button Component, Card Component Suite, createClient Action, generateApiKey Action, ClientsPage, Client findMany Query, ConnectErpDialog (+35 more)

### Community 4 - "Dashboard UI"
Cohesion: 0.06
Nodes (40): createClient Server Action, Dashboard Clients Path Revalidation, generateApiKey Server Action, Docker DATABASE_URL, Postgres Service, Web Service, Database Bootstrap Entrypoint, Logo Download Domains (+32 more)

### Community 5 - "Customer API"
Cohesion: 0.06
Nodes (38): withUnifiedAuth, brandsHandler, bulkActivateHandler, bulkDeactivateHandler, bulkDeleteHandler, categoriesHandler, cestHandler, connectedAccountHandler (+30 more)

### Community 6 - "Sales API"
Cohesion: 0.08
Nodes (28): mapCADetailSaleToUnified(), mapCAListSaleToUnified(), mapCASellerToUnified(), mapCAStatusToUnified(), mapUnifiedStatusToCA(), mapUnifiedToCARequest(), CACriacaoVendaRequest, CACriacaoVendaResponse (+20 more)

### Community 7 - "Customer API"
Cohesion: 0.09
Nodes (29): ContaAzulBrand, ContaAzulCEST, ContaAzulCategory, ContaAzulNCM, ContaAzulProduct, ContaAzulProductCreate, ContaAzulProductListResponse, ContaAzulUnit (+21 more)

### Community 8 - "Customer API"
Cohesion: 0.13
Nodes (24): Conta Azul Customer Mock, Conta Azul Customer Types, mapContaAzulCustomerToUnified, mapContaAzulListToUnified, mapPersonType, ContaAzulProvider, ContaAzulProvider.request, Customer Mapper Tests (+16 more)

### Community 9 - "Components Aliases"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 10 - "Product API"
Cohesion: 0.12
Nodes (18): mapContaAzulBrandToUnified(), mapContaAzulCategoryToUnified(), mapContaAzulUnitToUnified(), ContaAzulBrand, ContaAzulCategory, ContaAzulCEST, ContaAzulNCM, ContaAzulProduct (+10 more)

### Community 11 - "Allowjs Compileroptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 12 - "Client Management"
Cohesion: 0.10
Nodes (20): dependencies, @base-ui/react, class-variance-authority, clsx, framer-motion, lucide-react, next, next-themes (+12 more)

### Community 13 - "Database Access"
Cohesion: 0.14
Nodes (14): devDependencies, eslint, eslint-config-next, lightningcss, prisma, tailwindcss, @tailwindcss/postcss, tsx (+6 more)

### Community 14 - "Customer API"
Cohesion: 0.21
Nodes (10): customerIdHandler(), mapContaAzulCustomerToUnified(), mapContaAzulListToUnified(), mapPersonType(), result, mapOmieCustomerToUnified(), ContaAzulCustomer, ContaAzulPersonType (+2 more)

### Community 15 - "Mapper Tests"
Cohesion: 0.18
Nodes (11): scripts, build, db:down, db:up, dev, dev:docker, generate-provider, lint (+3 more)

### Community 16 - "OAuth Integration"
Cohesion: 0.20
Nodes (11): Conta Azul OAuth Callback GET, Conta Azul OAuth token endpoint, connectErpAccount, NextResponse.redirect, getContaAzulAuthUrl, prisma.linkedAccount.create, prisma.linkedAccount.findFirst, prisma.linkedAccount.update (+3 more)

### Community 17 - "Customer API"
Cohesion: 0.18
Nodes (10): ContaAzulAddress, ContaAzulBillingContact, ContaAzulContact, ContaAzulCustomerCreate, ContaAzulCustomerUpdate, ContaAzulIEIndicator, ContaAzulInscription, ContaAzulListResponse (+2 more)

### Community 18 - "Customer API"
Cohesion: 0.20
Nodes (9): ativo, data_alteracao, data_criacao, documento, email, id, nome, telefone (+1 more)

### Community 19 - "Database Access"
Cohesion: 0.22
Nodes (8): name, optionalDependencies, @tailwindcss/oxide-linux-x64-gnu, prisma, seed, private, type, version

### Community 20 - "Codecomparison Demoicons"
Cohesion: 0.25
Nodes (3): demoIcons, FeatureCardProps, saasDomains

### Community 21 - "Product API"
Cohesion: 0.25
Nodes (7): UnifiedBaseRecordSchema, UnifiedBrandSchema, UnifiedCategorySchema, UnifiedInstallmentSchema, UnifiedProductSchema, UnifiedSaleItemSchema, UnifiedUnitSchema

### Community 22 - "Next.js Assets"
Cohesion: 0.29
Nodes (7): Graphify Workflow Rules, Next.js Agent Rules, CLAUDE Agents Reference, Graphify OpenCode Plugin, GraphifyPlugin Function, tool.execute.before Hook, Graphify Plugin Registration

### Community 23 - "Mapper Tests"
Cohesion: 0.29
Nodes (4): capitalizedName, lowerName, providerPath, testPath

### Community 24 - "Customer API"
Cohesion: 0.29
Nodes (6): cnpj_cpf, codigo_cliente, email, inativo, razao_social, telefone1_numero

### Community 25 - "Theme System"
Cohesion: 0.40
Nodes (3): inter, metadata, ThemeProvider()

### Community 26 - "Integration Logos"
Cohesion: 0.40
Nodes (5): __dirname, domains, downloadLogo(), __filename, run()

### Community 27 - "Integration Logos"
Cohesion: 0.50
Nodes (5): Black App Container Shape, OpenIPAAS Logo, Upward Chevron Accent, White Internal Marks, Yellow Brand Identity

### Community 28 - "Integration Logos"
Cohesion: 0.50
Nodes (4): Intuit, QuickBooks, QuickBooks Accounting Integration, QuickBooks Logo

### Community 31 - "Database Access"
Cohesion: 0.67
Nodes (3): UnifiedAuthContext, withUnifiedAuth, Prisma Singleton

### Community 32 - "Integration Logos"
Cohesion: 0.67
Nodes (3): Atlassian, Atlassian Logo, Atlassian Integration Provider

### Community 33 - "Tailwind Configuration"
Cohesion: 0.67
Nodes (3): shadcn UI Configuration, Tailwind CSS Variables, Tailwind PostCSS Plugin

### Community 34 - "Integration Logos"
Cohesion: 0.67
Nodes (3): Conta Azul Logo, Conta Azul, Conta Azul Integration

### Community 35 - "Document Content"
Cohesion: 0.67
Nodes (3): Document Content Lines, Folded Corner Document Shape, Generic File Icon

### Community 36 - "Integration Logos"
Cohesion: 0.67
Nodes (3): HubSpot, HubSpot Integration, HubSpot Logo

### Community 37 - "Integration Logos"
Cohesion: 0.67
Nodes (3): Nuvemshop, Nuvemshop Integration, Nuvemshop Logo

### Community 38 - "Omie Provider"
Cohesion: 0.67
Nodes (3): Omie, Omie Integration, Omie Logo

### Community 42 - "Window Asset"
Cohesion: 0.67
Nodes (3): Browser Window Icon, Window SVG Asset, Window UI Chrome

### Community 43 - "Sales API"
Cohesion: 0.67
Nodes (3): Salesforce CRM Integration, Salesforce, Salesforce Logo

### Community 44 - "Integration Logos"
Cohesion: 0.67
Nodes (3): E-commerce Integration, Shopify, Shopify Logo

### Community 45 - "Integration Logos"
Cohesion: 0.67
Nodes (3): Slack, Slack Integration, Slack Logo

### Community 47 - "Integration Logos"
Cohesion: 0.67
Nodes (3): Payment Integration, Stripe, Stripe Logo

### Community 48 - "Integration Logos"
Cohesion: 0.67
Nodes (3): Deployment Platform Branding, Vercel Logo, Vercel Platform

### Community 49 - "Integration Logos"
Cohesion: 0.67
Nodes (3): VTEX, VTEX Integration, VTEX Logo

### Community 50 - "Customer API"
Cohesion: 1.00
Nodes (3): Zendesk Logo, Zendesk, Zendesk Customer Support Integration

## Knowledge Gaps
- **312 isolated node(s):** `config`, `docker-entrypoint.sh script`, `name`, `version`, `type` (+307 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `unifiedErpRequestWithRetry()` connect `Customer API` to `Customer API`, `Customer API`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `mapContaAzulCustomerToUnified()` connect `Customer API` to `Customer API`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `config`, `docker-entrypoint.sh script`, `name` to the rest of the system?**
  _312 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `OAuth Integration` be split into smaller, more focused modules?**
  _Cohesion score 0.061128526645768025 - nodes in this community are weakly interconnected._
- **Should `Customer API` be split into smaller, more focused modules?**
  _Cohesion score 0.05473684210526316 - nodes in this community are weakly interconnected._
- **Should `Customer API` be split into smaller, more focused modules?**
  _Cohesion score 0.10726950354609929 - nodes in this community are weakly interconnected._
- **Should `Dashboard UI` be split into smaller, more focused modules?**
  _Cohesion score 0.05647840531561462 - nodes in this community are weakly interconnected._