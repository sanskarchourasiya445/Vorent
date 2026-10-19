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

## Getting Started

### 1. Installation

Install all workspace dependencies from the project root:

```bash
npm install
```

### 2. Environment Configuration

Copy the placeholder environment file to `.env`:

```bash
cp .env.example .env
```

Review `.env` settings:
- `NODE_ENV`: `development`
- `PORT`: `3001`
- `DATABASE_URL`: `postgresql://postgres:postgres@localhost:5432/warrant_dev`
- `PAYPAL_ENV`: `sandbox` (**Mandatory**. Startup strictly rejects live mode to enforce sandbox security boundaries).

> [!IMPORTANT]
> Never commit `.env` or any production credentials. `.gitignore` is pre-configured to ignore all local environment files while tracking `.env.example`.

### 3. Database Setup

Ensure PostgreSQL is running locally. To prepare the development database:

```bash
# Using PostgreSQL CLI or pgAdmin:
CREATE DATABASE warrant_dev;
```

Drizzle configuration is located at `drizzle.config.ts` and table schemas are defined in `drizzle/schema.ts`.

---

## Development Scripts

From the repository root:

| Command | Action |
|---|---|
| `npm run dev` | Run both Fastify API and Vite frontend concurrently |
| `npm run dev:api` | Run Fastify backend API with `tsx` hot-reloading (Port 3001) |
| `npm run dev:web` | Run React frontend with Vite HMR (Port 5173) |
| `npm run build` | Build all workspace packages and production bundles |
| `npm run test` | Run Vitest automated test suite |
| `npm run test:watch` | Run Vitest in interactive watch mode |
| `npm run typecheck` | Run strict TypeScript checks (`tsc --noEmit`) across all workspaces |

---

## Health & Probes

The Fastify backend provides two standard operational probes:

- **`GET /health/live`**: Liveness probe. Returns HTTP 200 with service uptime and version. Does not query external dependencies.
- **`GET /health/ready`**: Readiness probe. Validates database connectivity and configuration. Returns HTTP 200 when database is connected, or HTTP 503 if unreachable.

---

## Security Invariants (MVP)

1. **Authorization Gate**: `ALLOW` is the only decision that permits payment order creation. `DENY` and `REVIEW` fail closed.
2. **Untrusted Inputs**: Shopping agents, client-submitted totals, product descriptions, and LLM drafting outputs are treated as untrusted.
3. **Deterministic Evaluation**: Pure server-side rules calculate cart hashes and authorization. No LLM has direct checkout authority.
4. **Sandbox Only**: Live PayPal credentials and modes are prohibited during MVP.
