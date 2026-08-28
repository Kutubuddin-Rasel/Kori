# 03 — Target Architecture

## Purpose

This document describes the architectural direction for Kori.

It is **not** permission to rewrite the application.

The migration must happen milestone by milestone with tests protecting behavior.

## Architectural goal

Keep NestJS modularity, but separate:

1. HTTP concerns
2. application/use-case orchestration
3. transaction policy/domain rules
4. financial posting/execution
5. infrastructure

Target direction:

```text
HTTP Controller
      │
      ▼
Application Use Case
      │
      ▼
Transaction Policy
      │
      ▼
Transfer / Posting Plan
      │
      ▼
Atomic Ledger Executor
      │
      ├── PostgreSQL / Prisma
      └── locking + balance + ledger persistence
```

## Layer responsibilities

### Controller

Responsible for:

- HTTP input
- DTO validation boundary
- authenticated principal extraction
- headers
- HTTP response/status

Not responsible for:

- fee calculation
- wallet lookup rules
- ledger construction
- database transaction logic

### Application use case

Responsible for:

- resolving authenticated actor to the correct domain account
- selecting the transaction policy
- coordinating domain/infrastructure services
- returning an application result

It should not contain raw SQL or detailed Prisma mutation sequences.

### Transaction policy

A transaction policy describes what varies by transaction type.

Examples:

- allowed sender wallet type
- allowed receiver wallet type
- fee rule
- whether SYSTEM account participates
- human-readable ledger description metadata
- additional transaction-specific rules

This is where Strategy-style behavior has a real purpose.

### Posting plan

A posting plan is an explicit representation of intended money movement.

Example:

```text
DEBIT  wallet-A  50500
CREDIT wallet-B  50000
CREDIT system      500
```

Before persistence, the plan must validate:

```text
total debits = total credits
```

This gives Kori a stronger structural accounting boundary than manually interleaving balance updates and ledger inserts.

### Atomic ledger executor

Responsible for:

- opening the Prisma transaction
- deriving the lock set from the posting plan
- deterministic database-side lock acquisition
- re-reading protected state
- validating mutable invariants
- enforcing sufficient funds
- writing Transaction
- applying wallet balance changes
- writing LedgerEntry rows
- committing/rolling back atomically

It should not decide SEND_MONEY vs CASH_OUT business policy.

### Infrastructure

Contains details of external systems:

- Prisma/PostgreSQL
- Redis
- SMS provider
- payment provider
- logging/metrics adapters

Application/domain code should not require knowledge of ioredis or provider-specific SDK details unless there is a deliberate trade-off.

## Value objects / typed domain concepts

Introduce only where they prevent real mistakes.

Good candidates:

- `UserId`
- `WalletId`
- `Money`
- `IdempotencyKey`
- `Currency`

The first priority is preventing `UserId`/`WalletId` confusion and centralizing money rules.

Do not create value objects for everything.

## Repository pattern

Do **not** add generic repositories simply because Clean Architecture examples use them.

Prisma is already an abstraction over persistence.

Introduce a repository/port only when it provides a concrete benefit such as:

- hiding a complex persistence contract
- enabling domain logic to avoid Prisma-specific structures
- enabling a meaningful alternate implementation/test boundary
- consolidating repeated financial queries

## Unit of Work

Do not implement a custom Unit of Work merely to wrap Prisma.

Prisma transactions already provide the transaction boundary.

The financial executor can own that boundary directly.

## SOLID interpretation

### SRP

Separate code when responsibilities change for different reasons.

The main current SRP target is `TransactionsService`, because business policy and financial persistence change for different reasons.

### OCP

Transaction-specific policy should be extensible without rewriting the financial executor.

OCP does not mean every future feature can be added with literally zero existing-code changes.

### LSP

Prefer simple interfaces and behavior contracts. Avoid inheritance-heavy designs.

### ISP

Keep ports small and purpose-specific. Do not create one giant infrastructure interface.

### DIP

Use dependency inversion where an external service or volatile infrastructure concern should not define the application/domain policy.

Do not abstract stable framework code without a reason.

## Initial module direction

A possible end-state shape:

```text
src/
├── common/
├── infrastructure/
│   ├── prisma/
│   ├── redis/
│   ├── sms/
│   └── payments/
│
└── modules/
    ├── auth/
    ├── wallets/
    └── transactions/
        ├── application/
        ├── domain/
        ├── infrastructure/
        └── transactions.controller.ts
```

This is a direction, not an immediate folder-migration task.

## Testing architecture

Three levels matter:

### Unit tests
For pure rules such as:

- fee calculation
- posting-plan balance
- Money validation
- policy selection

### Integration tests
Using real PostgreSQL/Redis where behavior depends on actual infrastructure:

- Prisma transaction rollback
- row locking
- unique idempotency
- Redis NX/TTL behavior

### E2E tests
Through the real Nest HTTP bootstrap:

- auth/login/refresh
- transaction endpoint authorization
- idempotency behavior
- validation/error envelope

Concurrency correctness must be tested with real PostgreSQL, not mocks.

## Cloud/deployment direction

Kori should eventually run as:

```text
Internet
   │
 HTTPS
   │
API container
   │
   ├── Managed PostgreSQL
   └── Managed Redis
```

with:

- secrets management
- migrations
- health/readiness
- structured logs
- metrics
- backups
- CI/CD
- rollback path

Cloud work starts only after application correctness and tests are credible.
