# SyqueX — Technical Documentation Index

> **Pre-Production Documentation Suite**  
> **Last Updated:** 2026-04-16 · **Version:** 1.0.0

---

## Overview

This directory contains the complete technical documentation for SyqueX, a clinical AI assistant for mental health professionals. This documentation is designed for engineering review, security audits, investor due diligence, and onboarding new team members.

---

## Documents

| # | Document | Description | Audience |
|---|---|---|---|
| 1 | [**ARCHITECTURE.md**](./ARCHITECTURE.md) | System architecture with 8 Mermaid diagrams covering topology, module dependencies, middleware stack, data flows, auth lifecycle, RAG pipeline, and deployment infrastructure | Engineering, CTO, Investors |
| 2 | [**API_REFERENCE.md**](./API_REFERENCE.md) | Complete REST API reference — all endpoints, request/response schemas, error codes, rate limits, authentication details | Frontend Engineers, QA, Partners |
| 3 | [**DATABASE_SCHEMA.md**](./DATABASE_SCHEMA.md) | Full ER diagram, 10 table definitions with column types/constraints/indexes, migration strategy, and vector search implementation details | Backend Engineers, DBA |
| 4 | [**FRONTEND_GUIDE.md**](./FRONTEND_GUIDE.md) | Component tree, screen flow state machine, 20+ component API references, data layer architecture, design system tokens, and test coverage map | Frontend Engineers, Designers |
| 5 | [**SECURITY_COMPLIANCE.md**](./SECURITY_COMPLIANCE.md) | Threat model, OWASP Top 10 coverage matrix, LFPDPPP compliance checklist, auth architecture state machine, PII egress mapping, and hardening recommendations | Security Auditors, Legal, CTO |
| 6 | [**DEPLOYMENT_RUNBOOK.md**](./DEPLOYMENT_RUNBOOK.md) | Infrastructure topology, pre-deploy checklist, step-by-step deployment, smoke tests, rollback procedures, cron setup, scaling considerations, and incident response | DevOps, Engineering Lead |

---

## Quick Stats

| Metric | Value |
|---|---|
| **Total Documentation** | 6 documents, ~3,000+ lines |
| **Mermaid Diagrams** | 20+ diagrams (architecture, sequence, ER, state machine, flow) |
| **API Endpoints Documented** | 18 endpoints across 5 routers |
| **Database Tables Documented** | 10 tables with full column details |
| **Components Documented** | 20+ React components with prop tables |
| **Security Controls Documented** | OWASP Top 10 coverage + LFPDPPP matrix |

---

## Reading Order

**For a complete system understanding, read in this order:**

1. **ARCHITECTURE.md** — Start here for the big picture
2. **DATABASE_SCHEMA.md** — Understand the data model
3. **API_REFERENCE.md** — Learn the interface contract
4. **FRONTEND_GUIDE.md** — Understand the user-facing layer
5. **SECURITY_COMPLIANCE.md** — Review security posture
6. **DEPLOYMENT_RUNBOOK.md** — Prepare for production

**For a security audit, focus on:**
- SECURITY_COMPLIANCE.md (primary)
- ARCHITECTURE.md §7 (Security Architecture)
- DATABASE_SCHEMA.md (audit_logs, refresh_tokens, password_reset_tokens)
- API_REFERENCE.md (Auth endpoints, error codes)

**For investor due diligence:**
- ARCHITECTURE.md §1-2 (Executive Summary + Technology Matrix)
- SECURITY_COMPLIANCE.md §3 (LFPDPPP Compliance)
- DEPLOYMENT_RUNBOOK.md §7 (Scaling Considerations)
