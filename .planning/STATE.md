# State: Open iPaaS

**Last Updated:** 2026-05-24
**Current Phase:** 1
**Roadmap:** .planning/ROADMAP.md
**Requirements:** .planning/REQUIREMENTS.md

## Current Focus
We are currently in **Phase 1: Foundation and Extensibility**.
The goal is to set up the core extensibility mechanism for providers and basic connection management.

## Phase Progress
### Phase 1: Foundation and Extensibility
- [ ] Users can create a linked account for a provider via the dashboard or API
- [ ] System validates credentials and marks connection status
- [ ] Adding a new provider involves generating a scaffold and the provider is automatically registered
- [ ] Unsupported operations return a deterministic 501 error
- [ ] Provider capabilities are declared in metadata

### Phase 2: Core Resources and Validation
- [ ] Unified API returns stable, normalized objects for core resources
- [ ] Each unified resource includes provider-specific metadata in a controlled extension point
- [ ] Unified API supports pagination and filtering
- [ ] All unified API request bodies and query parameters are validated via Zod schemas

### Phase 3: Error Handling and Documentation Alignment
- [ ] Unified API returns a predictable error envelope with stable public error codes
- [ ] Distinguishes between client errors, server errors, and provider-specific errors
- [ ] OpenAPI documentation is generated from canonical schemas and provider capability metadata

### Phase 4: Security Hardening
- [ ] API keys are stored as salted hashes and shown only once at creation
- [ ] OAuth tokens and provider secrets are encrypted at rest
- [ ] Dashboard and administrative actions require authenticated admin authorization
- [ ] Audit logs record credential access and API key usage
- [ ] Provider error responses and raw upstream payloads are not returned to API consumers by default

### Phase 5: Dashboard and Operations
- [ ] Authenticated admin can access the dashboard to manage clients, linked accounts, API keys, and provider credentials
- [ ] Authenticated admin can test unified API routes for a given linked account and view responses
- [ ] Dashboard displays connection status and health indicators
- [ ] Dashboard redacts sensitive values
- [ ] Admin can invoke provider capability discovery and metadata refresh

### Phase 6: Observability
- [ ] Each API request includes a correlation ID that is logged and returned in response headers
- [ ] System logs provider, connection, route, status, latency, and error code for every request (with secret redaction)
- [ ] Failed provider requests are logged with mapped public error and internal diagnostic info
- [ ] Metrics endpoint exposes request counts, error rates, and latency histograms

## Blockers
None at the moment.

## Next Steps
1. Get approval for the current roadmap (this document and ROADMAP.md)
2. Generate the instruction file (AGENTS.md)
3. Begin Phase 1 by discussing and planning the first phase.

---
*State defined: 2026-05-24*
*Last updated: 2026-05-24 after initial definition*
