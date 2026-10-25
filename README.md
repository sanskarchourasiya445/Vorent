# Warrant — Purchase Authorization Security Layer

**Test the mandate. Close the loophole. Enforce the intent.**

Warrant is a security and verification workstation for AI-assisted commerce. It ensures that shopping agents cannot authorize their own transactions by providing independent mandate testing, deterministic policy evaluation, versioned immutable approvals, and fail-closed checkout authorization before any payment provider operation.

---

## Architecture Overview

Warrant is organized as a modular monolith using **npm workspaces**:

```text
PayPal/
├── apps/
│   ├── web/                 # Warrant Studio UI (React 19, TypeScript, Vite, Tailwind CSS)
│   └── api/                 # Application & Authorization API (Node.js, TypeScript, Fastify)
├── packages/
│   ├── contracts/           # Boundary validation schemas (Zod), DTOs, reason codes & enums
│   ├── domain/              # Pure deterministic policy evaluator, hash, & budget rules
│   └── test-fixtures/       # Synthetic catalog, mandates, and expected verification results
├── drizzle/                 # Drizzle ORM PostgreSQL schema, migrations, and seed scripts
├── docs/                    # Canonical project documentation
└── scripts/                 # Operational and evaluation scripts
```

### Dependency Invariants

- `apps/web` → `@warrant/contracts`
- `apps/api` → `@warrant/contracts`, `@warrant/domain`
- `packages/domain` → `@warrant/contracts` (pure domain: strictly zero database, network, clock, or LLM dependencies)

---

## Prerequisites

- **Node.js**: v20+ (Verified on Node.js v26.10.0)
- **npm**: v10+ (Verified on npm v11.6.1)
- **PostgreSQL**: v14+ (PostgreSQL 18 running locally)
- **Git**: v2.40+

---

## Quickstart (8 Commands to Complete Setup & Verification)

```bash
# 1. Install all workspace dependencies
npm install

# 2. Copy environment template
cp .env.example .env

# 3. Apply Drizzle database migrations
npm run db:migrate --prefix apps/api

# 4. Reset and seed pristine demo state (refuses non-localhost DATABASE_URL)
npm run demo:reset

# 5. Typecheck all 5 workspaces
npm run typecheck

# 6. Build all packages and production web bundle
npm run build

# 7. Run full automated test suite
npm run test

# 8. Start development servers (API: 3001, Web: 5173)
npm run dev
```

---

## Development Scripts

From the repository root:

| Command | Action |
|---|---|
| `npm run dev` | Run both Fastify API and Vite frontend concurrently |
| `npm run dev:api` | Run Fastify backend API with `tsx` hot-reloading (Port 3001) |
| `npm run dev:web` | Run React frontend with Vite HMR (Port 5173) |
| `npm run seed` | Seed canonical synthetic demo state (`seedDemoData.ts`) |
| `npm run build` | Build all workspace packages and production bundles |
| `npm run typecheck` | Run strict TypeScript checks (`tsc --noEmit`) across all workspaces |
| `npm run test` | Run Vitest automated test suite |

---

## Three-Tier Automated Testing

Warrant Studio enforces strict separation across three testing tiers:

```bash
# Tier A: In-Memory Unit & Mock Tests (Zero External Dependencies, Offline)
npx vitest run --dir packages/contracts
npx vitest run --dir packages/domain
npx vitest run --dir apps/web
npx vitest run apps/api/src/__tests__/approvalsRoutes.test.ts apps/api/src/__tests__/checkoutProposalRepository.test.ts apps/api/src/__tests__/checkoutRoutes.test.ts apps/api/src/__tests__/health.test.ts apps/api/src/__tests__/paymentOrderLifecycle.test.ts apps/api/src/__tests__/paymentOrderRoutes.test.ts apps/api/src/__tests__/paypalService.test.ts apps/api/src/__tests__/paypalWebhook.test.ts

# Tier B: PostgreSQL Database Persistence (Requires Active Database on DATABASE_URL)
npx vitest run apps/api/src/__tests__/persistence.test.ts apps/api/src/__tests__/auditRepository.test.ts apps/api/src/__tests__/evidencePacketRoutes.test.ts

# Tier C: Live PayPal Sandbox Network Tests (Requires Sandbox Network & Credentials)
npx vitest run apps/api/src/__tests__/paypalLiveIntegration.test.ts
```

---

## Visual Verification & Dual-Theme System

Warrant Studio features an authoritative **Dual-Theme Design System** engineered for operational clarity, low eye strain during audit shifts, and high contrast:
- **Dark Mode (Midnight Navy + Emerald):** `#0B1220` canvas, `#101B2D` secondary, `#14263D` card surfaces, `#F8FAFC` ink, `#10B981` primary emerald accent, and `#334155` crisp borders.
- **Light Mode (Forest Green + Warm Ivory):** `#F7F5EF` warm ivory canvas, `#F0EFE7` secondary, `#FFFFFF` card surfaces, `#24352D` deep slate ink, `#12372A` deep forest brand accent, and `#DFE4DC` subtle borders.
- **Theme Switcher:** Seamlessly persists across reloads via `localStorage.getItem("warrant_theme")` and automatically honors OS system preferences (`prefers-color-scheme`).

> [!NOTE]
> All visual evidence is located in `docs/screenshots/dual-theme/`. All 17 screenshots were freshly captured from the live application running across desktop (1440×900) and mobile (375×667) viewports.

### Desktop Workstation Inventory — Dark Mode (1440×900)

| Screenshot | Workstation | Focus & Verified Invariants |
|---|---|---|
| [`01_dark_dashboard_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/01_dark_dashboard_desktop_1440x900.png) | **System Dashboard** (`overview`) | Real-time risk posture, Decision D-014 Warning (25 blocking findings), active spend reservations, and PayPal Sandbox order status |
| [`02_dark_mandate_compiler_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/02_dark_mandate_compiler_desktop_1440x900.png) | **Mandate Compiler** (`mandate`) | Natural language intent compilation, adversarial prompt shield, line token metrics, and synthesized formal rule bounds |
| [`03_dark_policy_versions_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/03_dark_policy_versions_desktop_1440x900.png) | **Policy Versions** (`policy-versions`) | Git-like policy diff workbench, version tree, and red warning banner for high-risk policy relaxations requiring re-verification |
| [`04_dark_verification_studio_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/04_dark_verification_studio_desktop_1440x900.png) | **Verification Studio** (`verification`) | 4-dimension search configuration, candidate exploration limits, and live model checking against Fastify `/api/verification/run` |
| [`05_dark_findings_witnesses_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/05_dark_findings_witnesses_desktop_1440x900.png) | **Findings & Witnesses** (`findings`) | 50 persisted verification findings table with severity filters and counterexample inspection |
| [`06_dark_approval_checkpoints_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/06_dark_approval_checkpoints_desktop_1440x900.png) | **Approval Checkpoints** (`approval`) | Active $1,500 budget checkpoint with 16% spend progress meter, expired approval history, and qualifying run UUID bindings |
| [`07_dark_checkout_gate_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/07_dark_checkout_gate_desktop_1440x900.png) | **Checkout Gate** (`checkout`) | Consumed 256-bit cryptographic nonce, authoritative policy evaluation, and horizontal 4-stage pipeline stepper |
| [`08_dark_transactions_ledger_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/08_dark_transactions_ledger_desktop_1440x900.png) | **Transactions Ledger** (`transactions`) | Live PayPal Sandbox OAuth 2.0 connectivity, Orders v2 ledger, and 9-tile financial order inspection dossier |
| [`09_dark_evaluation_report_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/09_dark_evaluation_report_desktop_1440x900.png) | **Evaluation Report** (`evaluation`) | Empirical 6/6 formal security invariant proofs verified passed, zero violations, and RFC 8785 evidence audit trail |

### Desktop Workstation Inventory — Light Mode (1440×900)

| Screenshot | Workstation | Focus & Verified Invariants |
|---|---|---|
| [`10_light_dashboard_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/10_light_dashboard_desktop_1440x900.png) | **System Dashboard** (`overview`) | High-contrast Forest Green + Warm Ivory palette, card surfaces, and governance metrics |
| [`11_light_verification_studio_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/11_light_verification_studio_desktop_1440x900.png) | **Verification Studio** (`verification`) | Exploration bounds, invariant cards, model checker execution, and stable top scroll offset |
| [`12_light_checkout_gate_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/12_light_checkout_gate_desktop_1440x900.png) | **Checkout Gate** (`checkout`) | Light-theme 4-stage pipeline stepper, cryptographic nonce validation, and fail-closed hold banner |
| [`13_light_evaluation_report_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/13_light_evaluation_report_desktop_1440x900.png) | **Evaluation Report** (`evaluation`) | Invariant verification proofs, audit trail actor badges, and JSON evidence viewer |

### Mobile Responsive Inventory (375×667)

| Screenshot | Theme & Viewport | Verified Behavior |
|---|---|---|
| [`14_dark_mobile_dashboard_375x667.png`](file:///d:/PayPal/docs/screenshots/dual-theme/14_dark_mobile_dashboard_375x667.png) | Dark • Mobile 375×667 | Clean vertical layout hierarchy, zero horizontal overflow (`scrollWidth === innerWidth`), and stacked governance cards |
| [`15_dark_mobile_navbar_drawer_375x667.png`](file:///d:/PayPal/docs/screenshots/dual-theme/15_dark_mobile_navbar_drawer_375x667.png) | Dark • Mobile 375×667 | Slide-over drawer navigation with active policy selector, workstation grouping badges, and theme toggle |
| [`16_light_mobile_dashboard_375x667.png`](file:///d:/PayPal/docs/screenshots/dual-theme/16_light_mobile_dashboard_375x667.png) | Light • Mobile 375×667 | Forest Green + Warm Ivory mobile dashboard, legible typography, and responsive metric tiles |
| [`17_light_mobile_navbar_drawer_375x667.png`](file:///d:/PayPal/docs/screenshots/dual-theme/17_light_mobile_navbar_drawer_375x667.png) | Light • Mobile 375×667 | Slide-over drawer navigation in Light theme with accessible contrast and touch targets (≥44px) |

---

## Security Invariants

1. **Decision D-014 Fail-Closed Boundary:** Risk acceptance is strictly prohibited for `CRITICAL` and `HIGH` counterexamples. Approval creation is rejected with `CRITICAL_HIGH_CANNOT_BE_ACCEPTED_RISK` until a repaired policy version is verified.
2. **Cryptographic Cart & Evidence Canonicalization:** All policy documents and evidence packets are canonically hashed via RFC 8785 (JSON Canonicalization Scheme) producing tamper-evident SHA-256 digests.
3. **Single-Use Checkout Nonces:** Nonces are bound to specific policy versions and spend limits, and atomically consumed upon checkout initiation.
4. **Idempotent Capture & Reconciliation Holds:** Order capture passes `idempotency_key` and `PayPal-Request-Id`. Ambiguous timeouts enter `UNKNOWN_REQUIRES_RECONCILIATION` with `RECONCILIATION_HOLD`, preventing double-captures.
5. **Sandbox Safeguard:** `PAYPAL_ENV=sandbox` is mandatory. Real money transactions and live credentials are fundamentally blocked.

---

## Proven / Bounded / Not Built (System Boundary Disclosure)

To maintain absolute technical honesty and transparency for reviewers and auditors, Warrant Studio explicitly classifies all system capabilities into three distinct tiers:

### 1. Proven (Mathematically or Empirically Verified)
- **Deterministic Policy Gate:** Pure domain engine evaluates purchase proposals against immutable AST rules with zero network, clock, or LLM non-determinism.
- **RFC 8785 Canonical Hashing:** Strict JSON Canonicalization Scheme generates tamper-evident SHA-256 digests across all policy versions and evidence snapshots.
- **Decision D-014 Fail-Closed Gate:** Approvals are physically blocked from issuance whenever open `CRITICAL` or `HIGH` counterexamples exist on a policy version.
- **Single-Use Cryptographic Nonces:** Atomic database consumption with unique constraints strictly prevents replay attacks (`409 Conflict`), resulting in zero PayPal calls.
- **Serialized Row-Locked Spend Reservation:** Concurrent checkout proposals are serialized at the database level using `FOR UPDATE` row locks, preventing race condition overspending.
- **Server-Side Catalog Price Enforcement:** Prices, titles, and categories are resolved exclusively from the server-side catalog, neutralising client-side price tampering.
- **Live PayPal Sandbox Integration:** Server-to-server OAuth 2.0 authentication, Orders v2 creation, buyer approval verification, and idempotent capture executed live against `api-m.sandbox.paypal.com`.

### 2. Bounded (Constrained Capabilities with Human Oversight)
- **Bounded LLM Mandate Extraction:** AI assistants (Gemini / LLM) only extract candidate AST rule drafts from natural language mandates. The LLM has zero authority to make `ALLOW`, `DENY`, or `REVIEW` decisions, and cannot authorize transactions.
- **Mandatory Human-in-the-Loop Governance:** All AI-extracted candidate rules require explicit human operator review, editing, and cryptographic signature (`Sign and Commit Policy Version`) before activation.
- **Finite State Cart Exploration:** Model checking searches bounded permutations (capped at 2,000 cart permutations per run) rather than attempting unbounded infinite-state space exploration.

### 3. Not Built (Explicit Non-Goals & Scope Limits)
- **Multi-Tenant Enterprise SSO:** Enterprise SAML 2.0 / Okta identity federation is out of scope for this hackathon prototype (uses session token authentication with deterministic user roles).
- **Live PayPal Production Credentials:** Strictly excluded by security policy. The application physically rejects `PAYPAL_ENV=live` to ensure absolute financial safety.
- **Infinite-State Formal Theorem Proving:** Uses bounded finite permutation model checking rather than exhaustive mathematical coq/isabelle theorem proving.

---

## License

This project is licensed under the [MIT License](LICENSE).

