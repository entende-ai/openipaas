# Requirements: Open iPaaS

**Defined:** 2026-05-24
**Core Value:** Developers can integrate once against a stable unified API while Open iPaaS handles provider-specific authentication, data mapping, errors, and connector differences behind the scenes.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Connections
- [ ] **CONN-01**: User can create a linked account (connection) for a provider via the dashboard or API
- [ ] **CONN-02**: User can view, update, and revoke a linked account's credentials and metadata
- [ ] **CONN-03**: System validates linked account credentials during creation and marks connection status (valid/invalid)
- [ ] **CONN-04**: System provides a secure way to store API keys (hashed) and provider secrets (encrypted) in the database
- [ ] **CONN-05**: System supports OAuth2 authorization code flow with PKCE and secure state (nonce, signature, expiry) for providers that require it

### Resources (Customers, Products, Orders/Sales)
- [ ] **RES-01**: Unified API returns stable, normalized customer objects with predictable fields regardless of provider
- [ ] **RES-02**: Unified API returns stable, normalized product objects with predictable fields regardless of provider
- [ ] **RES-03**: Unified API returns stable, normalized order/sales objects with predictable fields regardless of provider
- [ ] **RES-04**: Each unified resource includes provider-specific metadata in a controlled extension point (not raw payload by default)
- [ ] **RES-05**: Unified API supports pagination using a consistent cursor-based model across providers
- [ ] **RES-06**: Unified API supports filtering by common fields (e.g., created_after, updated_after, status) where providers support it

### Contract & Validation
- [ ] **CONT-01**: Unified API request bodies and query parameters are validated via Zod schemas before reaching provider code
- [ ] **CONT-02**: Unified API returns a predictable error envelope with stable public error codes, correlation IDs, and sanitized messages
- [ ] **CONT-03**: Unified API distinguishes between client errors (4xx), server errors (5xx), and provider-specific errors via mapping
- [ ] **CONT-04**: OpenAPI documentation is generated from canonical schemas and provider capability metadata, ensuring alignment with runtime behavior
- [ ] **CONT-05**: Unsupported operations return a deterministic 501 error with a clear capability-based message before provider invocation

### Provider Extensibility & Onboarding
- [ ] **EXT-01**: Adding a new provider involves generating a scaffold (metadata, adapter, mapper, tests) via a CLI script
- [ ] **EXT-02**: Generated provider scaffold includes explicit unsupported-method behavior (returns 501) until implemented
- [ ] **EXT-03**: Provider registration is automated or clearly guided; the provider factory discovers new providers via a registry
- [ ] **EXT-04**: Provider capabilities (resources, operations, auth modes) are declared in metadata and used by docs and runtime checks
- [ ] **EXT-05**: Provider metadata includes required fields, rate limits, known limitations, and documentation URLs

### Security
- [ ] **SEC-01**: API keys are stored as salted hashes; full key is shown only once at creation
- [ ] **SEC-02**: OAuth access and refresh tokens, provider client secrets, and other credentials are encrypted at rest
- [ ] **SEC-03**: Dashboard and administrative actions require authenticated admin authorization (RBAC)
- [ ] **SEC-04**: Audit logs record credential access, connection changes, and API key usage with correlation IDs
- [ ] **SEC-05**: Provider error responses and raw upstream payloads are not returned to API consumers by default; they are logged internally with redaction

### Dashboard & Operations
- [ ] **DASH-01**: Authenticated admin can access the dashboard to manage clients, linked accounts, API keys, and provider credentials
- [ ] **DASH-02**: Authenticated admin can test unified API routes for a given linked account and view responses
- [ ] **DASH-03**: Dashboard displays connection status (valid/invalid, last checked) and basic health indicators
- [ ] **DASH-04**: Dashboard redacts sensitive values (API keys, tokens) in tables and detail views
- [ ] **DASH-05**: Admin can invoke provider capability discovery and metadata refresh from the dashboard

### Observability
- [ ] **OBS-01**: Each API request includes a correlation ID that is logged and returned in response headers
- [ ] **OBS-02**: System logs provider, connection, route, status, latency, and error code for every request (with secret redaction)
- [ ] **OBS-03**: Failed provider requests are logged with mapped public error and internal diagnostic info (without leaking secrets)
- [ ] **OBS-04**: Metrics endpoint exposes request counts, error rates, and latency histograms (optional for v1)

## v2 Requirements
Deferred to future release. Tracked but not in current roadmap.

### Workflow Automation
- **WF-01**: Users can define multi-step workflows (triggers, actions) across connected apps
- **WF-02**: Visual workflow builder for non-technical users

### Marketplace & Discovery
- **MP-01**: Public connector marketplace with ratings, documentation, and installation instructions
- **MP-01**: Self-service tenant portal for customers to manage their own integrations

### Advanced Sync
- **SY-01**: Bidirectional sync with conflict detection and resolution
- **SY-02**: Real-time webhook subscription and delivery for supported providers

### AI & Extensions
- **AI-01**: Exposing provider operations as callable tools for AI agents (MCP/tool-calling)
- **AI-01**: Embedded connection UI (drop-in) for SaaS products

## Out of Scope
Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Native mobile applications | The current value is API/platform infrastructure, not a mobile client. |
| Replacing provider systems of record | Open iPaaS normalizes access to external systems; it is not the source ERP/CRM/commerce database. |
| Fully no-code workflow builder in v1 | Distracts from stable unified API, security, connectors, and docs; can be added later after API primitives are reliable. |
| Connector marketplace in v1 | Requires proven connector quality, security, docs, and support first; premature marketplace creates trust debt. |
| Real-time sync for every provider at launch | Many ERPs/apps lack reliable webhooks; forces polling complexity and false promises. Support webhooks where available, otherwise incremental reads later. |
| Public self-service admin portal before auth/RBAC/audit | Exposing admin actions without solid authentication/authorization is a serious security risk. |
| Raw upstream payloads returned by default | Can leak PII/secrets, bloat responses, and undermine unified contract; hide by default, expose redacted debug/raw behind explicit flags. |
| Dynamic arbitrary provider proxy as primary API | Bypasses normalization, observability, security controls, and product differentiation; add audited passthrough later for advanced users. |

## Traceability
Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONN-01 | Phase 1 | Pending |
| CONN-02 | Phase 1 | Pending |
| CONN-03 | Phase 1 | Pending |
| CONN-04 | Phase 1 | Pending |
| CONN-05 | Phase 1 | Pending |
| RES-01 | Phase 2 | Pending |
| RES-02 | Phase 2 | Pending |
| RES-03 | Phase 2 | Pending |
| RES-04 | Phase 2 | Pending |
| RES-05 | Phase 2 | Pending |
| RES-06 | Phase 2 | Pending |
| CONT-01 | Phase 2 | Pending |
| CONT-02 | Phase 3 | Pending |
| CONT-03 | Phase 3 | Pending |
| CONT-04 | Phase 3 | Pending |
| CONT-05 | Phase 1 | Pending |
| EXT-01 | Phase 1 | Pending |
| EXT-02 | Phase 1 | Pending |
| EXT-03 | Phase 1 | Pending |
| EXT-04 | Phase 1 | Pending |
| EXT-05 | Phase 1 | Pending |
| SEC-01 | Phase 4 | Pending |
| SEC-02 | Phase 4 | Pending |
| SEC-03 | Phase 4 | Pending |
| SEC-04 | Phase 4 | Pending |
| SEC-05 | Phase 4 | Pending |
| DASH-01 | Phase 5 | Pending |
| DASH-02 | Phase 5 | Pending |
| DASH-03 | Phase 5 | Pending |
| DASH-04 | Phase 5 | Pending |
| DASH-05 | Phase 5 | Pending |
| OBS-01 | Phase 6 | Pending |
| OBS-02 | Phase 6 | Pending |
| OBS-03 | Phase 6 | Pending |
| OBS-04 | Phase 6 | Pending |

**Coverage:**
- v1 requirements: 26 total
- Mapped to phases: 26
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-24*
*Last updated: 2026-05-24 after initial definition*
