# 04 — Kori V1 Roadmap

## Definition of done

Kori v1 is done when:

- core supported financial operations are correct and tested
- authentication/session flow works end to end
- unsafe/incomplete money-creation paths are disabled or secured
- financial invariants are integration-tested
- the API can be built into a production container
- CI verifies build/lint/tests
- the service is deployed to a cloud environment using managed PostgreSQL/Redis
- basic logs, health checks, backups, secrets, and rollback are understood and configured
- README claims match proven behavior

## Milestone 0 — Freeze scope and accept engineering rules

No feature expansion.

Decisions for v1:

- BDT only
- one SYSTEM wallet
- no multi-currency
- no microservices
- no Kubernetes
- Add Money disabled until trusted-provider verification exists
- owner writes implementation
- correctness/tests before architecture refactor

**Exit criteria:** these docs are accepted as the working contract.

---

## Milestone 1 — Make the application boot and authenticate correctly

Fix:

- AuthModule dependency composition
- JWT module/strategy setup
- `ACCESS_TOKEN_SECRET` naming
- cookie parser/plumbing
- refresh-cookie path/configuration
- auth integration tests
- deterministic environment configuration

Also define an idempotent bootstrap path for required SYSTEM/admin state.

**Teaching goals:**

- NestJS modules/providers/imports/exports
- Passport strategy lifecycle
- configuration validation
- HTTP cookies
- application bootstrap

**Exit criteria:** fresh environment can migrate, bootstrap, start, register/login/refresh, and pass integration tests.

---

## Milestone 2 — Repair identity and domain boundaries

Fix the `UserId` vs `WalletId` problem.

Define:

- authenticated user → owned wallet resolution
- recipient identifiers
- role ↔ wallet-type invariant
- Agent/Merchant provisioning model
- single SYSTEM wallet invariant
- BDT-only validation
- amount > 0 and amount limits
- explicit fee rounding rule

Introduce typed IDs/value objects only where they prevent concrete mistakes.

**Exit criteria:** all supported transaction commands operate on explicit wallet identities and reject invalid domain states.

---

## Milestone 3 — Secure the financial trust boundary

Disable public Add Money until external verification exists.

Harden:

- OTP generation
- OTP attempts/resend throttling
- login throttling
- numeric PIN/OTP validation
- sensitive logging
- account/wallet status checks
- device-session semantics

Rename claims such as “hardware-bound” unless actual attestation exists.

**Exit criteria:** no endpoint can create financial value solely from unverified client assertions.

---

## Milestone 4 — Make financial execution authoritative

Inside the database transaction:

- build exact participating-account lock set
- acquire locks in deterministic DB-side order
- re-read authoritative wallet state
- revalidate activity/type/currency/balance
- commit transaction + balances + ledger atomically

Avoid locking SYSTEM for zero-fee operations.

Add useful DB constraints where appropriate.

**Teaching goals:**

- PostgreSQL MVCC
- row locks
- isolation
- deadlocks
- TOCTOU
- constraints vs application validation

**Exit criteria:** transaction correctness does not depend on stale pre-flight reads.

---

## Milestone 5 — Prove the financial invariants

Build real tests for:

- debit total = credit total
- rollback leaves no partial writes
- insufficient funds
- inactive wallet
- wrong wallet type
- same-account transfer
- BDT-only constraint
- duplicate idempotency key
- concurrent debits from one wallet
- opposing A→B and B→A transfers
- fee posting
- system-wallet behavior

Use real PostgreSQL for concurrency tests.

**Exit criteria:** the project's strongest README claims are backed by automated tests.

---

## Milestone 6 — Refactor Transactions toward SOLID

Only now refactor the large transaction service.

Likely direction:

- transaction policy
- Money / typed identifiers
- posting plan
- atomic ledger executor
- response mapper if needed

Do not add abstractions that have no demonstrated purpose.

**Exit criteria:** adding/changing a transaction policy does not require rewriting locking/ledger persistence logic, and tests remain green.

---

## Milestone 7 — Durable idempotency design

Define request-intent identity and replay semantics.

Handle:

- in-flight Redis lock
- actor + operation + key scoping
- request fingerprint mismatch
- DB committed / Redis cache failed case
- replay of original successful result
- TTL and retry rules

PostgreSQL remains authoritative.

**Exit criteria:** retry behavior is deterministic even when Redis is unavailable or loses cached state.

---

## Milestone 8 — Production hardening

Add:

- health/readiness endpoints
- structured logging
- request/correlation IDs
- graceful shutdown
- safe exception logging
- migration procedure
- secrets policy
- database connection/pool settings
- Redis failure behavior
- security headers/CORS
- API documentation
- reconciliation command/check

**Exit criteria:** operational behavior is documented and testable.

---

## Milestone 9 — Containerize

Create a production API Dockerfile.

Learn:

- multi-stage builds
- dependency pruning
- Prisma generation
- Node runtime/module resolution
- non-root execution
- health checks
- environment injection
- local full-stack Compose

**Exit criteria:** Kori runs locally entirely through reproducible containers.

---

## Milestone 10 — CI/CD and cloud deployment

CI pipeline:

```text
push / PR
   ↓
install
   ↓
lint
   ↓
unit tests
   ↓
integration tests
   ↓
build
   ↓
container image
```

Deployment:

```text
registry
   ↓
cloud compute
   ├── managed PostgreSQL
   └── managed Redis
```

Learn:

- DNS
- HTTPS/TLS
- networking
- managed database
- managed Redis
- secrets
- migrations
- logs/metrics
- backups
- deployment/rollback
- cost awareness

**Exit criteria:** a fresh deploy can be recreated from documentation and CI without manual database editing.

---

## Milestone review protocol

For each milestone:

1. Read this milestone and relevant domain rules.
2. ChatGPT clarifies architecture/acceptance criteria when needed.
3. Owner implements with Codex as tutor/reviewer.
4. Codex runs/reviews tests and explains findings.
5. Bring major design disagreements back to ChatGPT.
6. Update docs only if the real design changed.
7. Mark milestone complete only when exit criteria are met.

Do not work on two financial-architecture milestones simultaneously unless there is a clear dependency reason.
