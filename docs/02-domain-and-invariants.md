# 02 — Domain and Financial Invariants

## Purpose

This is the most important Kori document.

Implementation may change. Class names may change. Framework details may change.

These rules define what the system means and what must remain true.

## V1 scope

Kori v1 is a **single-currency BDT mobile financial service backend**.

Supported actor concepts:

- Customer
- Agent
- Merchant
- Admin
- System account

Supported financial operation concepts:

- Send Money
- Cash In
- Cash Out
- Payment
- Add Money only after a trusted external-provider flow exists

## Identity model

### UserId and WalletId are different identities

A user is an authenticated actor.

A wallet is a financial account.

They must never be treated as interchangeable IDs.

```text
UserId
  │
  └── owns/resolves to ──► WalletId
```

Financial execution operates on `WalletId`.

Authentication operates on `UserId`.

### Ownership rules

For v1, every transacting human/business actor must have a coherent relationship between account role and wallet type.

Target rule:

- CUSTOMER → PERSONAL wallet
- AGENT → AGENT wallet
- MERCHANT → MERCHANT wallet
- SYSTEM wallet → no normal user owner
- ADMIN is an authorization role, not automatically a financial wallet type

The exact onboarding/provisioning workflow for Agent and Merchant must be implemented before those operations are considered complete.

## Money rules

Money is represented in the smallest BDT unit using an integer.

For all financial commands:

- amount > 0
- amount has a defined maximum
- no floating-point arithmetic
- currency = BDT
- fee rounding is explicit and tested
- sender and receiver cannot be the same financial account unless a deliberately modelled operation requires it

## Accounting invariant

For every committed financial transaction:

```text
sum(DEBIT amounts) = sum(CREDIT amounts)
```

This must be true for the complete posting plan, including fees.

Example:

```text
SEND_MONEY 50000 poisha + 500 fee

DEBIT   sender     50500
CREDIT  receiver   50000
CREDIT  system       500
                     -----
DEBIT = CREDIT      50500
```

A posting plan that is not balanced must never reach persistence.

## Atomicity invariant

For a financial transaction, the following state must commit together or not at all:

- transaction record
- all wallet balance mutations
- all ledger entries

No partial financial state is acceptable.

## Balance invariant

A normal wallet must not complete a debit that makes its balance negative.

The authoritative sufficient-funds check must be made using state protected by the transaction's locking/concurrency mechanism.

## Wallet-state invariant

A wallet participating in a transaction must be:

- present
- active
- of the required type
- in the correct currency
- valid for the operation

Correctness-critical mutable rules must be checked inside the protected database transaction, not only during pre-flight validation.

## System-wallet invariant

Kori v1 has exactly one BDT SYSTEM wallet for the defined system accounting scope.

It must be created deterministically during system bootstrap.

Application startup must not select an arbitrary `findFirst()` account from multiple possible system wallets.

## Idempotency invariant

A single financial intent must execute at most once.

The durable source of truth is PostgreSQL.

Redis may provide:

- fast in-flight collision detection
- response replay/cache

but loss of Redis must not make duplicate financial execution possible.

An idempotency record/key must be associated with the request intent. Reusing a key for a materially different request must not return an unrelated cached response.

The final request-identity fields will be decided during the idempotency milestone, but they should include enough information to distinguish:

- actor
- operation
- client idempotency key
- relevant request payload/fingerprint

## Locking/concurrency invariant

All accounts whose balances will be mutated by a transaction must be locked using one deterministic database-side ordering rule.

The lock set must contain only accounts that actually participate in the posting plan.

After locks are acquired, authoritative state is re-read and revalidated before mutation.

## Ledger invariant

Every balance mutation caused by a financial transaction must have a corresponding ledger entry.

Ledger entries must reference the transaction that caused them.

The ledger should be suitable for:

- account history
- audit
- reconciliation
- detection of wallet/ledger disagreement

## Reconciliation invariant

Kori should eventually be able to verify at minimum:

- each transaction's postings balance to zero
- wallet cached balance agrees with ledger-derived balance for the chosen accounting model

This can begin as an offline/admin reconciliation command before becoming scheduled monitoring.

## Security/trust invariant

Client claims are not trusted merely because they are present in a DTO.

Examples:

- client `deviceId` is an identifier, not hardware attestation
- bank/payment tokens must be verified with a trusted provider before money is credited
- authenticated `UserId` does not authorize arbitrary source wallets

## Transaction status rule

A transaction marked `COMPLETED` means its financial postings committed successfully.

Future support for `PENDING`, `PROCESSING`, `FAILED`, or `REVERSED` must define exact state transitions before those states are used for financial workflows.

## Out of scope for initial v1

- multi-currency/FX
- asynchronous fee posting
- complex AML/risk engine
- real bank integration unless deliberately added
- distributed microservices
- event sourcing
- Kubernetes
- premature high-scale partitioning

These can be learned later without weakening v1 correctness.
