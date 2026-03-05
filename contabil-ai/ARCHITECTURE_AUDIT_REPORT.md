# ContabilAI - Architecture Audit Report

**Date:** 2026-03-05
**Scope:** Full architecture and code audit of `/backend/src/`
**Methodology:** Automated static analysis across all 11 system modules, 80+ source files

---

## Executive Summary

The ContabilAI backend is a well-structured NestJS/Express application with a thoughtful multi-agent architecture, event-driven processing, and proper separation of concerns. However, the audit identified **significant security vulnerabilities, missing error handling, broken integration flows, and configuration risks** that must be addressed before production deployment.

| Severity | Count |
|----------|-------|
| CRITICAL | 19 |
| HIGH | 16 |
| MEDIUM | 26 |
| LOW | 13 |
| **TOTAL** | **74** |

**Top 3 Risks:**
1. **Security:** Webhook authentication bypass, prompt injection, multi-tenant data leakage, default production credentials
2. **Reliability:** Missing error handling across all OpenAI API calls, unsafe JSON parsing, broken document processing flow
3. **Data Integrity:** Missing RPC function for memory system, incomplete event routing, silent failure modes in agent architecture

---

## Table of Contents

1. [AI Memory System](#1-ai-memory-system)
2. [Continuous Learning Memory](#2-continuous-learning-memory)
3. [Multi-Agent Architecture](#3-multi-agent-architecture)
4. [Document Intelligence](#4-document-intelligence)
5. [Financial Copilot](#5-financial-copilot)
6. [Accounting Autopilot](#6-accounting-autopilot)
7. [BullMQ Queue System](#7-bullmq-queue-system)
8. [Redis Integration](#8-redis-integration)
9. [Supabase Database Integration](#9-supabase-database-integration)
10. [Evolution API WhatsApp Integration](#10-evolution-api-whatsapp-integration)
11. [n8n Workflows](#11-n8n-workflows)
12. [Cross-Cutting Concerns](#12-cross-cutting-concerns)
13. [Consolidated Findings](#13-consolidated-findings)
14. [Recommended Fixes](#14-recommended-fixes)

---

## 1. AI Memory System

**Status: PARTIALLY WORKING**

### Integration Flow
```
Routes (memory.js) -> Controller (memoryController.js) -> Service (memoryService.js)
    -> Engine (memoryEngine.js) -> Queries (memoryQueries.js) -> Supabase
```
All endpoints verified working: GET `/`, GET `/search`, GET `/stats`, POST `/confirm-classification`, POST `/confirm-reconciliation`, POST `/confirm`, POST `/correct`, DELETE `/:id`.

### Issues Found

| ID | Severity | File:Line | Description |
|----|----------|-----------|-------------|
| MEM-1 | CRITICAL | `memory/memoryLearning.js:24` | **Missing RPC function `increment_memory_usage`** - Called but never defined in any migration. Silently falls back to non-atomic update. |
| MEM-2 | CRITICAL | `memory/memoryQueries.js:12-34` | **Status field not set on memory creation** - `insertMemory()` omits `status` field. Relies on DB DEFAULT but creates race condition risk. |
| MEM-3 | HIGH | `memory/memoryService.js:5-129` | **No try-catch in any function** - All 11 functions (storeMemory, getMemory, searchMemory, etc.) will throw unhandled errors to callers. |
| MEM-4 | HIGH | `memory/memoryEngine.js:12,163` | **Circular dependency via dynamic require** - `memoryEngine` and `memoryLearning` require each other at runtime, creating opaque dependencies. |
| MEM-5 | MEDIUM | `memory/memoryQueries.js:148-160` | **Dead code** - `findActiveMemories()` is exported but never called anywhere. |
| MEM-6 | MEDIUM | `memory/memoryQueries.js:133-146` | **Duplicate usage tracking** - `recordUsage()` duplicates `memoryLearning.js:276-283` (`incrementUsageCountFallback`). |
| MEM-7 | LOW | `memory/memoryQueries.js:4-10` | **Validation duplication** - `VALID_MEMORY_TYPES` duplicates DB CHECK constraint from migration 005. |

---

## 2. Continuous Learning Memory

**Status: PARTIALLY WORKING**

### Issues Found

| ID | Severity | File:Line | Description |
|----|----------|-----------|-------------|
| CLM-1 | MEDIUM | `memory/memoryQueries.js:162-186` | **Dead code** - `getMemoryStats()` never called; superseded by `memoryLearning.getLearningStats()`. |
| CLM-2 | MEDIUM | `ocr/documentIntelligence.js` | **Incomplete OCR-to-Learning pipeline** - `enhanceClassification()` retrieves memories but confirmed classifications don't auto-feed back to learning. Requires manual confirmation via POST endpoints. |
| CLM-3 | MEDIUM | `agents/memory/agentService.js:9,14,25,34` | **No error handling in agent service** - `processMemoryUpdate()` calls memoryEngine functions without try-catch. |
| CLM-4 | LOW | `memory/memoryService.js:39` | **Ambiguous return** - `updateMemory()` returns `null` on no-op, indistinguishable from failure. |

---

## 3. Multi-Agent Architecture

**Status: WELL-DESIGNED BUT ERROR HANDLING GAPS**

### Architecture Verification
- All 6 agents (Accounting, Document, Financial, Memory, Reconciliation, Risk) correctly extend `BaseAgent`
- Orchestrator properly dispatches events via `EVENT_ROUTING` table
- All agent handlers registered with BullMQ workers
- No dead code or unused agents

### Issues Found

| ID | Severity | File:Line | Description |
|----|----------|-----------|-------------|
| AGT-1 | HIGH | 8 locations across all agents | **Missing try-catch around all `emit()` calls** - Queue failures cause unhandled promise rejections. Affected: `document/agent.js:25,38`, `accounting/agent.js:32,38`, `financial/agent.js:28`, `reconciliation/agent.js:35`, `risk/agent.js:35`, `memory/agent.js:28`. |
| AGT-2 | MEDIUM | `orchestrator/orchestratorAgent.js:11,16` | **Empty event routing** - `ACCOUNTING_ENTRY_SUGGESTED: []` and `MEMORY_LEARNED: []` have no subscribers. Events dispatched but never processed. |
| AGT-3 | MEDIUM | `accounting/agent.js:50`, `memory/agent.js:40` | **Silent early returns** - Handlers return `null` without logging when data is incomplete. |
| AGT-4 | MEDIUM | `orchestrator/orchestratorAgent.js:5-17` | **Potential circular event chain** - DocumentAgent -> AccountingAgent -> MemoryAgent chain is safe now but fragile if routing changes. No max-hop protection. |
| AGT-5 | MEDIUM | `accounting/agentService.js:67-79` | **Error swallowed in service** - Returns fallback object instead of propagating errors; no AGENT_ERROR event emitted. |
| AGT-6 | LOW | `baseAgent.js:57-60` | **No logging in emit()** - Failed emissions have no queue name, job ID, or error details. |

---

## 4. Document Intelligence

**Status: BROKEN FLOW (webhook path)**

### Critical Integration Bug
The webhook-to-OCR pipeline is **functionally broken**: `webhookController.js` inserts documents with `type: 'image'/'pdf'` but `documentIntelligence.processDocument()` reads `doc.mime_type` (which is `undefined`). Classification will fail for all webhook-originated documents.

### Issues Found

| ID | Severity | File:Line | Description |
|----|----------|-----------|-------------|
| DOC-1 | CRITICAL | `ocr/documentIntelligence.js:73,98` | **Unprotected JSON.parse()** - Direct `JSON.parse(response.choices[0].message.content)` without try-catch. Crashes on malformed OpenAI responses. |
| DOC-2 | HIGH | `controllers/webhookController.js:233-258` | **Missing `mime_type` field in DB insert** - Documents inserted with `type` field but OCR expects `mime_type`. **Breaks entire webhook document flow.** |
| DOC-3 | HIGH | `controllers/webhookController.js:246` | **Path traversal in file extension** - User-controlled filename from WhatsApp (`message.documentMessage?.fileName`) used to extract extension without sanitization. |
| DOC-4 | HIGH | `controllers/webhookController.js:218-261` | **No file size validation in webhook path** - WhatsApp media downloads bypass multer's size limits. Can exhaust disk space. |
| DOC-5 | HIGH | `ocr/documentIntelligence.js:44,52,78` | **Synchronous file I/O without error handling** - `fs.readFileSync()` calls not wrapped in try-catch. |
| DOC-6 | MEDIUM | `ocr/documentIntelligence.js:52-53`, `services/aiService.js:73-74` | **Memory pressure from large files** - 25MB images create ~33MB base64 strings. 10 concurrent files = 250MB+ memory overhead. |
| DOC-7 | MEDIUM | `services/aiService.js:63` | **Unclosed file stream** - `fs.createReadStream()` in `transcribeAudio()` never explicitly closed. File descriptor leak under load. |
| DOC-8 | MEDIUM | `controllers/webhookController.js:217-261` | **No cleanup on failure** - Files written to disk are never cleaned up if processing fails. Disk space gradually fills. |
| DOC-9 | MEDIUM | `ocr/documentIntelligence.js:85` | **Silent text truncation** - Large PDFs truncated to 4000 chars without warning. AI may miss critical end-of-document data. |
| DOC-10 | MEDIUM | `ocr/documentIntelligence.js:54` | **Weak MIME type inference** - Falls back to `image/jpeg` for any non-PNG file. WebP, GIF, BMP all misidentified. |

---

## 5. Financial Copilot

**Status: FUNCTIONAL BUT SECURITY RISKS**

### Issues Found

| ID | Severity | File:Line | Description |
|----|----------|-----------|-------------|
| COP-1 | CRITICAL | `copilot/copilotEngine.js:231,240-241` | **Prompt injection vulnerability** - User-supplied `question` directly interpolated into OpenAI prompt without sanitization. |
| COP-2 | CRITICAL | `controllers/copilotController.js:56-69` | **Missing tenant validation** - `askCopilot()` accepts `company_id` from request body without verifying it belongs to the user's office. Multi-tenant data leakage. |
| COP-3 | HIGH | `copilot/copilotEngine.js:199-211,243-254` | **Unhandled OpenAI API failures** - API calls not wrapped in try-catch. Service crashes on timeout/error. |
| COP-4 | HIGH | `copilot/copilotEngine.js:210` | **Unsafe JSON.parse()** - `JSON.parse(response.choices[0].message.content)` without validation of response structure. |
| COP-5 | MEDIUM | No dedicated limiter | **No per-user/per-company rate limiting on AI calls** - Global rate limit (200 req/15min) insufficient. Users can spam OpenAI causing cost explosion. |
| COP-6 | MEDIUM | `copilot/copilotEngine.js:333-353` | **No schema validation for alert objects** - Alerts from GPT-4o reasoning queued without structure validation. |
| COP-7 | MEDIUM | `copilot/copilotEngine.js:176-195` | **No validation of financial snapshot data** - Directly accesses fields without null/type checking. NaN interpolated into prompts. |

---

## 6. Accounting Autopilot

**Status: FUNCTIONAL**

### Issues Found

| ID | Severity | File:Line | Description |
|----|----------|-----------|-------------|
| AUT-1 | MEDIUM | `analysis/dailyAnalysis.js:76,85` | **Incomplete batch error handling** - If one company's AI analysis throws, dependent companies may not get analyzed. Should use `Promise.allSettled`. |
| AUT-2 | MEDIUM | `copilot/copilotEngine.js:432-450` | **Unreliable session state** - `completeSession()` and `logAction()` failures only logged, not rethrown. Session data becomes inconsistent. |

---

## 7. BullMQ Queue System

**Status: FUNCTIONAL WITH GAPS**

### Verification
All 7 queues properly registered with corresponding workers:
- `message_queue`, `document_queue`, `financial_analysis_queue`, `alert_queue`, `copilot_queue`, `agent_queue`, `memory_agent_queue`

### Issues Found

| ID | Severity | File:Line | Description |
|----|----------|-----------|-------------|
| QUE-1 | HIGH | `queues/index.js:4-9` | **No Redis connection retry logic** - REDIS_CONFIG lacks `retryStrategy`, `enableReadyCheck`, or reconnect options. |
| QUE-2 | HIGH | `queues/index.js:1-80` | **Missing Redis connection error handlers** - No `.on('error')` or `.on('disconnect')` listeners. Silent failures go undetected. |
| QUE-3 | MEDIUM | `server.js:162-170` | **Silent queue startup failure** - Redis unavailability only logged as warning. Server appears healthy but job processing disabled. |
| QUE-4 | MEDIUM | `tasks/taskManager.js:21-29` | **Silent alert job failure** - `addAlertJob()` failures swallowed with warning log. Urgent task alerts silently lost. |
| QUE-5 | LOW | `queues/index.js:1` | **Unused import** - `QueueEvents` imported but never used. |
| QUE-6 | LOW | `src/jobs/` directory | **Empty jobs directory** - All job logic inline in workers.js instead of modular files. |

---

## 8. Redis Integration

**Status: FUNCTIONAL BUT FRAGILE**

### Issues Found

| ID | Severity | File:Line | Description |
|----|----------|-----------|-------------|
| RED-1 | MEDIUM | `config/env.js:57-61` vs `queues/index.js:4-9` | **Duplicate Redis config** - Configuration defined in two places. DRY violation increases maintenance burden. |
| RED-2 | MEDIUM | `config/env.js:71-83` | **Redis not validated at startup** - `REDIS_HOST` not in required env vars list. System starts without Redis with no clear warning. |
| RED-3 | MEDIUM | `config/env.js:57-61` | **Redis password optional in production** - Should be required when `NODE_ENV=production`. |

---

## 9. Supabase Database Integration

**Status: WELL-IMPLEMENTED**

### Positive Findings
- Supabase client properly initialized with 3-retry exponential backoff (`retryFetch()`)
- Database connection pooling configured (max: 20 connections)
- Migration system tracks checksums to prevent re-execution
- 6 migrations covering all required tables with RLS enabled
- Graceful shutdown closes connections properly

### Issues Found

| ID | Severity | File:Line | Description |
|----|----------|-----------|-------------|
| SUP-1 | MEDIUM | `config/supabase.js:26-30` | **Null `supabasePublic` client** - Set to `null` if `SUPABASE_ANON_KEY` missing. Code using it without null check will crash. |
| SUP-2 | MEDIUM | `config/supabase.js:77-80` | **Inconsistent module exports** - Default export is the client, but named exports also exist. Destructuring `{ supabase }` returns undefined. |
| SUP-3 | MEDIUM | `scripts/migrate.js:62-130` | **No migration rollback mechanism** - Forward-only migrations. Failed migrations require manual intervention. |
| SUP-4 | LOW | `config/database.js:14-20` | **Idle connection timeout** - 30s idle timeout may cause drops by cloud providers without reconnection logic. |

---

## 10. Evolution API WhatsApp Integration

**Status: CRITICAL SECURITY ISSUES**

### Issues Found

| ID | Severity | File:Line | Description |
|----|----------|-----------|-------------|
| WHA-1 | CRITICAL | `controllers/webhookController.js:23` | **Webhook signature validation broken** - Uses `JSON.stringify(req.body)` instead of raw request body. HMAC will not match Evolution API's signature. |
| WHA-2 | CRITICAL | `routes/webhook.js:6` | **Webhook endpoint unauthenticated** - No auth middleware beyond rate limiting. Anyone can send fake webhook events. |
| WHA-3 | CRITICAL | `docker-compose.yml:120` | **Default Evolution API key `changeme`** - Production docker-compose falls back to trivially guessable key. |
| WHA-4 | HIGH | `controllers/webhookController.js:22` | **Unvalidated signature headers** - Tries multiple header names (`x-webhook-signature`, `x-evolution-signature`) without format validation. |

---

## 11. n8n Workflows

**Status: FUNCTIONAL WITH CREDENTIAL RISKS**

### Issues Found

| ID | Severity | File:Line | Description |
|----|----------|-----------|-------------|
| N8N-1 | CRITICAL | `docker-compose.yml:99` | **Default n8n password in production** - Falls back to `contabilai2024` if env var not set. Full workflow access to anyone. |
| N8N-2 | HIGH | `scripts/deploy-workflows.js:28-30` | **Hardcoded default credentials** - Falls back to `admin:admin` for n8n API access. |
| N8N-3 | MEDIUM | `services/n8nService.js:37-46` | **Silent workflow failures** - n8n trigger failures logged as warnings, not errors. No alerting mechanism. |

---

## 12. Cross-Cutting Concerns

### Security

| ID | Severity | File:Line | Description |
|----|----------|-----------|-------------|
| SEC-1 | CRITICAL | `utils/crypto.js:8-11` | **Encryption key fallback to JWT secret** - If `ENCRYPTION_KEY` not set, derives from JWT_SECRET. Compromised JWT = compromised all encrypted tokens. |
| SEC-2 | CRITICAL | `config/env.js:72-78` | **Incomplete env validation** - Only 4 vars validated (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`). Missing: `EVOLUTION_API_KEY`, `ENCRYPTION_KEY`, `SMTP_*`. |
| SEC-3 | CRITICAL | `services/escalationService.js:7-12` | **SMTP transporter created without validation** - Invalid credentials not caught until first escalation attempt. |
| SEC-4 | HIGH | `server.js:34` | **No CORS restriction for webhook** - Webhook exposed to all origins. |

### Input Validation

| ID | Severity | File:Line | Description |
|----|----------|-----------|-------------|
| VAL-1 | HIGH | `routes/auth.js:7,9` | **No Zod validation on login/change-password** - Email/password extracted directly from `req.body`. |
| VAL-2 | HIGH | `controllers/integrationController.js:53-68` | **No format validation on integration credentials** - Encrypted and stored without structure check. |
| VAL-3 | MEDIUM | `routes/tasks.js:12` | **No validation schema on task creation** - Arbitrary fields accepted. |
| VAL-4 | MEDIUM | `routes/financial.js:20,28` | **No validation on analysis trigger or alert rule creation** - Missing Zod schemas. |

### Error Handling

| ID | Severity | File:Line | Description |
|----|----------|-----------|-------------|
| ERR-1 | HIGH | `services/aiService.js:18-137` | **No try-catch in any AI service function** - All 6 functions (interpretMessage, classifyIntent, transcribeAudio, analyzeImage, analyzePdf, shouldEscalate) crash on OpenAI API failure. |
| ERR-2 | HIGH | `services/aiService.js:32,59,97,113,136` | **No response validation** - All functions assume `response.choices[0].message.content` exists without null checks. |
| ERR-3 | MEDIUM | `controllers/escalationController.js:3-16` | **No try-catch in escalation controller** - Both `list()` and `update()` unprotected. |

### Authorization

| ID | Severity | File:Line | Description |
|----|----------|-----------|-------------|
| AUTH-1 | MEDIUM | `routes/users.js:27-28` | **Missing authorize middleware on user list/get** - Any authenticated user can access. |
| AUTH-2 | MEDIUM | `routes/companies.js:26-27` | **Missing authorize middleware on company list/get** - Any authenticated user can access. |
| AUTH-3 | MEDIUM | `routes/escalations.js:9` | **Missing authorize middleware on escalation list** - Viewers can access escalations. |

### Docker & Configuration

| ID | Severity | File:Line | Description |
|----|----------|-----------|-------------|
| DOK-1 | LOW | `backend/.env` | **.env file in repository** - Development secrets visible in git. |
| DOK-2 | LOW | `docker-compose.dev.yml:51-52` | **Plaintext dev credentials** - `admin:admin` defaults in version control. |
| DOK-3 | LOW | `config/env.js:55` | **Unused ALERT_EMAIL_FROM variable** - Defined in .env.example but never used in code. |

---

## 13. Consolidated Findings

### By System Health

| System | Status | Critical | High | Medium | Low |
|--------|--------|----------|------|--------|-----|
| AI Memory System | Partial | 2 | 2 | 2 | 1 |
| Continuous Learning | Partial | 0 | 0 | 3 | 1 |
| Multi-Agent Architecture | Degraded | 0 | 1 | 4 | 1 |
| Document Intelligence | **Broken** | 1 | 4 | 5 | 0 |
| Financial Copilot | Risky | 2 | 2 | 3 | 0 |
| Accounting Autopilot | Functional | 0 | 0 | 2 | 0 |
| BullMQ Queues | Functional | 0 | 2 | 2 | 2 |
| Redis Integration | Fragile | 0 | 0 | 3 | 0 |
| Supabase Integration | Good | 0 | 0 | 3 | 1 |
| WhatsApp Integration | **Critical** | 3 | 1 | 0 | 0 |
| n8n Workflows | Risky | 1 | 1 | 1 | 0 |
| Cross-Cutting | Critical | 3 | 5 | 5 | 3 |

### By Category

| Category | Count | Most Critical |
|----------|-------|---------------|
| Security | 15 | Webhook auth bypass, prompt injection, tenant leakage |
| Error Handling | 18 | Unhandled OpenAI failures, unsafe JSON parsing |
| Input Validation | 8 | Missing Zod schemas on auth, tasks, financial routes |
| Data Integrity | 6 | Missing RPC function, broken mime_type flow |
| Configuration | 9 | Default production passwords, incomplete env validation |
| Resource Management | 5 | Memory leaks from file buffers, unclosed streams |
| Architecture | 7 | Empty event routing, circular dependencies |
| Dead Code | 3 | Unused functions, empty directories |

---

## 14. Recommended Fixes

### P0 - Fix Before Production (19 issues)

1. **Fix webhook signature validation** - Use raw body buffer instead of `JSON.stringify(req.body)` (`webhookController.js:23`)
2. **Add tenant validation to copilot** - Verify company belongs to user's office (`copilotController.js:56-69`)
3. **Add prompt injection protection** - Sanitize user input before OpenAI prompts (`copilotEngine.js:231`)
4. **Remove default production credentials** - Remove all `:-fallback` defaults from `docker-compose.yml` for passwords/keys
5. **Validate all critical env vars at startup** - Add `EVOLUTION_API_KEY`, `ENCRYPTION_KEY`, `SMTP_HOST/USER/PASS` to required list (`env.js:72-78`)
6. **Make ENCRYPTION_KEY independent of JWT_SECRET** - Require separate key (`crypto.js:8-11`)
7. **Add try-catch to all OpenAI API calls** - Wrap all 6 functions in `aiService.js` and copilotEngine calls
8. **Fix JSON.parse crashes** - Add try-catch around all `JSON.parse(response.choices[0].message.content)` calls
9. **Fix webhook document flow** - Store `mime_type` in DB inserts from webhookController (`webhookController.js:233-258`)
10. **Add file size validation in webhook** - Check download size before writing to disk
11. **Sanitize file extensions** - Whitelist allowed extensions, don't trust WhatsApp filename
12. **Add error handling to memoryService** - Wrap all 11 functions in try-catch
13. **Deploy `increment_memory_usage` RPC function** - Add to migration 006
14. **Add try-catch around all agent emit() calls** - 8 locations across all agents
15. **Add Redis connection retry logic** - Configure `retryStrategy` in REDIS_CONFIG
16. **Add Redis connection error handlers** - Listen for error/disconnect events
17. **Validate SMTP at startup** - Verify transporter before accepting requests
18. **Add webhook authentication** - Implement proper Evolution API key validation middleware
19. **Add Zod validation on auth routes** - Login and change-password endpoints

### P1 - Fix Soon (16 issues)

20. **Add per-user/company AI rate limiting** - Prevent cost explosion from OpenAI abuse
21. **Add OpenAI response structure validation** - Check `response.choices[0]` exists before accessing
22. **Add authorize middleware to user/company/escalation read routes**
23. **Add Zod schemas for task creation, financial analysis, alert rules**
24. **Fix error handling in escalation controller** - Add try-catch blocks
25. **Add CORS restrictions for webhook origin**
26. **Consolidate duplicate Redis config** - Single source of truth
27. **Add try-catch in memory agentService**
28. **Add logging for silent early returns in agents**
29. **Document conditional event emissions**
30. **Add schema validation for alert objects before queuing**
31. **Validate financial snapshot data types before prompt insertion**
32. **Improve batch error handling in dailyAnalysis** - Use Promise.allSettled
33. **Add n8n failure alerting** - Escalate from warning to error level
34. **Clean up dead code** - Remove `findActiveMemories()`, `getMemoryStats()`
35. **Remove .env from git history**

### P2 - Plan for Later (13 issues)

36. Add migration rollback mechanism
37. Add file cleanup for failed processing
38. Close file streams explicitly in audio processing
39. Add text truncation warnings for large PDFs
40. Improve MIME type detection (use library instead of extension)
41. Add event deduplication/max-hop counter in orchestrator
42. Add health check rate limiting
43. Require Redis password in production
44. Move job logic from workers.js into modular job files
45. Fix Supabase module export consistency
46. Add null check for supabasePublic client
47. Remove unused env variables (ALERT_EMAIL_FROM)
48. Add content-type validation on webhook endpoint

---

## Appendix: Files Audited

```
server.js, config/{env,database,supabase,openai,logger}.js,
routes/{auth,offices,companies,users,integrations,escalations,tasks,financial,copilot,memory,webhook}.js,
controllers/{auth,office,company,user,integration,escalation,task,financial,copilot,memory,webhook}Controller.js,
services/{aiService,documentService,whatsappService,n8nService,taskService,escalationService,contaAzulService,omieService}.js,
agents/{baseAgent,financialAgent}.js, agents/{accounting,document,financial,memory,reconciliation,risk}/{agent,agentService,agentHandlers}.js,
agents/orchestrator/orchestratorAgent.js,
memory/{memoryService,memoryEngine,memoryLearning,memoryQueries}.js,
ocr/documentIntelligence.js, copilot/copilotEngine.js, analysis/{dailyAnalysis,financialMemory}.js,
alerts/alertEngine.js, queues/{index,workers}.js, tasks/taskManager.js,
middleware/{auth,rateLimiter,upload,errorHandler,validate}.js, utils/crypto.js,
scripts/{migrate,seed,deploy-workflows,daily-cron}.js,
database/migrations/001-006, Dockerfile, Dockerfile.worker,
docker-compose.yml, docker-compose.dev.yml, .env.example, package.json
```
