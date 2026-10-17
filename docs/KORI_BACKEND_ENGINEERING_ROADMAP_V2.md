# Kori Backend Engineering Roadmap

**Status:** Canonical execution + learning roadmap — **FROZEN AFTER FINAL ADVERSARIAL AUDIT**  
**Revision:** 2 — Astra Max final audit incorporated  
**Project:** Kori — Mobile Financial Service Backend  
**Repository checkpoint used for this revision:** `ab1fb85` (26 September 2026)  
**Architecture direction:** Modular monolith with a framework-independent domain core where that boundary is useful  
**Primary stack:** NestJS, TypeScript, PostgreSQL, Prisma, Redis  
**Primary purpose:** Learn backend engineering deeply while turning Kori into a correct, explainable, testable, production-minded financial backend.

---

# 0. How to Use This Roadmap

This roadmap is intentionally divided into many small phases.

It is not a checklist to rush through.

Within Kori work, refer to this document as **the roadmap** or **the canonical roadmap**. When a future discussion asks "what should we do next?", resolve it from this file plus current repository evidence rather than inventing a new sequence.

For every meaningful phase, use this cycle:

```text
Learn the concept
        ↓
Inspect the exact Kori problem
        ↓
State the invariant / desired behavior
        ↓
Compare realistic designs
        ↓
Choose the smallest justified design
        ↓
Owner implements
        ↓
Add the appropriate automated proof
        ↓
Review the implementation
        ↓
Fix meaningful problems
        ↓
Commit
        ↓
Mastery / interview checkpoint
```

The project owner writes the production implementation.

ChatGPT acts as:

- Staff Engineer tutor
- architecture partner
- reviewer
- testing mentor
- security/concurrency mentor
- database mentor
- deployment/operations mentor
- interview preparation partner

Codex/Astra/Sol may be used as independent reviewers, but they do not become the source of truth for the project.

The source of truth is:

```text
real Kori behavior
+
explicit Kori invariants
+
automated evidence
+
the final design decisions recorded here
```

---

# 1. Why Kori Exists

Kori is both:

1. a real Mobile Financial Service backend, and
2. a backend-engineering curriculum.

The goal is not to finish as quickly as possible.

The goal is to finish while being able to explain:

- how the system is composed
- why each abstraction exists
- how authentication and authorization work
- why each financial transaction is valid
- where money comes from and where it goes
- how PostgreSQL protects concurrent financial state
- what Redis does and does not guarantee
- how retries and crashes are handled
- how the ledger and materialized balance relate
- how the system detects inconsistency
- how the application is tested
- how it is deployed
- how it is operated and recovered
- what would change at significantly larger scale

Correctness, understanding, tests, and defensible trade-offs are more important than speed.

---

# 2. Working Agreement

## 2.1 Owner implementation rule

The owner writes production code.

The tutor may:

- teach
- explain APIs
- show small illustrative snippets
- compare alternatives
- design test cases
- review diffs
- identify bugs
- propose focused tasks

For roadmap learning tasks, the owner writes the production implementation.

The tutor may provide explanations, pseudocode, tiny illustrative examples, API usage examples, test ideas, and review feedback, but should **not** provide the completed Kori production patch for the owner to transcribe.

If the owner explicitly asks for a tiny mechanical correction outside the learning objective, the tutor may help, but that must not become a loophole that replaces the owner's implementation work.

## 2.2 No architecture by vocabulary

Do not introduce an abstraction because:

- Clean Architecture uses it
- DDD books use it
- a design-pattern list contains it
- it looks impressive in a portfolio
- it reduces a class's line count
- another backend project uses it

Every abstraction must answer at least one real question:

- What bug does this prevent?
- What invariant does this protect?
- What independent reason to change does this isolate?
- What unstable dependency does this shield?
- What testing problem does this solve?
- What realistic variation has become painful?

If the answer is unclear, keep the simpler design.

## 2.3 Do not refactor unsafe behavior into prettier classes

Before a major refactor of financial or security behavior:

1. define what the behavior should mean,
2. add only the characterization/regression proof needed to protect it,
3. fix correctness,
4. prove correctness,
5. then refactor if an abstraction has been earned.

Correctness comes before architectural beautification.

---

# 3. Kori Testing Policy

This section is a project rule.

## 3.1 We will NOT retrofit exhaustive tests onto all untouched legacy code now

Kori already contains services/controllers whose tests are weak, missing, or only scaffolded.

We will **not** stop the project and write exhaustive unit tests for every existing:

- controller
- service
- utility
- provider
- guard
- interceptor

just to increase a coverage percentage.

Why:

- many of these areas will change during proper refactoring,
- tests tightly coupled to temporary implementations become waste,
- meaningless `should be defined` tests do not protect behavior,
- controller unit tests often duplicate what better E2E tests prove,
- the project should learn testing through real engineering work.

## 3.2 New code rule

When we introduce a new meaningful concept, it gets appropriate tests immediately.

Examples already following this rule:

- `UserId`
- `WalletId`
- `PhoneNumber`
- `Money`
- half-even rounding

Future examples:

- a request fingerprint function
- a posting validation rule
- a new policy
- a new provider adapter
- a reconciliation rule

## 3.3 Bug-fix rule

A meaningful bug fix should normally include a regression test that would fail on the old behavior.

Example:

```text
bug:
revoked device can login

proof:
test first/alongside fix showing revoked device is rejected
```

## 3.4 Test-on-touch rule for existing code

When we intentionally touch an existing service/controller to make that area correct and stable:

```text
inspect behavior
↓
write the minimum characterization tests needed for safe change
↓
refactor/fix
↓
add the final behavior tests appropriate to the new boundary
```

Then that area should leave the phase substantially better protected than it entered.

## 3.5 Critical safety exception

For risky financial/security code, we may need tests **before** a refactor even though the code is legacy.

Examples:

- financial locking
- idempotency
- refresh-token rotation
- OTP consumption
- ledger posting
- reversal

This does **not** mean testing the entire surrounding service.

It means protecting the behavior we are about to change.

## 3.6 Controller testing rule

Thin controllers should not receive unit tests merely because they exist.

Prefer:

```text
DTO validation
guards
interceptors
cookies
route status
error envelope
serialization
```

through production-equivalent E2E tests.

Write direct controller unit tests only when the controller contains meaningful behavior that is not better tested through E2E.

Delete/avoid useless tests such as:

```ts
expect(controller).toBeDefined();
```

when they provide no engineering value.

## 3.7 Service testing rule

Service tests should protect behavior and orchestration, not private implementation details.

When a service is finalized/refactored:

- test important success paths
- test domain/security failure paths
- verify significant dependency interaction where relevant
- do not mock infrastructure when the guarantee depends on real infrastructure

## 3.8 No fake concurrency proof

Mocks cannot prove:

- PostgreSQL row-lock behavior
- MVCC behavior
- deadlock behavior
- rollback across real SQL writes
- database unique-constraint races

Those require real PostgreSQL integration/concurrency tests.

## 3.9 Test layers

```text
Pure/domain unit
    ↓
Application/service
    ↓
Nest composition / boundary
    ↓
Infrastructure integration
    ↓
PostgreSQL transaction
    ↓
Controlled concurrency
    ↓
Full HTTP E2E
```

A phase uses only the layers needed to prove its claim.

## 3.10 Characterization is not specification

A characterization test may capture what legacy code currently does.

That does **not** mean the current behavior is correct.

When known behavior is unsafe:

```text
characterize only what must survive
+
write the desired regression/specification test
+
fix the unsafe behavior
```

Do not preserve a security or financial defect merely because an old snapshot test captured it.

## 3.11 Schema-change testing rule

Whenever an earlier phase introduces a database migration, that phase must test the migration at the level justified by the change.

At minimum:

- fresh database migration
- representative existing-data migration for changes that can break or reinterpret existing rows

The later migration curriculum deepens this discipline; it does not postpone all migration safety until then.

## 3.12 Claim-oriented proof

Prefer recording evidence as:

```text
claim
→ test/scenario
→ result
→ revision/commit
```

rather than treating labels such as `E2E_PROVEN` or `CONCURRENCY_PROVEN` as self-explanatory badges.

## 3.13 Mechanism isolation in concurrency tests

A concurrency test must isolate the guarantee it claims to test.

Examples:

- overspending races use **different idempotency keys** so duplicate suppression does not hide a broken balance protocol
- independent database connections are used when lock behavior matters
- the connection pool must not accidentally serialize the test
- a shared SYSTEM lock must not accidentally remove the intended race
- controlled barriers/bounded waits should demonstrate that the expected contention actually occurred

---

# 4. Three Separate Progress Statuses

A file existing does not mean a concept is mastered.

Every major topic has three dimensions.

## 4.1 Implementation status

- `NOT_STARTED`
- `PARTIAL`
- `IMPLEMENTED`
- `DEFERRED`
- `NOT_REQUIRED`
- `DEPRECATED`

`NOT_REQUIRED` is a successful architectural result when Kori has not earned an optional abstraction.

When using `NOT_REQUIRED`, record:

- why it is unnecessary now
- what concrete future trigger would justify reconsideration

This prevents optional patterns from becoming fake unfinished work.

## 4.2 Proof status

- `UNPROVEN`
- `UNIT_PROVEN`
- `INTEGRATION_PROVEN`
- `CONCURRENCY_PROVEN`
- `E2E_PROVEN`

Not every topic needs every level.

## 4.3 Mastery status

- `NOT_STUDIED`
- `LEARNING`
- `EXPLAINED`
- `APPLIED`
- `MASTERED`

A roadmap phase is complete only when the required implementation, proof, and mastery gates are satisfied.

---

# 5. Core Architectural Principles

## 5.1 PostgreSQL is authoritative for committed financial state

Redis may provide:

- caching
- short-lived coordination
- OTP state
- throttling
- replay acceleration
- in-flight duplicate suppression

Redis must never be the only mechanism preventing duplicate financial execution.

## 5.2 Identity boundaries are explicit

```text
UserId != WalletId
```

Authentication works with user identity.

Financial execution works with wallet/account identity.

Ownership must be resolved explicitly.

## 5.3 Money uses minor units

For BDT v1:

```text
1 taka = 100 poisha
```

No floating-point money.

`Money` may represent zero because zero is valid for:

- balances
- fees
- comparisons

A financial **transfer command** independently requires a positive principal.

## 5.4 Kori v1 is BDT-only

No FX.

No accidental cross-currency execution.

Currency must be enforced at appropriate domain/database boundaries.

## 5.5 Financial movement and current balance have different roles

Target mental model:

```text
ledger/postings
    =
durable movement history

wallet.balance
    =
materialized current spendable balance
```

Spending decisions use the protected current balance.

Reconciliation verifies that materialized state agrees with the chosen ledger/accounting model.

## 5.6 Financial writes are atomic

For one committed financial command:

- transaction/intention record
- wallet balance changes
- ledger/posting rows

must commit together or not at all.

## 5.7 Balanced is necessary but not sufficient

This is invalid even though mathematically balanced:

```text
DEBIT  Alice    500
CREDIT Charlie  500
```

when Bob was the intended recipient.

Tests must also verify:

- correct accounts
- correct directions
- correct principal
- correct fee
- correct metadata
- correct wallet deltas
- correct posting relationships

## 5.8 Locks protect only the state participating in the locking protocol

A wallet row lock does not magically protect:

- user role
- user status
- another table
- Redis state
- external-provider state

The system must define which state is authoritative for each rule.

## 5.9 Do not overclaim exactly-once

Kori should aim for:

```text
at-most-once financial effect
+
deterministic replay/recovery of committed intent
```

Do not claim distributed "exactly once" casually.

---

# 6. Accounting Vocabulary for Kori

Kori should initially describe itself as a **balanced wallet movement subledger** unless/until a broader accounting model is deliberately implemented.

The roadmap should not use institution-level accounting terminology more strongly than the implementation supports.

## 6.1 SYSTEM account meaning

For the current v1 direction, prefer a precise meaning:

```text
SYSTEM fee/revenue account
```

Do not allow `SYSTEM` to become a magic bucket for every platform-side movement.

A future trusted Add Money provider may require a distinct settlement/funding concept.

Do not assume fee revenue is the source of externally deposited customer funds.

## 6.2 Funding must be explainable

Before strong reconciliation claims, define how balances originate.

Examples requiring an explicit story:

- initial SYSTEM state
- Agent e-float
- Merchant balances
- test fixtures
- trusted provider deposits
- opening balances

Direct database balance editing may be acceptable for controlled test fixtures, but it is not automatically a valid product accounting flow.

---

# 7. SOLID Learning Strategy

SOLID is woven through real Kori work.

There is no requirement to perform five production refactors merely to "complete SOLID."

## SRP

Learn from independent reasons to change.

Primary candidate:

`TransactionsService`

Possible independent changes include:

- transaction policy
- fee rules
- lock mechanics
- persistence mechanics
- ledger construction
- response mapping

But transactionally coupled operations may still belong together.

Line count alone is not an SRP violation.

## OCP

The current functional fee dictionary is already a useful OCP/Strategy example.

Do not replace it with a class hierarchy merely to look more object-oriented.

Introduce richer transaction policy abstractions only when transaction-specific variation repeatedly pollutes otherwise stable execution.

## LSP

Teach behavioral substitutability when Kori has a real contract.

Possible future examples:

- provider adapter + test fake
- notification adapter + fake

Matching TypeScript signatures is not enough.

Implementations must preserve:

- result meaning
- error meaning
- authorization assumptions
- idempotency expectations

## ISP

A broad service is not automatically an ISP violation.

Introduce a narrow contract only when a real consumer is forced to depend on behavior it does not need.

## DIP

Pure domain/application policy should not be dictated by:

- Prisma types
- Redis APIs
- provider SDKs
- HTTP exceptions

But DIP does not mean every class needs an interface.

---

# 8. Design Pattern Policy

## Already justified

- Value Object
- Nest dependency injection
- functional Strategy/Policy for fees

## Likely justified soon if the problem appears

- small posting structure
- narrow transaction policy boundary
- application-owned provider adapter

## Must wait for evidence

- Repository
- richer State Machine
- Domain Events
- Transactional Outbox

## Currently unnecessary

- generic repositories
- custom Unit of Work over Prisma
- Factory for trivial construction
- Specification framework
- entity base classes
- extra Facade layers
- microservices
- CQRS
- Event Sourcing
- distributed Saga
- Kubernetes
- sharding
- multi-currency

---

# 9. Current Repository Checkpoint

Revision used for this roadmap:

```text
ab1fb85
```

## Implemented / meaningful progress

- `UserId`
- `WalletId`
- `PhoneNumber`
- `Money`
- `Currency`
- domain exceptions
- value-object unit tests
- explicit minor-unit transaction DTO naming
- `Money` integrated through transaction monetary calculations
- fee calculator now accepts/returns `Money`
- exact bigint half-even rounding utility
- half-even unit tests
- post-lock sender balance reconstructed as `Money`
- Prisma receives primitive minor units at persistence boundaries

## Known unfinished proof/work

- direct `calculateFee()` business-policy tests
- some test comments/JSDoc are stale or overstate guarantees
- unit suite still contains failing/no-value scaffold tests according to the latest independent audit
- E2E suite does not currently boot correctly
- E2E bootstrap is not equivalent to production bootstrap
- AuthModule composition is incomplete
- unsafe public Add Money exists
- registration clearance is not strongly caller-bound
- OTP consume is non-atomic
- OTP trusted-device upsert can mutate a device owned by another user
- login ignores `isAuthorized`
- refresh/device/account/session semantics are incomplete
- BDT is assumed in places rather than enforced
- SYSTEM uniqueness/bootstrap is incomplete
- financial lock ordering is not database-order deterministic
- authoritative state validation after locks is incomplete
- no real PostgreSQL financial concurrency proof
- durable idempotent replay is incomplete
- ledger/accounting funding semantics are incomplete
- reconciliation does not exist
- production API image/CI/CD/cloud operations are incomplete

## Current execution position

Start at:

```text
Phase 1 — Close the Money / Fee milestone
```

Do not restart completed value-object work.

---

# 10. Phase Overview

The phases are intentionally small.

Some phases produce code.

Some produce a decision plus tests.

Some are optional and are entered only if Kori earns the abstraction/integration.

---

# STAGE A — Close Current Work and Establish a Safe Baseline

## Phase 0 — Adopt This Roadmap as the Canonical Execution Document

### Learn

- difference between roadmap, architecture direction, and implementation status
- why implementation/proof/mastery are separate
- why one project must not have several competing "what next?" documents

### Work

Declare:

```text
Canonical execution + curriculum:
KORI_BACKEND_ENGINEERING_ROADMAP_V2.md
```

Older documents remain useful only as:

- historical audits
- domain/invariant references
- candidate architecture direction
- design rationale

They must not independently decide execution order.

Specifically:

- mark older roadmap files as superseded for execution ordering
- update docs index/README references that still call another roadmap canonical
- preserve useful invariant/architecture content
- mark prescriptive use-case/policy/posting/executor diagrams as **candidate direction**, not mandatory final class structure

### Proof

No code proof required.

A repository reader can unambiguously identify the canonical roadmap.

### Mastery gate

Owner can explain:

- what is canonical
- what may change frequently
- what should remain stable
- why an older architecture diagram is not an implementation mandate

### Exit

This roadmap is accepted as the single execution source of truth.

---

## Phase 1 — Close the Money / Fee Milestone

### Current trigger

Money integration is largely implemented, but the milestone is not fully closed.

### Learn

- mechanism test vs business-policy test
- value-object invariant vs use-case invariant
- why comments are part of the correctness story

### Work

- correct stale fee-calculator JSDoc (`Money`, not `bigint`)
- clean misleading/overstated value-object test comments
- add direct tests through `calculateFee()`

Minimum fee-policy proof:

- SEND_MONEY fixed fee
- CASH_OUT exact half-even example (`5000` poisha → `92` poisha)
- CASH_OUT value above the half boundary proves we are not flooring
- zero-fee operations return zero Money

Do not invent fake currencies solely for tests.

### Proof

Unit tests.

### Mastery gate

Owner can explain:

- why testing `divideRoundHalfEven()` does not prove `calculateFee()` policy
- why `Money.zero()` is valid while a transfer principal must be positive
- why we did not add `Money.subtract()` for wallet mutation

### Exit

Money/fee work is considered closed unless a later phase exposes a new invariant.

---

## Phase 2 — Establish the Testing Baseline Without Mass-Retrofitting Tests

### Trigger

The current unit suite contains meaningless/failing scaffold tests and E2E is broken.

### Learn

- test value vs test count
- characterization test
- regression test
- test-on-touch
- unit vs integration vs E2E
- why "green suite" matters even without high coverage

### Work

- remove or repair no-value scaffold specs that only test `should be defined`
- do **not** replace them with exhaustive tests for untouched legacy code
- make the meaningful unit-test command deterministic and green
- keep focused commands for:
  - unit
  - E2E
  - later integration/concurrency
- document the test-on-touch rule in project docs if needed

### Proof

- meaningful existing unit tests run green
- no known meaningless failing scaffold test blocks normal development

### Mastery gate

Owner can classify five real Kori tests into the correct test layer and explain why.

### Non-goals

- coverage percentage target
- testing every controller/service
- financial concurrency testing yet

---

## Phase 3 — Learn Nest Composition and Repair AuthModule Wiring

### Trigger

Auth code depends on providers/strategies that the module does not coherently compose.

### Learn

- Nest module
- provider
- import/export
- module ownership
- `JwtModule`
- Passport strategy registration
- composition root

### Inspect

- `AuthModule`
- `AuthService`
- `OtpService`
- `PasswordService`
- `CookieService`
- JWT strategies
- guards
- `AppModule`

### Work

Repair composition so the supported auth flow can boot through Nest normally.

### Testing policy

Do not write exhaustive Auth tests yet.

Add only the composition/smoke proof needed for this phase.

### Proof

- application/module can resolve required auth dependencies
- no hidden manual provider setup is required

### Mastery gate

Owner draws the provider graph from controller → service → dependencies and explains how Nest resolves each provider.

---

## Phase 4 — Deterministic Required-State Bootstrap

### Trigger

Transactions expect a SYSTEM wallet during startup, but a fresh database cannot reliably create it through an endpoint that itself requires a running app.

A full real-application E2E smoke test therefore depends on deterministic required state.

### Learn

- migration vs seed/bootstrap
- required reference/system data
- idempotent bootstrap
- why startup should not depend on manual DB editing

### Decide

Define how Kori obtains required non-user state:

- SYSTEM revenue wallet
- development/test admin if genuinely needed

### Work

Implement deterministic, idempotent bootstrap.

### Proof

Fresh database:

```text
migrate
→ bootstrap
→ start application
```

without manual DB modification.

If the phase introduces a schema migration, also apply the schema-change testing rule.

### Mastery gate

Owner explains the difference between:

- schema migration
- seed/reference data
- runtime business command

---

## Phase 5 — Make E2E Bootstrap Match Production Bootstrap

### Trigger

Current E2E creates a Nest application but does not apply the same:

- global prefix
- ValidationPipe
- exception filter
- BigInt interceptor
- cookie middleware once introduced

used by the production bootstrap.

Phase 4 must already provide the required SYSTEM/bootstrap state for a fresh full-app smoke test.

### Learn

- composition root
- application bootstrap
- E2E boundary
- why E2E must test the same HTTP application behavior

### Work

Extract/reuse a small shared application configuration mechanism if appropriate.

Ensure E2E can use:

- `/api/v1`
- production-equivalent pipes
- filters
- interceptors
- middleware required by the real HTTP contract

### Proof

One meaningful E2E smoke path through the real configured application from a fresh migrated + bootstrapped database.

### Mastery gate

Owner explains why importing `AppModule` alone does not make an E2E test equivalent to production.

---

## Phase 6 — Close the Unsafe Public Add Money Path

### Trigger

Authenticated clients can currently submit a claimed bank token/reference and cause a SYSTEM-funded credit without trusted provider verification.

### Learn

- trust boundary
- authenticated does not mean trusted financial evidence
- external settlement evidence
- why a client-provided token is not proof

### Work

For now:

- disable/remove the public Add Money financial execution path
- keep the concept documented as future trusted-provider work
- correct README/API claims

### Proof

HTTP cannot create value through the unverified client Add Money path.

### Mastery gate

Owner answers:

> What evidence authorizes money creation/credit into Kori?

### Non-goal

Do not implement a fake payment provider merely to keep the endpoint.

---

# STAGE B — Authentication, OTP, Sessions, and Authorization

This stage introduces **minimal real Redis/PostgreSQL integration test support as soon as a claim depends on real infrastructure**.

Examples:

- atomic OTP consumption → real Redis
- single-use refresh/revocation races → real PostgreSQL

Do not wait for the later financial test harness when authentication correctness already depends on infrastructure semantics.

The later PostgreSQL stage expands this into the stronger financial transaction/concurrency harness.

## Phase 7 — Map and Specify the Authentication State Machine in Plain Language

### Learn

- authentication vs authorization
- identity proof
- registration proof
- session
- trusted device
- access token
- refresh token
- revocation
- public authentication error semantics vs internal observability

### Work

Before changing more auth code, write the desired transitions:

```text
phone
→ OTP requested
→ OTP verified
→ registration authorized
→ account created
→ device/session established
→ login
→ refresh
→ revoke/logout
```

Define which server-side evidence permits each transition.

Also decide the external error-enumeration policy:

- which authentication failures may share a generic client response
- which details belong only in safe internal logs/metrics
- never log PIN/OTP/token secrets

### Proof

Decision notes, not a state-machine framework.

### Mastery gate

Owner can trace each transition and identify what prevents a caller from skipping it.

Owner can also explain why precise internal diagnosis does not require exposing account-existence details to an attacker.

---

## Phase 8 — PIN/OTP Input Invariants and Sensitive Logging

### Trigger

Length validation does not necessarily mean numeric validation; development OTP logging must not become production leakage.

### Learn

- syntactic validation
- secure secrets in logs
- environment-dependent diagnostics

### Work

Define/implement:

- numeric PIN rule
- numeric OTP rule
- safe development OTP behavior
- production-sensitive logging rule

### Tests

New/changed validation behavior gets focused tests.

### Mastery gate

Owner distinguishes:

- "length 4"
- "four numeric digits"

and explains why OTP logging is a security boundary.

---

## Phase 9 — Secure OTP Generation, Attempts, and Resend Policy

### Learn

- cryptographically secure randomness
- brute-force probability
- attempt limiting
- resend throttling
- challenge supersession
- lockout/TTL trade-offs

### Work

Replace development-grade generation/policy where needed.

Define:

- OTP length
- TTL
- max verify attempts
- resend window
- whether resend supersedes the prior challenge
- whether resend resets or preserves attempt state
- behavior after repeated failure
- behavior when Redis is unavailable

### Tests

- attempt exhaustion
- expiration
- resend limits
- valid OTP path
- old challenge cannot invalidate/delete a newer challenge
- concurrency where relevant

Use real Redis when the proof depends on Redis atomicity/TTL behavior.

### Mastery gate

Owner estimates the brute-force space and explains how TTL + attempts reduce risk.

Owner explains what happens when a resend occurs while an older challenge still exists.

---

## Phase 9A — Protect PIN Login From Online Guessing

### Trigger

Current login accepts a short PIN and performs hash verification without a defined attempt-limiting policy.

A client-supplied `deviceId` is an identifier, not brute-force protection.

### Learn

- online credential guessing
- account-based failed-attempt counters
- source/IP/device defense in depth
- observation window
- cooldown/backoff
- account-lockout denial-of-service risk
- limiter failure behavior

### Decide

Define the smallest Kori policy for:

- failed PIN threshold
- observation window
- cooldown/backoff
- reset after successful authentication
- concurrent attempts
- Redis/downstream limiter failure
- safe client error semantics

Do not prescribe Redis keys or a rate-limiter framework before comparing the options.

### Proof

- repeated invalid PINs are bounded according to policy
- concurrent attempts cannot trivially bypass the threshold
- successful authentication resets/updates state according to policy
- failure of the limiter has an explicitly chosen safety/availability behavior
- the design does not create an easy permanent account-lockout DoS

### Mastery gate

Owner explains why IP-only throttling and unlimited account lockout are both insufficient designs.

---

## Phase 10 — Atomic One-Time OTP Consumption

### Trigger

Current:

```text
GET
→ compare
→ DEL
```

can allow concurrent successful verification.

### Learn

- check-and-act race
- atomic compare-and-consume
- Redis script/transaction concepts as applicable

### Work

Choose the simplest mechanism that makes one OTP challenge consumable once.

It must also respect the resend/challenge semantics defined in Phase 9 so an old invalid attempt cannot consume or delete a newer valid challenge.

### Proof

Real Redis integration test with controlled concurrent verification attempts.

Expected invariant:

```text
one OTP challenge
→ at most one successful consume
```

The test should demonstrate actual contention rather than merely launching two promises.

### Mastery gate

Owner narrates the old race and explains why the new operation is atomic.

---

## Phase 11 — Bind Registration Authorization to the Verification Flow

### Trigger

Current `register_clearance:<phone> = GRANTED` is phone-wide and not strongly tied to the successful verification flow.

### Learn

- bearer proof
- registration ticket/session
- one-time authorization
- replay prevention
- caller/device/session binding trade-offs
- cross-system failure recovery

### Compare

Possible approaches:

- opaque one-time server-side registration ticket
- temporary registration session
- short-lived signed proof

Do not choose by pattern name.

### Minimum defensible security claim

Knowing only:

- the phone number
- the device identifier

must be insufficient to authorize registration.

If the chosen proof is a bearer ticket, do **not** claim that "another caller can never use it" unless an additional explicit binding mechanism actually establishes that stronger guarantee.

### Work

Implement the smallest design that:

- proves OTP verification happened
- is purpose-limited to registration
- is limited in lifetime
- cannot be reused indefinitely
- is consumed/invalidated predictably
- cannot be recreated merely from phone/device identifiers

Define failure semantics:

- proof consumed but PostgreSQL registration fails
- registration commits but HTTP response is lost
- client retries after account already exists

A fresh OTP verification after a failed registration is an acceptable v1 policy if chosen deliberately.

### Proof

- phone/device knowledge alone cannot register
- replay behavior is defined
- expiry is defined
- successful registration consumes/invalidates as designed
- database failure/retry path follows the documented policy
- lost-response retry does not create a second account

### Mastery gate

Owner explains exactly what evidence authorizes account creation and which recovery guarantees are intentionally provided.

---

## Phase 12 — Trusted Device Ownership, Re-Enrollment, and Authorization

### Trigger

OTP device `upsert` is globally keyed by `deviceId` and can update a record owned by another user.

Login checks the device through the selected user's relation but ignores `isAuthorized`.

Re-verifying an owned revoked device also raises a credential-retirement question because the existing refresh-token hash may remain.

### Learn

- identifier vs authority
- ownership
- unique identifiers
- authorization state
- credential retirement
- re-enrollment semantics

### Decide

Define:

- whether one `deviceId` is permanently associated with one account
- whether a device can ever move between accounts
- what OTP re-enrollment of a revoked device means
- what happens to old refresh credentials during re-enrollment

### Work

Enforce:

- device belongs to the expected user
- verification cannot mutate another user's device record
- revoked device cannot login
- re-enrollment cannot silently revive old session credentials
- ownership mismatches are explicit security failures

### Proof

Regression tests:

- foreign device mutation rejected
- revoked device login rejected
- valid owned authorized device login succeeds
- revoked device → OTP re-enrollment → old refresh credential remains invalid
- device-transfer behavior follows the chosen policy

### Mastery gate

Owner distinguishes:

```text
device exists
device belongs to actor
device is authorized
device has a currently valid session credential
```

---

## Phase 13 — Define Session, Rotation, and Revocation Semantics Before Implementing More Endpoints

### Learn

- stateless access token
- database-backed session
- immediate vs eventual revocation
- refresh rotation
- single-use credentials
- role/status freshness
- token lifetime trade-offs
- lost-response recovery

### Decide explicitly

At minimum:

- Does device revocation immediately invalidate existing access tokens?
- Or only stop future refresh?
- How quickly do role/status changes become authoritative?
- What happens on simultaneous refresh?
- What happens on simultaneous revoke + refresh?
- What happens on login + revoke concurrently?
- Is one refresh token single-use?
- Is each refresh rotation uniquely identifiable?
- What happens if rotation commits but the new cookie/response never reaches the client?
- What happens if role changes before refresh?

### Conditional requirement

If Kori chooses **single-use refresh tokens**, validation + consumption/replacement must be protected as one atomic database decision.

Do not force this mechanism if the chosen session contract is different.

### Work

Record the chosen semantics before building logout/revoke APIs.

### Mastery gate

Owner can explain security/cost/recovery trade-offs of the chosen model and predict the legal outcome of the listed races.

---

## Phase 14 — Repair Refresh Validation and Rotation

### Inspect

- `JwtRefreshStrategy`
- `refreshTokens`
- stored refresh hash
- `deviceId`
- `payload.sub`
- user role/status

### Learn as needed

This phase may require an early focused introduction to:

- conditional database updates
- small database transactions
- competing writes

The deeper PostgreSQL/MVCC/financial treatment still belongs to Stage D.

### Work

According to Phase 13's contract, ensure:

- trusted device belongs to `payload.sub`
- device is authorized
- account state is valid for refresh
- role/status freshness follows the chosen policy
- rotation behavior is deterministic
- simultaneous refresh behavior is defined
- stale/reused refresh token behavior is defined
- lost-new-cookie behavior follows the chosen recovery contract

Do not perpetually mint fresh authority from an obsolete refresh-token payload if the selected policy says current database role/status is authoritative.

### Proof

Use real PostgreSQL competing operations when the guarantee depends on database race semantics.

Include, according to the chosen contract:

- concurrent use of one refresh token
- two refreshes in the same clock second
- refresh vs revoke
- role change followed by refresh
- rotation commit followed by lost HTTP cookie/response

### Mastery gate

Owner traces a refresh request from cookie → strategy → protected DB decision → rotation → new credentials, including the chosen race outcome.

---

## Phase 15 — Cookie Plumbing and Session HTTP Behavior

### Trigger

Cookie reading requires parser/plumbing and current cookie path `/auth` does not match global `/api/v1` routes.

### Learn

- HttpOnly
- Secure
- SameSite
- Path
- cookie parsing
- CSRF considerations for cookie-based refresh

### Work

Configure real HTTP cookie behavior.

### Proof

E2E:

- login/register sets expected cookie
- refresh receives cookie
- wrong path does not accidentally work
- clearing cookie uses compatible attributes

### Mastery gate

Owner explains why a cookie existing in a response does not mean the browser will send it to every endpoint.

---

## Phase 16 — Access-Token Account/Role Semantics

### Trigger

Access validation checks user existence but currently returns stale token claims and does not clearly enforce current account status.

### Learn

- claims as snapshot
- database authority
- role freshness
- account suspension semantics

### Work

Implement the policy chosen in Phase 13.

### Proof

Examples as required by policy:

- suspended account behavior
- role-change behavior
- deleted account behavior

### Mastery gate

Owner explains which authorization facts are token snapshots and which are checked against current DB state.

---

## Phase 17 — Logout, Revoke Device, and Session Management

### Only now implement

- logout current session/device
- revoke device/session
- optionally list active devices/sessions
- logout all if justified

### Tests

Only the supported behavior.

Include race cases required by Phase 13.

### Mastery gate

Owner explains what logout means for:

- current refresh token
- existing access token
- other devices

---

## Phase 18 — Auth Integration / E2E Completion Gate

### Purpose

Finish and consolidate the auth area before moving deeper into financial architecture.

This phase does **not** postpone testing until the end.

Phases 8–17 must already add regression/integration tests when behavior is introduced or fixed.

Phase 18 assembles the accumulated evidence into one complete lifecycle gate.

### Required flow proof

Production-equivalent HTTP:

```text
OTP
→ verify
→ registration
→ login
→ authenticated request
→ refresh
→ revoke/logout
```

Also prove important failures:

- invalid/expired OTP
- replayed registration proof
- foreign device mutation
- revoked device
- invalid/reused refresh according to policy
- suspended account according to chosen semantics
- PIN abuse control
- relevant concurrent refresh/revoke behavior

### Controller testing rule

Thin auth controllers are primarily proven through this real HTTP behavior.

Do not add controller unit tests merely to raise coverage.

### Unfamiliar mastery scenario

Tutor gives at least one auth/session race or recovery case not copied directly from an existing test.

### Mastery gate

Owner can whiteboard the complete auth/session lifecycle and reason through the unfamiliar scenario without reading the implementation.

---


# STAGE C — Actors, Wallets, Money Commands, and Accounting Semantics

## Phase 19 — Define Role ↔ Wallet Provisioning

### Learn

- identity vs role vs financial account
- provisioning
- authorization

### Define

Target v1 relationship:

```text
CUSTOMER → PERSONAL
AGENT    → AGENT
MERCHANT → MERCHANT
SYSTEM   → no normal user owner
ADMIN    → authorization role, not automatically wallet type
```

### Work

Choose the simplest coherent Agent/Merchant provisioning method for v1.

It may be an admin-only workflow.

Do not create an entire onboarding product unless needed.

### Proof

Transactions cannot rely on ownerless/unresolvable human actor wallets.

### Mastery gate

Owner explains how each transacting actor obtains its wallet.

---

## Phase 20 — Define Account Status vs Wallet Freeze Semantics

### Trigger

`User.status` and `Wallet.isActive` are separate mutable states.

Wallet row locks do not protect user rows.

### Learn

- authentication state
- financial account state
- authoritative mutable state
- locking scope

### Decide

Example direction to evaluate:

```text
User.status
→ account/application access

Wallet.isActive
→ authoritative financial freeze
```

Define how admin suspension should affect both if required.

### Work

Implement one coherent rule.

### Proof

Tests distinguish:

- suspended user
- frozen wallet
- active user with inactive wallet
- timing/race semantics later in PostgreSQL phase

### Mastery gate

Owner explains why locking a wallet cannot make `User.status` atomic.

---

## Phase 21 — Enforce One BDT SYSTEM Revenue Wallet

### Learn

- system/reference accounts
- uniqueness
- deterministic lookup
- why `findFirst()` is unsafe when uniqueness matters

### Work

- define SYSTEM as the fee/revenue account for current v1 scope
- enforce exactly one relevant SYSTEM wallet
- enforce BDT
- deterministic bootstrap and lookup

### Non-goal

Do not use SYSTEM as a generic external-funding source.

### Proof

Database/application proof that ambiguous multiple SYSTEM accounts cannot silently be selected.

If this requires a schema migration, prove it on:

- a fresh database
- representative existing rows relevant to the new constraint

### Mastery gate

Owner explains the accounting meaning of SYSTEM and the migration impact of enforcing uniqueness.

---

## Phase 22 — Domain Error Translation at the Application/HTTP Boundary

### Trigger

Domain exceptions currently become generic 500s through the global filter.

### Learn

- domain exception
- application failure
- infrastructure failure
- HTTP representation
- DIP at a real boundary

### Work

Define how known domain errors become appropriate HTTP responses without importing Nest into the domain.

### Tests

Examples:

- invalid Money range
- invalid typed identity where externally reachable

### Mastery gate

Owner explains why domain code should not throw `BadRequestException`.

---

## Phase 23 — Financial Command Amount Invariants and Product Limits

### Learn

- value-object invariant vs use-case invariant
- storage range vs product transaction limit
- transport validation vs application invariant
- textual input bounds before expensive parsing

### Define

`Money`:

```text
>= 0
within supported representation
```

financial transfer command:

```text
> 0
within product limit
BDT
```

### Work

Choose explicit v1 transaction limits if required.

Do not treat PostgreSQL BIGINT maximum as a sensible product limit.

Do not rely only on HTTP DTO validation; non-HTTP application entry points must not bypass the command invariant.

Ensure HTTP paths can accept/reject integer strings above JavaScript's safe-integer range without converting monetary data to `number`.

### Tests

- zero principal rejected
- malformed principal rejected
- over-limit principal rejected
- amount + fee overflow behavior
- same invariant holds when the application/service is invoked outside the HTTP DTO path
- large integer textual input is handled without `number` precision loss

### Mastery gate

Owner explains why `Money.zero()` remains valid and why DTO validation alone is not the application invariant.

---

## Phase 24 — Enforce BDT at the Real Persistence/Transaction Boundary

### Trigger

DB wallet currency is currently a string and some Money reconstruction defaults to BDT without reading stored currency.

### Learn

- representation default vs validated fact
- DB constraint vs application validation
- existing-data migration impact

### Work

Choose simple BDT-only protection, likely combining:

- database constraint/type decision
- authoritative transaction validation

### Tests

Non-BDT data cannot silently participate in v1 financial execution.

If a migration changes or constrains existing currency data, prove:

- fresh database behavior
- representative legacy values such as old `BD` rows are explicitly handled rather than silently reinterpreted

### Mastery gate

Owner explains why `Money.fromMinorUnits(balance)` defaulting to BDT does not prove the database wallet is BDT.

---

## Phase 25 — Define the Accounting Authority and Funding Model

### This phase is a design prerequisite

Before building a posting abstraction, define what Kori's records mean.

### Learn

- movement history
- materialized balance
- subledger
- opening balance
- funding
- reconciliation

### Decide

At minimum:

- what `wallet.balance` represents
- what ledger rows represent
- what a completed transaction represents
- how test opening balances are created
- how Agent e-float conceptually originates
- what SYSTEM represents
- how a future external Add Money settlement would differ from fee revenue

### Output

A concise accounting decision section.

### No code architecture required yet

### Mastery gate

Owner can account for where every unit of value in Send Money / Cash In / Cash Out / Payment comes from and goes.

---

## Phase 26 — Characterize SEND_MONEY Financial Behavior

### Learn

- characterization testing
- exact posting expectations

### Define exact behavior

Example:

```text
principal = P
fee = F

sender   -= P + F
receiver += P
SYSTEM   += F
```

### Test through appropriate layers

- fee policy unit test already exists
- application behavior as needed
- real DB proof later

Verify:

- accounts
- directions
- amounts
- fee
- transaction metadata

### Mastery gate

Owner accounts for every poisha.

---

## Phase 27 — Characterize CASH_IN Financial Behavior

### Define

Who provides value?

Target concept:

```text
Agent e-float → Customer wallet
```

### Questions

- fee?
- actor authorization?
- required wallet types?
- how is agent float funded in test/product scope?

### Tests

Characterize the intended behavior before restructuring execution.

### Mastery gate

Owner explains the economic meaning of the Agent debit.

---

## Phase 28 — Characterize CASH_OUT Financial Behavior

### Define

Customer transfers principal to Agent and pays the configured fee according to Kori's chosen accounting rule.

### Ensure

- 1.85% fee policy
- explicit half-even settlement
- exact fee posting destination
- exact customer debit

### Tests

- Kori rounding examples
- correct participants and amounts

### Mastery gate

Owner computes a few cash-out fees manually using integer/rational reasoning.

---

## Phase 29 — Characterize PAYMENT Financial Behavior

### Define

- personal sender
- merchant receiver
- current fee behavior
- invoice/reference semantics

### Tests

Exact participant/amount behavior.

### Mastery gate

Owner explains why PAYMENT is not simply SEND_MONEY with a renamed route if the business rules differ.

---

## Phase 30 — Characterize Current Financial Execution Before Major Refactor

### Purpose

Create the smallest regression net needed before changing locks/execution structure.

### Do NOT

write exhaustive tests for every private method.

### Do

protect supported transaction behavior that must survive the next stages.

### Proof

Focused application/integration characterization.

### Exit

We now know what behavior must remain while PostgreSQL correctness is repaired.

---

# STAGE D — PostgreSQL Correctness, Constraints, and Concurrency

## Phase 31 — PostgreSQL Transaction and MVCC Foundations

### Learn deeply

- transaction
- statement
- ACID
- PostgreSQL MVCC
- Read Committed
- snapshots
- row locks
- `FOR UPDATE`
- `FOR NO KEY UPDATE`
- TOCTOU
- deadlock
- serialization/deadlock errors

### No major refactor yet

Use current Kori code to trace:

- preflight reads
- transaction start
- lock query
- rereads
- updates
- commit

### Mastery gate

Owner narrates what another connection can observe at each point.

---

## Phase 32 — Build the Real PostgreSQL Financial Integration Harness

### Learn

- disposable test database
- migrations in tests
- independent connections
- deterministic fixtures
- transaction cleanup

### Work

Create infrastructure for real DB financial tests.

### Proof

One real transaction test proves commit/rollback behavior.

### Mastery gate

Owner explains why a mocked Prisma client cannot replace this layer.

---

## Phase 33 — Derive the Exact Participating Wallet Set

### Trigger

Current code locks sender, receiver, and SYSTEM for every operation.

### Learn

- lock scope
- unnecessary contention
- posting participants

### Work

Define participants from actual financial movement.

Example:

```text
zero-fee payment:
sender + receiver

fee-bearing send:
sender + receiver + SYSTEM
```

Deduplicate IDs.

### Tests

Pure or integration proof of lock-set derivation as appropriate.

### Mastery gate

Owner explains how extra locks harm concurrency even when correctness remains intact.

---

## Phase 34 — Deterministic Database-Side Lock Ordering

### Trigger

JavaScript `.sort()` of IDs passed to `WHERE id IN (...)` does not guarantee PostgreSQL lock acquisition order.

### Learn

- deadlock cycle
- database execution order
- why parameter order is not row acquisition order

### Work

Choose a database-side deterministic lock mechanism.

### Proof

Integration/concurrency tests inspect behavior under opposing transfers.

### Mastery gate

Owner draws the deadlock cycle that inconsistent ordering can create.

---

## Phase 35 — Authoritative Post-Lock Wallet Validation

### Current behavior

After the lock query, the executor currently:

- re-fetches sender, receiver, and SYSTEM wallets
- verifies that those required rows still exist
- rechecks the sender's balance

It does **not** yet authoritatively revalidate all relevant:

- activity state
- required wallet types
- stored currency

under the protection used by financial execution.

### Define protected wallet invariants

For participating wallets as applicable:

- exists
- active
- required type
- BDT
- sufficient balance
- operation-valid

### Work

Move correctness-critical wallet validation into the protected transaction.

Preflight remains an optional UX optimization.

Do not claim protection for mutable state stored in rows/tables that are not part of the chosen locking protocol.

### Proof

Integration tests where relevant state changes between preflight and protected validation.

### Mastery gate

Owner explains:

```text
preflight validation
!=
authoritative validation
```

and explains exactly which rows the locking protocol protects.

---

## Phase 36 — Recipient and SYSTEM Balance Overflow Protection

### Trigger

Principal + fee is Money-checked, but receiver/system existing balance + credit may overflow BIGINT.

### Learn

- arithmetic overflow
- DB error vs domain error
- atomic rollback

### Work

Choose whether Kori explicitly checks protected destination balances before mutation or relies partly on DB range enforcement with clean error translation.

### Proof

- receiver near max
- SYSTEM near max
- no partial financial writes

### Mastery gate

Owner explains why sender amount validity does not prove destination arithmetic validity.

---

## Phase 37 — Add High-Value Database Constraints

### Learn

- CHECK
- UNIQUE
- FK
- index
- constraint limitations

### Candidate constraints

Evaluate, do not blindly add:

- BDT-only
- fee >= 0
- transaction amount > 0
- ledger amount > 0
- one SYSTEM account
- nonnegative normal wallet balance if compatible with chosen model
- relevant sender/receiver restrictions where expressible

### Important

An ordinary CHECK constraint cannot enforce:

```text
sum(all debit rows) = sum(all credit rows)
```

across multiple rows.

### Proof

Migration + integration tests.

### Mastery gate

Owner can say which invariant belongs in:

- domain
- application
- transaction executor
- database constraint

and why.

---

## Phase 38 — Atomic Rollback and Failure Injection

### Learn

- transactional atomicity
- fault injection

### Test

Force failure after selected financial writes are attempted.

Assert:

- no partial transaction record
- no partial wallet changes
- no partial ledger changes

### Mastery gate

Owner explains what Prisma transaction rollback guarantees and what it does not guarantee outside PostgreSQL.

---

## Phase 39 — Controlled Final-Balance Concurrency Test

### Scenario

Two requests try to spend the same final available balance.

### Test design

Use:

- independent DB connections
- controlled barriers/synchronization
- bounded waits
- final committed-state assertions

### Valid result

Only a serializable-valid outcome.

### Mastery gate

Owner narrates both transactions statement by statement.

---

## Phase 40 — Opposing Transfer / Deadlock Test

### Scenario

```text
A → B
B → A
```

concurrently.

### Learn

- deadlock possibility
- deterministic order
- PostgreSQL abort behavior
- retry policy if needed

### Proof

The test must demonstrate the intended bounded outcome, not claim "deadlocks are impossible."

### Mastery gate

Owner explains why deterministic locking reduces deadlocks but PostgreSQL may still abort transactions.

---

## Phase 41 — Freeze vs Transfer Race

### Learn

Concurrency correctness may allow more than one result depending on ordering.

### Explicit legal schedules

If freeze gets relevant protection first:

```text
transfer rejects
```

If transfer gets relevant protection first:

```text
transfer may commit
then freeze applies
```

### Work

Define the actual Kori semantics.

### Proof

Controlled tests for both legal schedules where practical.

### Mastery gate

Owner explains why "freeze requested concurrently means every transfer must fail" may be an unjustified stronger guarantee.

---

## Phase 42 — Deepen Database Migration Compatibility

### Trigger

Earlier schema-changing phases already apply the project migration-testing rule.

Historical migrations also demonstrate why deeper migration knowledge is needed:

- old `BD` rows may remain when only the default changes to `BDT`
- adding required idempotency key without backfill fails on non-empty data

### Learn

- fresh-schema correctness
- upgrade correctness
- backfill
- expand/migrate/contract ideas
- application/schema compatibility
- migration ownership

### Work

Do not rewrite migration history blindly.

Define how Kori will validate risky migrations going forward.

### Proof

At least:

- fresh database migration
- representative existing-data upgrade
- application compatibility during the chosen rollout sequence for a meaningful future schema change

### Mastery gate

Owner explains why `prisma migrate` succeeding on an empty DB does not prove a safe production migration.

---


# STAGE E — Durable Idempotency and Retry Semantics

## Phase 43 — Define the Idempotency Contract Before Rewriting It

### Learn

- financial intent
- at-most-once effect
- replay
- fingerprint
- ambiguous result
- crash window
- retention boundary

### Decide explicitly

- key scope
- actor scope
- operation scope
- payload fingerprint
- retention
- key reuse
- mismatch behavior
- in-flight behavior
- successful replay behavior
- failed-pre-execution behavior
- replay authorization
- original response semantics

### Scope statement

The at-most-once effect applies to the **chosen durable request-identity scope and retention policy**.

If a client chooses a completely new request key after a timeout, the server cannot automatically know that the human intended it to be the same request.

### Important

A committed replay should not rerun old spending/eligibility checks and accidentally return a new result.

### Mastery gate

Owner can describe every request state before code changes.

---

## Phase 44 — Choose the Smallest Durable Idempotency Persistence Model

### Compare

- extend existing transaction record
- dedicated request/intent record
- another minimal durable design

### Decision criteria

Need to answer:

- can request identity be durably arbitrated?
- can original committed result be recovered?
- can changed payload be rejected?
- can actor/operation scope be enforced?
- can ambiguous outcomes be resolved?
- can the information needed for replay commit consistently with the financial outcome?
- can retention/key-reuse policy be represented?

### Non-goal

Do not create an elaborate distributed idempotency platform.

### Mastery gate

Owner explains why the chosen schema exists and which guarantee each durable field supports.

---

## Phase 45 — Define Request Fingerprint, Scope, and Replay Authorization

### Learn

- canonicalization
- equality of intent
- actor/operation isolation
- replay authorization
- durable uniqueness scope

### Work

Define request identity before implementing replay.

Ensure a client key is not globally meaningful by itself.

The durable database uniqueness scope and any Redis cache/coordination scope must describe the same intended contract.

Reject or distinguish according to policy:

- same scoped key + materially different payload
- same client key used by a different actor
- same client key used for another operation
- unauthorized access to another actor's committed result

### Important

Fingerprint comparison must not become a loophole where:

```text
same key + changed payload
```

is treated as a new executable financial intent.

### Proof

- same key, different actor
- same key, different operation
- same key, changed payload
- valid exact replay identity

### Mastery gate

Owner explains the chosen identity tuple and why a key alone is not authorization.

---

## Phase 46 — Durable Request Arbitration Before Mutable Execution Decisions

### Core race

Two identical requests can both initially observe:

```text
no committed result
```

Then:

```text
Request A acquires financial protection
Request B waits
A executes and commits
B resumes
```

The losing duplicate must resolve the already-committed intent rather than make a fresh mutable decision such as:

```text
Insufficient funds
```

### Learn

- uniqueness arbitration
- request ownership
- waiting/losing duplicate behavior
- PostgreSQL transaction-abort semantics

### Work

Whichever persistence model Phase 44 selected must durably determine:

```text
Am I the executor of this intent?
or
Am I a replaying/losing duplicate?
```

before a duplicate request can incorrectly continue as a fresh financial command.

If uniqueness arbitration aborts a PostgreSQL transaction, recovery of the winning result must happen from a valid transaction/context rather than assuming queries can continue inside the aborted transaction.

### Proof

Controlled concurrency:

```text
same actor
same operation
same durable request identity
two overlapping requests
```

Both initially miss a committed result.

Exactly one financial effect commits.

The loser resolves the winner's durable result according to the contract.

### Mastery gate

Owner narrates the overlapping-request schedule statement by statement and identifies the arbitration point.

---

## Phase 47 — Recover and Replay the Original Committed Result

### Core behavior

Conceptually:

```text
authenticate
↓
identify + authorize request intent
↓
durable arbitration / existing committed outcome
↓
matching committed result?
    YES → return original committed result
    NO  → executor continues
```

### Work

Implement committed-result recovery without rerunning old execution eligibility.

Replay authorization may check whether the current caller is allowed to access the stored result.

Do not:

- recompute today's fee
- return today's wallet balance as though it were the original response
- rerun the old sufficient-funds decision
- infer the original response only from Redis

### Proof

Example with current SEND_MONEY fee:

```text
starting balance = 1500
principal = 1000
fee = 500
request commits successfully
resulting sender balance = 0
HTTP response is lost
same request identity retries
→ original committed success returned
```

not:

```text
Insufficient funds
```

Also cover application restart after commit but before successful response/cache delivery.

### Mastery gate

Owner explains why committed replay is recovery of history, not re-execution of the command.

---

## Phase 48 — Precise Database Uniqueness and Error Semantics

### Trigger

Current financial executor maps every Prisma `P2002` to an idempotency conflict.

### Learn

- database error taxonomy
- constraint target
- aborted transaction context
- semantic error translation

### Work

Only translate the relevant durable request-identity conflict as idempotency behavior.

Other uniqueness errors must preserve their real meaning.

### Tests

- unrelated uniqueness failure does not masquerade as duplicate request
- durable arbitration conflict resolves through the chosen replay path
- recovery is performed from a valid transaction/context

### Mastery gate

Owner explains why database error code alone may be too broad.

---

## Phase 49 — Redis Coordination Semantics

### Learn

Separate:

```text
financial safety
```

from:

```text
availability / fast collision handling
```

### Current problems to address if Redis coordination remains

- key lacks actor/operation scope
- Redis unavailable currently behaves like processing collision
- stale `PROCESSING`
- expiry/reacquisition race
- old request can unconditionally `DEL` a newer marker
- an expired old worker could also blindly overwrite newer coordination state on completion

### Work

Decide what Redis is allowed to do after durable PostgreSQL idempotency exists.

Valid outcomes include:

- keep Redis as owned short-lived coordination/replay acceleration
- simplify it substantially
- remove unnecessary coordination if PostgreSQL already provides the needed safety

If Redis leases remain, release/completion must be ownership-aware.

PostgreSQL remains authoritative.

### Proof

Real Redis integration tests for the coordination semantics that remain.

### Mastery gate

Owner explains:

- what happens when Redis disappears completely
- what safety guarantee survives
- what availability/performance behavior changes

---


## Phase 49A — Idempotency Integration / Concurrency / E2E Gate

### Required scenarios

- simultaneous same-intent requests where both initially observe no committed result
- changed payload
- same key across actors
- same key across operations
- committed result replay after sender state changes
- application restart after commit but before response/cache delivery
- rollback before commit
- Redis loss
- retention/key-reuse behavior
- unrelated unique violation
- expired/reacquired Redis coordination if coordination remains

### Proof

Use real PostgreSQL where durability/races matter.

Use real Redis only for Redis-specific guarantees that remain.

Use HTTP E2E for public response/replay behavior.

### Important test rule

Financial overspending/concurrency tests use different idempotency keys unless the test is explicitly about duplicate-request arbitration.

### Unfamiliar mastery scenario

Tutor supplies a crash/retry schedule not copied from an existing test.

### Mastery gate

Owner describes every crash/arbitration point without using "exactly once" as a shortcut.

---

# STAGE F — Earned Architecture, SOLID, and Design Patterns

## Phase 50 — Architecture Review Checkpoint: Does TransactionsService Actually Need Splitting Now?

### Important

This phase does **not** require a refactor.

### Learn

- cohesion
- coupling
- reason to change
- transactional cohesion
- SRP

### Exercise

Review actual changes from earlier phases.

Ask:

- Which changes repeatedly touched fee/policy code?
- Which touched locking/persistence?
- Which touched response mapping?
- Which responsibilities now vary independently?
- Which code remains naturally cohesive?

### Possible result

```text
keep service mostly intact
```

is valid.

### Mastery gate

Owner can justify both extracting and not extracting.

---

## Phase 51 — Introduce a Small Posting Structure Only If It Solves a Real Problem

### Candidate problem

A small explicit posting list may make these easier:

- balanced amount validation
- participant derivation
- lock-set derivation
- ledger generation
- reasoning about fees

### Start simple

Prefer:

```text
plain immutable data
+
pure validation function
```

before a complex class hierarchy.

### Promote to a domain type only if

- invariants belong to it
- multiple callers need it
- construction needs protection

### Tests

Pure posting arithmetic/invariant tests.

### Mastery gate

Owner explains what became safer or simpler.

---

## Phase 52 — Transaction Policy Boundary Only If Variation Has Earned It

### Existing baseline

The functional fee strategy is already valid.

### Candidate policy variation

- sender type
- receiver type
- fee
- SYSTEM participation
- operation-specific eligibility
- description metadata

### OCP lesson

Introduce a richer policy boundary only if stable execution code is repeatedly polluted by transaction-type branches.

### Non-goal

No mandatory class per transaction type.

### Mastery gate

Owner can point to the repeated change pressure that justified the abstraction.

---

## Phase 53 — Application Use-Case Boundary / DIP Only If It Improves Real Coupling

### Candidate responsibility

- resolve actor
- resolve recipient
- apply transaction policy
- invoke financial execution
- return application result

### Learn

- application orchestration
- DIP
- framework/infrastructure boundary

### Important

Do not add:

```text
controller
→ service
→ use case
→ manager
→ repository
```

without a concrete need.

### Mastery gate

Owner identifies the dependency direction before/after and the practical benefit.

---

## Phase 54 — ISP and LSP Through Real Contracts, Not Artificial Exercises

### ISP

Introduce narrow ports only for real consumers.

### LSP

Use a real adapter contract later if one exists.

Examples:

- payment provider
- notification provider

A fake/test implementation may reveal substitutability issues.

### No production work required if no real contract exists

### Mastery gate

Owner explains LSP behaviorally rather than as "child class can replace parent class."

---

## Phase 55 — Stabilize the Financial Application Boundary

### Goal

After any earned refactor:

- PostgreSQL/concurrency tests remain green
- idempotency tests remain green
- operation behavior remains correct
- abstractions have names matching responsibilities
- no architecture exists solely for portfolio optics

### Exit

Financial execution architecture is considered stable enough to build more product surface on top.

---

# STAGE G — Product Completion

## Phase 56 — Transaction History Ownership Model

### Learn

- read authorization
- query model
- immutable financial history

### Decide

Who may read which transactions?

A user should not gain history access merely from knowing a transaction ID.

### Work

Define owned transaction history.

### Tests

No cross-user leakage.

### Mastery gate

Owner explains read authorization separately from transaction execution authorization.

---

## Phase 57 — Cursor Pagination

### Learn

- offset vs cursor
- stable ordering
- tie-breaker
- inserts during pagination

### Work

Implement transaction history pagination.

Use deterministic ordering such as:

```text
createdAt + id
```

as appropriate.

### Tests

Pagination remains stable while newer records are inserted.

### Mastery gate

Owner explains why offset pagination can drift.

---

## Phase 58 — Transaction Details and Public Identifier Semantics

### Work

Define:

- public transaction lookup ID
- ownership/visibility
- response representation
- internal UUID exposure policy

### Tests

Authorized details only.

### Mastery gate

Owner explains public ID vs internal identity.

---

## Phase 59 — Define Reversal Semantics and Eligibility by Operation

### Core principle

Reversing Kori wallet postings does not automatically reverse an external or physical-world event.

Examples:

- CASH_OUT may already involve physical cash handed to the customer
- CASH_IN may already involve physical cash received by the agent
- PAYMENT may represent merchant fulfillment/refund policy
- future ADD_MONEY may represent an external provider settlement

A generic compensating transfer must not silently become a universal refund mechanism.

### Build an explicit eligibility matrix

For each transaction type define:

```text
Transaction type
→ reversal supported?
→ who may initiate/authorize?
→ what external/business evidence is required?
→ are fees reversed?
→ what wallet states are allowed?
```

It is acceptable for v1 to support reversal only for a deliberately chosen subset.

### Questions that must be answered

- Who can reverse?
- Can an original transaction be reversed twice?
- Can two different idempotency keys race to reverse the same original?
- Are fees reversed?
- What if recipient already spent the funds?
- What if an involved wallet is frozen?
- Can reversal itself be reversed?
- Are partial reversals out of v1?
- What amounts are used if fee policy later changes?
- What external/physical facts make reversal invalid or require a different workflow?

### Minimum recommended v1 direction to evaluate

- one full reversal for explicitly supported transaction types
- no partial reversal
- tied uniquely to original transaction
- uses original committed amounts

### No code until semantics are clear

### Mastery gate

Owner can explain reversal as compensation, not deletion, and can explain why different transaction types may require different reversal policies.

---

## Phase 60 — Implement Supported Reversal as Compensating Financial Movement

### Work

Implement reversal only for the operation types explicitly approved in Phase 59.

Use the same protected financial correctness mechanisms.

Do not:

- edit historical ledger rows
- pretend the original transaction never happened
- recompute original principal/fee from today's pricing
- assume request idempotency alone enforces one reversal per original transaction

### Proof

- one allowed reversal
- second reversal of the same original is rejected even when it uses a different request key
- concurrent different request keys cannot reverse the same original twice
- original history retained
- compensating postings use original recorded amounts
- rejected reversal leaves all affected balances/postings unchanged
- fee behavior matches the chosen reversal policy
- concurrency/idempotency covered

### Mastery gate

Owner explains why immutable history matters and why "one reversal per original" is a different invariant from "one execution per request key."

---

## Phase 61 — Build Reconciliation as Detection, Not Automatic Repair

### Learn

- reconciliation
- materialized balance verification
- consistent snapshot/cutoff
- drift detection
- prevention vs detection vs repair

### Detect at minimum

- completed transaction with expected postings missing
- wrong/unbalanced postings
- balanced postings credited/debited to the wrong wallet
- incorrect fee
- duplicated posting
- impossible transaction/posting relationships
- wallet balance disagreement with the chosen ledger model

### Important

```text
0 debit == 0 credit
```

does not mean a completed financial transaction is valid.

Also:

```text
createdAt + random UUID
```

may provide deterministic application display order, but must not be treated as a universal financial commit sequence.

Do not use "latest `LedgerEntry.balanceAfter` by createdAt" as financial truth unless Kori later establishes a reliable per-wallet ordering model.

### Snapshot semantics

Reconciliation itself has a concurrency model.

At PostgreSQL Read Committed, successive queries may observe different committed snapshots.

Choose deliberately:

- quiescent/offline reconciliation, or
- one explicitly consistent database snapshot/isolation strategy

Normal concurrent valid transactions must not create false drift findings.

### Work

Start with offline/admin reconciliation.

Prefer deriving expected materialized balance from the chosen opening/funding basis + ledger movements rather than assuming timestamp order creates financial sequence.

### Automated proof gate

Fixtures must include:

- fully valid dataset → passes
- completed transaction with all postings missing → detected
- balanced postings to wrong wallet → detected
- incorrect fee → detected
- duplicate posting → detected
- wallet balance modified independently → detected
- normal concurrent valid activity → no false corruption finding under the chosen snapshot model

### No automatic repair initially

Detection must not automatically mutate financial state.

### Unfamiliar mastery scenario

Tutor provides a corruption pattern not already in the fixture set.

### Mastery gate

Owner explains:

- prevention vs detection vs repair
- the chosen reconciliation snapshot model
- why balanced totals alone are insufficient
- why timestamps are not automatically commit order

---

## Phase 62 — Trusted Add Money Provider Integration (OPTIONAL FOR INITIAL V1)

This phase is **conditional**. If its trigger never appears, mark it `NOT_REQUIRED` and record:

- why Kori does not need it
- what future concrete trigger would reopen the decision


Enter this phase only if we deliberately select a real sandbox/provider contract.

### Learn

- webhook authenticity
- provider event ID
- signature verification
- settlement
- replay
- provider state
- external trust boundary

### Important accounting question

Do not debit fee revenue to represent external value entering Kori.

Define the provider settlement/funding account model first.

### Work

Provider-controlled verified flow.

### Proof

- invalid signature rejected
- duplicate provider event replay-safe
- amount/currency verified
- no client assertion alone can create value

### Mastery gate

Owner explains the difference between:

```text
client says payment happened
```

and:

```text
trusted provider proves settlement event
```

---

## Phase 63 — Domain/Application Events (OPTIONAL)

This phase is **conditional**. If its trigger never appears, mark it `NOT_REQUIRED` and record:

- why Kori does not need it
- what future concrete trigger would reopen the decision


Only enter if one committed business fact has independent consumers.

Examples:

- transaction completed → notification
- transaction completed → analytics

### Start

Direct call may still be simpler.

### Mastery gate

Owner identifies why event decoupling is better than a direct call for this actual case.

---

## Phase 64 — Transactional Outbox (OPTIONAL)

This phase is **conditional**. If its trigger never appears, mark it `NOT_REQUIRED` and record:

- why Kori does not need it
- what future concrete trigger would reopen the decision


Only enter if an asynchronous side effect must survive:

```text
DB commit
→ process crash
```

### Learn

- atomic event persistence
- at-least-once delivery
- consumer idempotency
- retries
- poison messages

### Non-goal

Do not add an outbox merely because "financial systems use outbox."

### Mastery gate

Owner explains why the outbox solves a crash window and why duplicate delivery still exists.

---

# STAGE H — Security, Integrity, API Quality, and Operations

## Phase 65 — Second Security Review / Threat Model

Early auth/security bugs were already fixed in Stage B.

Now perform a broader review.

### Cover

- authentication
- authorization
- session theft/replay
- OTP abuse
- idempotency data leakage
- admin endpoints
- transaction history
- provider trust
- sensitive logs
- secrets
- denial of service
- rate limits

### Output

Prioritized threat list tied to real controls.

### Mastery gate

Owner can identify:

- asset
- attacker
- entry point
- control
- residual risk

---

## Phase 66 — Error Taxonomy and Safe Logging

### Learn

- expected domain failure
- authorization failure
- infrastructure failure
- programmer error
- correlation

### Work

Ensure errors are:

- meaningful to clients
- safe
- observable
- not leaking secrets/OTP/PIN/token material

### Tests

Critical API error envelopes.

### Mastery gate

Owner explains what gets logged internally vs returned externally.

---

## Phase 67 — Health, Readiness, and Graceful Shutdown

### Learn

- liveness
- readiness
- startup dependency
- SIGTERM
- draining
- connection shutdown
- in-flight financial request behavior during termination

### Work

Add operational endpoints/behavior.

### Proof

Demonstrate observable behavior:

- liveness answers the intended process-health question
- a required dependency failure changes readiness according to policy
- SIGTERM stops accepting new work
- in-flight financial work resolves according to the durable retry/idempotency contract
- DB/Redis/application connections close within a defined bound

### Mastery gate

Owner explains why:

```text
process is alive
```

is different from:

```text
safe to receive traffic
```

and explains what happens to an in-flight financial request during shutdown.

---

## Phase 68 — Structured Logging and Correlation IDs

### Learn

- request correlation
- structured fields
- financial identifiers
- privacy

### Work

Add enough observability to trace a failed transaction without logging secrets.

### Mastery gate

Owner can trace one request across controller/service/DB logs.

---

## Phase 69 — API Documentation and Contract Quality

### Improve

- request/response examples
- minor-unit naming
- auth requirements
- idempotency behavior
- error semantics
- pagination
- disabled/optional Add Money status

### Rule

Documentation claims must match automated evidence.

### Mastery gate

Owner can use the docs to explain the API without reading source code.

---

## Phase 70 — Query Plans, Index Review, and Measured Performance

### Learn

- index selectivity
- composite indexes
- `EXPLAIN ANALYZE`
- N+1
- connection pool
- hot rows

### Work

Optimize only measured/reasoned problems.

Review:

- duplicate idempotency index
- history pagination indexes
- SYSTEM hot-row implications
- wallet lookup patterns

### Non-goal

Do not build asynchronous fee posting or sharding for hypothetical scale.

### Mastery gate

Owner explains one query plan and why an index helps or does not help.

---

## Phase 71 — Migration and Data-Compatibility Discipline

### Build on Phase 42

Define the ongoing rule for migrations:

- tested against fresh DB
- tested against representative existing state for risky changes
- data backfills explicit
- application/schema compatibility considered
- one migration owner during deployment

### Mastery gate

Owner can explain safe rollout of a schema change without saying "Prisma handles it."

---

# STAGE I — Production Delivery and Deployment

Cloud deployment remains late.

Minimal CI may exist earlier once local commands are reliable; this stage matures it into a production delivery system.

## Phase 72 — Production Runtime Requirements

### Learn

- build artifact
- runtime dependencies
- environment configuration
- Prisma generation/runtime
- non-root process
- graceful shutdown
- dependency pruning

### Important current check

Runtime code depends on Prisma components; production dependency pruning must be validated in the real image.

### Mastery gate

Owner distinguishes development dependency convenience from production runtime requirements.

---

## Phase 73 — Production Docker Image

### Learn

- Dockerfile
- layers
- multi-stage build
- build vs runtime image
- dependency pruning
- Prisma generation/runtime
- `.dockerignore`
- non-root execution

### Work

Create production API image.

### Proof

Start the **actual pruned production image** successfully against controlled dependencies.

Exercise at least one meaningful HTTP path that reaches the real application/runtime dependencies, including Prisma.

A successful TypeScript build alone does not prove production dependency pruning is correct.

### Mastery gate

Owner can explain every Dockerfile stage and identify which packages/files are required at runtime.

---

## Phase 74 — Full Local Containerized Stack

### Work

Run reproducibly:

- API
- PostgreSQL
- Redis

Optional development tools may remain separate.

### Learn

- container networking
- service names
- volumes
- health dependencies
- environment injection

### Proof

Fresh machine/environment workflow is documented.

### Mastery gate

Owner explains why `localhost` inside a container is not the host machine.

---

## Phase 75 — CI Baseline Maturation

If a small CI gate was introduced after Stage A, expand it now.

### CI should eventually run

```text
install
↓
typecheck
↓
non-mutating lint
↓
unit tests
↓
integration tests
↓
PostgreSQL concurrency tests where practical
↓
E2E
↓
build
↓
container build
```

Some expensive tests may use separate jobs.

### Rule

CI does not run auto-fix lint as its verification command.

### Mastery gate

Owner explains why CI should produce evidence, not mutate code.

---

## Phase 76 — Immutable Tested Build Artifact / Registry

### Learn

- image tag
- commit SHA
- image digest
- immutable artifact
- registry
- promotion
- provenance

### Work

CI creates one immutable image artifact.

The artifact that passes the required release tests is the artifact promoted forward.

Prefer:

```text
tested image digest
→ promoted image digest
```

over rebuilding the same source commit for each environment.

### Mastery gate

Owner can answer:

> Which exact artifact is running?

using the immutable digest rather than guessing from a branch/tag.

---

## Phase 77 — Cloud Architecture Design

### Learn

- compute
- managed PostgreSQL
- managed Redis
- VPC/networking
- public/private subnets conceptually
- firewall/security groups
- DNS
- TLS
- secrets
- connection budgets
- cost

### Design first

Do not click random cloud services until the topology is understood.

### Mastery gate

Owner draws request flow from Internet → API → DB/Redis.

---

## Phase 78 — Secrets and Network Exposure

### Before public exposure

Ensure:

- DB not publicly open unless intentionally required
- Redis not publicly open
- secrets injected safely
- TLS configured
- only required API ports reachable

### Mastery gate

Owner identifies every externally reachable port and why it exists.

---

## Phase 79 — Managed PostgreSQL and Redis

### Learn

- connection limits
- persistence assumptions
- availability
- maintenance
- Redis failure behavior
- PostgreSQL backup model

### Work

Configure production services according to Kori's real safety/availability assumptions.

### Mastery gate

Owner explains what happens to financial safety if Redis is unavailable.

---

## Phase 80 — Deployment Migration Procedure

### Learn

- application/schema compatibility
- migration ownership
- rolling/deployment ordering
- backfill strategy

### Work

One controlled process performs schema migration.

### Proof

Practice a compatible deployment change.

### Mastery gate

Owner explains why application rollback is not the same thing as database rollback.

---

## Phase 81 — CD Pipeline and Private Deployment Rehearsal

### Learn

- promotion
- environment
- health verification
- deployment failure
- rollback

### Work

Automate deployment only after the manual process is understood.

Private/staging deployment rehearsal may happen before every operational drill is complete.

### Public-release rule

Do not treat "deployed successfully" as "safe for public reliance."

Public/demo reliance waits for the relevant:

- monitoring
- restore evidence
- rollback/failure evidence
- secrets/network/TLS checks
- migration procedure

defined in the following phases.

### Mastery gate

Owner can manually describe every CD step, the promoted image digest, and the failure points before relying on automation.

---

## Phase 82 — Monitoring and Alerts

### Add useful signals

Examples:

- request errors
- latency
- DB connection pressure
- Redis availability
- transaction failure rate
- reconciliation failures
- process health

### Non-goal

Do not create a huge observability platform without useful questions.

### Mastery gate

Owner can diagnose one simulated failure using telemetry.

---

## Phase 83 — Backup, Restore, and Recovery-Point Exercise

### Learn

- backup
- point-in-time recovery concept
- restore
- RPO
- RTO
- acknowledged-history loss vs internal consistency

### Work

Restore PostgreSQL into a separate environment.

Record:

- backup/recovery point
- expected data-loss boundary
- how Redis caches/session state are treated after restore

Then run reconciliation.

### Important limitation

A restored database can be internally consistent and still be missing transactions acknowledged after the recovery point.

Therefore:

```text
reconciliation passes
!=
proof that no acknowledged committed history was lost
```

### Mastery gate

Owner explains:

- why "backups are enabled" is insufficient
- why restore must be tested
- what RPO/RTO mean
- why reconciliation cannot by itself prove zero history loss

---

## Phase 84 — Rollback and Failure Drills

### Practice

- bad application release
- application/schema compatibility issue
- Redis outage
- DB connectivity issue
- failed migration scenario
- corrupted test fixture detected by reconciliation

### Mastery gate

Owner explains:

- detection
- containment
- recovery
- data integrity verification

---

## Phase 85 — Cost Planning and Measured Cost Review

### Before provisioning paid resources

Estimate major cost drivers:

- compute
- PostgreSQL
- Redis
- storage
- backup retention
- network
- logs/metrics

Set sensible development/demo budget limits or alerts before creating paid resources where supported.

### After deployment rehearsal

Review measured usage/cost and compare it with the estimate.

### Mastery gate

Owner can explain:

- expected major cost drivers before provisioning
- observed cost drivers afterward
- why the chosen design is affordable for Kori's portfolio/demo scale

---


# STAGE J — Portfolio and Interview Hardening

## Phase 86 — Documentation Truth Pass

### Work

Audit:

- README
- architecture docs
- API docs
- diagrams
- setup instructions

Remove claims not backed by implementation/proof.

Examples to avoid unless demonstrated:

- production-grade
- deadlock-proof
- exactly-once
- hardware-bound
- perfectly scalable

### Mastery gate

Every major README claim can point to implementation/tests/operational evidence.

---

## Phase 87 — Architecture Decision Review

### Review major decisions

Examples:

- Money
- UserId vs WalletId
- auth/session semantics
- BDT-only
- SYSTEM meaning
- PostgreSQL locking
- idempotency
- posting structure
- repositories intentionally not used
- cloud topology

### Output

Selective ADRs only for decisions worth preserving.

Do not document every trivial choice.

---

## Phase 88 — Backend Interview Drills

Owner should be able to answer deeply:

- What does ACID mean in Kori?
- How does MVCC affect your transaction?
- Why does JS sorting not guarantee lock order?
- How do you prevent double spending?
- What does idempotency guarantee?
- Why doesn't Redis provide financial authority?
- What happens after commit but before response?
- Why do you keep wallet balance if the ledger exists?
- How does reconciliation work?
- Why not microservices?
- Why no generic repositories?
- Where did SOLID actually improve the design?
- Which patterns did you intentionally reject?
- How does refresh revocation work?
- What happens when a wallet freeze races a transfer?
- How are migrations deployed safely?
- How do you restore the financial database?

---

## Phase 89 — Final Unfamiliar Mastery Scenarios

Major stages should already include short unfamiliar mastery cases where appropriate.

This phase performs the final cross-stage synthesis.

The tutor should give problems not copied from the code.

Examples:

```text
A → B and B → C concurrently
```

```text
freeze B while A → B is waiting
```

```text
transaction commits but client loses connection
```

```text
same idempotency key, changed amount
```

```text
recipient balance near BIGINT maximum
```

```text
role changes while access token exists
```

```text
restore from a backup that is internally consistent but behind an acknowledged transaction
```

Owner reasons about valid outcomes before looking at implementation.

This is evidence of understanding rather than memorization.

---

## Phase 90 — Final Kori V1 Review

### Definition of done

Kori v1 is complete when:

- supported auth/session flows work end to end
- unsafe money creation is disabled or genuinely verified
- UserId/WalletId/ownership rules are explicit
- supported financial operations have defined semantics
- BDT and amount rules are enforced
- PostgreSQL transaction/locking behavior is proven
- concurrency tests exercise real DB behavior
- financial writes are atomic
- ledger/posting behavior is correct
- durable idempotent replay is deterministic
- transaction history is authorized/paginated
- reversals are compensating and protected if included
- reconciliation can detect meaningful drift
- production runtime is containerized
- CI verifies the important gates
- cloud deployment is reproducible
- secrets/networking/TLS are understood
- migrations have a controlled procedure
- backup/restore has been exercised
- README/docs match reality
- owner can defend the architecture and failure modes

---

# 11. What We Explicitly Postpone

Unless a new concrete requirement appears:

- microservices
- CQRS
- Event Sourcing
- distributed Saga
- Kubernetes
- sharding
- multi-currency/FX
- generic repositories
- custom Unit of Work
- inheritance-heavy domain model
- Specification framework
- broad event-driven rewrite
- asynchronous fee posting to "solve" the SYSTEM hot row
- fraud/ML decisioning in the financial write path
- real-money production launch

These topics may be studied conceptually later without adding them to Kori v1.

---

# 12. Evidence Ledger Format

For each completed phase, add a short status entry somewhere maintained with the roadmap.

Prefer:

```text
claim
→ test/scenario
→ result
→ revision/commit
```

Optional phases may be closed as `NOT_REQUIRED` with a reason + reconsideration trigger.

Example:

```text
Phase 1 — Money / Fee Closure

Implementation:
IMPLEMENTED

Proof:
UNIT_PROVEN

Mastery:
APPLIED

Commits:
- 8c2e079 Money VO
- c739035 Money transaction integration
- c358699 rounding/currency fixes
- 9d84bf4 rounding tests
- <future fee-policy-test commit>

Commands:
- npm test -- <relevant specs>

Notes:
- no Money.subtract()
- fee settlement = half-even
```

Do not infer completion merely from file presence.

---

# 13. Phase Review Template

When beginning a phase, ChatGPT should use roughly this structure:

```text
1. What concept are we learning?
2. What exact Kori defect/problem triggers it?
3. What does current code actually do?
4. What invariant/behavior do we want?
5. What are the realistic design options?
6. What trade-offs matter?
7. Which option is the smallest justified choice?
8. What should NOT be introduced?
9. What is the owner's focused implementation task?
10. What automated evidence closes the phase?
11. What mastery questions should the owner answer?
```

---

# 14. Roadmap Change-Control Rule

Do not rewrite the roadmap after every commit.

Change the roadmap only when:

- a factual assumption is wrong
- a prerequisite was missing
- a design decision materially changes
- a phase proves unnecessary
- a newly discovered risk changes ordering
- an external integration is deliberately added

Routine progress updates should change status/evidence, not redesign the curriculum.

---

# 15. Current Next Steps

At repository checkpoint `ab1fb85`, follow this order:

```text
Phase 1
Close Money/Fee milestone
        ↓
Phase 2
Green meaningful unit-test baseline
without mass-retrofitting tests
        ↓
Phase 3
Nest Auth composition
        ↓
Phase 4
Deterministic SYSTEM/bootstrap state
        ↓
Phase 5
Production-equivalent E2E bootstrap
        ↓
Phase 6
Disable unsafe public Add Money
        ↓
Phase 7
Specify auth/session transitions
        ↓
Phase 8
PIN/OTP input + logging invariants
        ↓
Phase 9
OTP generation / attempts / resend
        ↓
Phase 9A
PIN-login abuse protection
        ↓
Phase 10
Atomic OTP consumption
```

Do **not** begin a major `TransactionsService` architecture refactor yet.

The PostgreSQL and idempotency correctness stages must protect behavior first.

---

# 16. Final Principle

The strongest version of Kori is not the version with the most:

- folders
- interfaces
- classes
- patterns
- cloud services

It is the version whose owner can explain:

```text
why every financial effect is valid,
why concurrent execution is safe,
why retries cannot duplicate the intent,
why each abstraction exists,
how incorrect state is detected,
and how the finished application is deployed and recovered.
```

Depth over vocabulary.

Evidence over claims.

Real problems before patterns.

---

# Appendix A — Final Adversarial Audit Incorporation Record

This revision incorporates the final Astra Max adversarial review.

Accepted changes include:

- bootstrap before the full fresh-database E2E smoke gate
- explicit PIN-login abuse protection
- stronger OTP resend/atomic-consumption semantics
- registration proof/recovery precision
- trusted-device re-enrollment + credential retirement
- refresh/revoke/concurrent-rotation semantics
- minimal auth-focused Redis/PostgreSQL integration support
- accumulated auth evidence gate
- incremental migration proof on schema-changing phases
- durable idempotency identity before replay
- explicit durable request arbitration for overlapping duplicates
- committed-result recovery after state changes or lost response
- Redis lease completion/release ownership if coordination remains
- per-operation reversal eligibility
- concrete reconciliation corruption fixtures + consistent snapshot semantics
- timestamp/order warning for financial reconciliation
- stronger readiness/shutdown evidence
- tested-image-digest promotion
- private deployment rehearsal vs public-release gate
- RPO/history-loss limitations of restore
- pre-provision cost budget + post-deployment measured review
- `NOT_REQUIRED` status for intentionally skipped optional patterns
- tighter owner-written-production-code rule
- unfamiliar mastery scenarios at major gates

The roadmap is now considered **frozen as the canonical execution plan**.

Future changes should occur only when:

- repository evidence disproves a roadmap assumption
- a missing prerequisite is discovered
- a real external integration changes scope
- implementation reveals a concrete new safety/correctness dependency

Do not solicit competing full-roadmap redesigns during normal execution.
