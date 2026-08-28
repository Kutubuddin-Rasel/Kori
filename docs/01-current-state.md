# 01 — Current State

## Purpose

This document records the important facts discovered during the first static audit of Kori. It is not a list of every style issue. It focuses on correctness, security, architecture, testability, and deployment readiness.

## Current system shape

Kori is a NestJS backend with three main feature modules:

- Auth
- Wallets
- Transactions

Infrastructure is separated into Prisma, Redis, and notification areas.

The financial model uses:

- PostgreSQL
- Prisma transactions
- `BigInt` monetary amounts
- `Transaction` records
- `LedgerEntry` records
- wallet balance snapshots
- Redis idempotency state
- pessimistic PostgreSQL row locks

This is a strong foundation, but several claims currently exceed the guarantees implemented and tested.

## What is already strong

### Atomic financial writes

Transaction creation, wallet mutations, and ledger entries are written inside one Prisma database transaction. If the database transaction rolls back, the financial writes roll back together.

### Exact money representation

Amounts and fees use integer `BigInt` values rather than floating-point arithmetic.

### Durable duplicate protection

The `transactions.idempotencyKey` column is unique, giving PostgreSQL a durable second line of defence beyond Redis.

### Financial audit trail

Wallet balance movement is represented by transaction-linked ledger entries containing direction, amount, and resulting balance.

### Modular application shell

NestJS feature modules and infrastructure modules are separated reasonably well at the folder/module level.

## Critical findings

### C1 — UserId and WalletId are confused in transaction execution

Access-token `sub` contains `User.id`. Transaction controllers pass that value into transaction services as the sender/actor identifier. The transaction service then asks `WalletsService` for a wallet by `Wallet.id`.

Because `User.id` and `Wallet.id` are independent UUIDs, authenticated financial operations currently cross the wrong identity boundary.

**Required outcome:** authenticated `UserId` must be resolved explicitly to the actor's wallet before the financial engine operates on `WalletId`.

### C2 — Add Money has no trusted-provider verification

`AddMoneyDto` contains a `bankGatewayToken`, but the transaction path does not verify that token with a payment provider. It is currently treated only as a reference.

**Required outcome:** disable the route for public v1 unless it becomes a trusted, signature-verified provider callback with provider event idempotency and settlement validation.

### C3 — AuthModule dependency wiring is incomplete

Auth code depends on `CookieService`, `PasswordService`, `JwtService`, and JWT strategies/guards, but the committed AuthModule does not fully register/import the required components.

**Required outcome:** make the auth module boot deterministically and prove it with integration tests.

### C4 — Access-token secret key is inconsistent

Tokens are signed with `ACCESS_TOKEN_SECRET`, but `JwtStrategy` reads `ACCESSTOKEN_SECRET`.

**Required outcome:** one validated configuration key used consistently.

### C5 — Refresh-cookie path/plumbing is incomplete

The refresh flow reads `req.cookies`, while cookie parsing is not configured in the visible bootstrap/dependencies. The cookie is scoped to `/auth`, while routes are globally prefixed under `/api/v1`.

**Required outcome:** define one correct cookie/session configuration and test refresh through the actual HTTP route.

### C6 — Fresh deployment cannot deterministically bootstrap system state

`TransactionsService` requires a SYSTEM wallet during module initialization. A fresh migrated database contains no such wallet, and the application must be running to call the current admin creation endpoint.

**Required outcome:** deterministic, idempotent bootstrap/seed process for required system state.

## High-priority findings

### H1 — JavaScript sorting does not prove database lock order

The service sorts wallet UUIDs before using `WHERE id IN (...) FOR NO KEY UPDATE`, but the SQL query has no `ORDER BY`. Application parameter order does not guarantee PostgreSQL row acquisition order.

**Required outcome:** deterministic database-side lock acquisition plus concurrency tests.

### H2 — Mutable invariants are not fully revalidated after locking

The service rechecks balance after locks, but correctness-critical mutable state such as wallet activity/type/currency is not revalidated from the locked state.

**Required outcome:** authoritative validation happens inside the locked transaction.

### H3 — SYSTEM wallet is unnecessarily locked for zero-fee transfers

All transfers include the system wallet in the lock set, even when the fee is zero.

**Required outcome:** lock only accounts that are actually part of the posting plan.

### H4 — Multiple SYSTEM wallets are possible

The database does not enforce one system wallet, while startup uses `findFirst()`.

**Required outcome:** explicit uniqueness and deterministic lookup.

### H5 — Currency is modelled but not enforced

Wallets can carry different currency values, but transaction execution does not reject cross-currency transfers.

**Required outcome for v1:** BDT-only.

### H6 — Idempotency state is not bound to request intent

Redis keys are based only on the client key, not the actor/operation/request fingerprint.

**Required outcome:** define the idempotency contract and mismatch behavior.

### H7 — Financial guarantees are not regression-protected

Current tests are mostly construction/default scaffolding and do not prove transaction invariants, concurrency, rollback, or idempotency.

**Required outcome:** integration/concurrency tests before major refactoring.

## Architectural finding

`TransactionsService` currently combines transaction policy, validation, fee selection, lock orchestration, persistence, ledger construction, error mapping, and response mapping.

This is a real SRP/change-coupling problem, but refactoring must happen only after correctness is repaired and tests protect behavior.

## Production-readiness finding

Current Docker Compose is useful for local PostgreSQL/Redis tooling, but there is not yet a production API image, deployment pipeline, health/readiness strategy, structured observability, or cloud deployment model.

## Status

**Do not deploy publicly yet.**

The project should be described as actively developed and focused on financial correctness/concurrency, not as production-grade until the critical guarantees are enforced and tested.
