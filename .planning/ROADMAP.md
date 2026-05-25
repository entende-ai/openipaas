# Roadmap: Open iPaaS

**Defined:** 2026-05-24
**Structure:** Horizontal Layers (technical layers)
**Current Focus:** Phase 1

## Phase 1: Foundation and Extensibility
**Goal:** Set up the core extensibility mechanism for providers and basic connection management.

### Requirements
- CONN-01: User can create a linked account (connection) for a provider via the dashboard or API
- CONN-02: User can view, update, and revoke a linked account's credentials and metadata
- CONN-03: System validates linked account credentials during creation and marks connection status (valid/invalid)
- CONN-04: System provides a secure way to store API keys (hashed) and provider secrets (encrypted) in the database
- CONN-05: System supports OAuth2 authorization code flow with PKCE and secure state (nonce, signature, expiry) for providers that require it
- EXT-01: Adding a new provider involves generating a scaffold (metadata, adapter, mapper, tests) via a CLI script
- EXT-02: Generated provider scaffold includes explicit unsupported-method behavior (returns 501) until implemented
- EXT-03: Provider registration is automated or clearly guided; the provider factory discovers new providers via a registry
- EXT-04: Provider capabilities (resources, operations, auth modes) are declared in metadata and used by docs and runtime checks
- EXT-05: Provider metadata includes required fields, rate limits, known limitations, and documentation URLs
- CONT-05: Unsupported operations return a deterministic 501 error with a clear capability-based message before provider invocation

### Success Criteria
- [ ] Users can create a linked account for a provider via the dashboard or API
- [ ] System validates credentials and marks connection status
- [ ] Adding a new provider involves generating a scaffold and the provider is automatically registered
- [ ] Unsupported operations return a deterministic 501 error
- [ ] Provider capabilities are declared in metadata

## Phase 2: Core Resources and Validation
**Goal:** Stabilize the unified API for core resources (customers, products, orders/sales) and add request validation.

### Requirements
- RES-01: Unified API returns stable, normalized customer objects with predictable fields regardless of provider
- RES-02: Unified API returns stable, normalized product objects with predictable fields regardless of provider
- RES-03: Unified API returns stable, normalized order/sales objects with predictable fields regardless of provider
- RES-04: Each unified resource includes provider-specific metadata in a controlled extension point (not raw payload by default)
- RES-05: Unified API supports pagination using a consistent cursor-based model across providers
- RES-06: Unified API supports filtering by common fields (e.g., created_after, updated_after, status) where providers support it
- CONT-01: Unified API request bodies and query parameters are validated via Zod schemas before reaching provider code

### Success Criteria
- [ ] Unified API returns stable, normalized objects for core resources
- [ ] Each unified resource includes provider-specific metadata in a controlled extension point
- [ ] Unified API supports pagination and filtering
- [ ] All unified API request bodies and query parameters are validated via Zod schemas

## Phase 3: Error Handling and Documentation Alignment
**Goal:** Improve error handling and ensure OpenAPI documentation matches runtime behavior.

### Requirements
- CONT-02: Unified API returns a predictable error envelope with stable public error codes, correlation IDs, and sanitized messages
- CONT-03: Unified API distinguishes between client errors (4xx), server errors (5xx), and provider-specific errors via mapping
- CONT-04: OpenAPI documentation is generated from canonical schemas and provider capability metadata, ensuring alignment with runtime behavior

### Success Criteria
- [ ] Unified API returns a predictable error envelope with stable public error codes
- [ ] Distinguishes between client errors, server errors, and provider-specific errors
- [ ] OpenAPI documentation is generated from canonical schemas and provider capability metadata

## Phase 4: Security Hardening
**Goal:** Harden authentication, credential storage, and audit logging.

### Requirements
- SEC-01: API keys are stored as salted hashes; full key is shown only once at creation
- SEC-02: OAuth access and refresh tokens, provider client secrets, and other credentials are encrypted at rest
- SEC-03: Dashboard and administrative actions require authenticated admin authorization (RBAC)
- SEC-04: Audit logs record credential access, connection changes, and API key usage with correlation IDs
- SEC-05: Provider error responses and raw upstream payloads are not returned to API consumers by default; they are logged internally with redaction

### Success Criteria
- [ ] API keys are stored as salted hashes and shown only once at creation
- [ ] OAuth tokens and provider secrets are encrypted at rest
- [ ] Dashboard and administrative actions require authenticated admin authorization
- [ ] Audit logs record credential access and API key usage
- [ ] Provider error responses and raw upstream payloads are not returned to API consumers by default

## Phase 5: Dashboard and Operations
**Goal:** Make the dashboard usable and safe for internal operations.

### Requirements
- DASH-01: Authenticated admin can access the dashboard to manage clients, linked accounts, API keys, and provider credentials
- DASH-02: Authenticated admin can test unified API routes for a given linked account and view responses
- DASH-03: Dashboard displays connection status (valid/invalid, last checked) and basic health indicators
- DASH-04: Dashboard redacts sensitive values (API keys, tokens) in tables and detail views
- DASH-05: Admin can invoke provider capability discovery and metadata refresh from the dashboard

### Success Criteria
- [ ] Authenticated admin can access the dashboard to manage clients, linked accounts, API keys, and provider credentials
- [ ] Authenticated admin can test unified API routes for a given linked account and view responses
- [ ] Dashboard displays connection status and health indicators
- [ ] Dashboard redacts sensitive values
- [ ] Admin can invoke provider capability discovery and metadata refresh

## Phase 6: Observability
**Goal:** Add logging, tracing, and metrics for observability.

### Requirements
- OBS-01: Each API request includes a correlation ID that is logged and returned in response headers
- OBS-02: System logs provider, connection, route, status, latency, and error code for every request (with secret redaction)
- OBS-03: Failed provider requests are logged with mapped public error and internal diagnostic info (without leaking secrets)
- OBS-04: Metrics endpoint exposes request counts, error rates, and latency histograms (optional for v1)

### Success Criteria
- [ ] Each API request includes a correlation ID that is logged and returned in response headers
- [ ] System logs provider, connection, route, status, latency, and error code for every request (with secret redaction)
- [ ] Failed provider requests are logged with mapped public error and internal diagnostic info
- [ ] Metrics endpoint exposes request counts, error rates, and latency histograms

--- 
*Roadmap defined: 2026-05-24*
*Last updated: 2026-05-24 after initial definition*
