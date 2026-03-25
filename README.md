# Kori Mobile Financial Service (MFS) Backend

A production-grade, highly secure backend for a Mobile Financial Service, built to handle complex financial transactions with strict ACID compliance, zero-sum math guarantees, and memory-level idempotency checks.

> [!IMPORTANT]
> The primary architectural goal of this system is to prevent race conditions, database deadlocks, and duplicate charges in high-throughput financial environments.

## Technology Stack

- **Core Framework:** NestJS (TypeScript)
- **Database:** PostgreSQL
- **ORM:** Prisma
- **In-Memory Cache & Distributed Locks:** Redis
- **Security:** JWT (Access & Hashed Refresh Tokens), bcrypt, OTP-based State Machine

## Project Architecture

This architecture is built around modular, decoupled services focusing heavily on transactional integrity and strict security boundaries.

### Distributed Transaction Integrity
1. **Idempotency Layer:** Client-generated strict UUIDs are checked against Redis (`NX` flag) prior to processing. Network retries are immediately short-circuited if a transaction intent is already in flight.
2. **Double-Entry Ledger Paradigm:** The system enforces a strict zero-sum ledger logic. Every movement of funds (e.g., Send Money, Fee Collection, Cash Out) generates symmetric `DEBIT` and `CREDIT` entries in an atomic block. 
3. **Deadlock Prevention Strategy:** When handling cross-wallet transfers natively, PostgreSQL can face cyclic deadlocks under heavy concurrent load. This backend mathematically sorts Wallet IDs before executing raw `FOR NO KEY UPDATE` queries, enforcing a unified lock-acquisition sequence across all parallel requests.

### Core Modules
- `AuthModule`: Manages OTP verification clearance state and heavily restricted, hardware-bound device trust sessions.
- `WalletsModule`: Acts as the source-of-truth for financial balances and supports freezing/thawing capabilities via Admin scopes.
- `TransactionsModule`: The transactional heart, coordinating pessimistic locks and double-entry mathematical validations.

## Key Features

- **Strict ACID Transactions:** Guarantees that funds are never generated out of thin air or lost during database failures.
- **OTP Clearance Mechanism:** A state-machine approach where OTP verification issues a temporary clearance Token in Redis, acting as a gateway before PIN registration can occur.
- **Hardware-Binding & Trust Devices:** Authentication enforces a secondary check against a registered `deviceId`. Refresh tokens are uniquely hashed per device to localize session hijacking threats.
- **BigInt Financial Precision:** Interceptors handle native JS `BigInt` serialization, avoiding traditional IEEE 754 floating-point errors inherent in monetary calculations.
- **Strict DTO Data Sanitization:** Global Validation Pipes are armed with `whitelist: true` and `forbidNonWhitelisted: true`, silently dropping unauthorized payload structures.

## Getting Started

### Prerequisites
- Node.js (v18+)
- PostgreSQL (v14+)
- Redis (v6+)

### Installation

1. Clone the repository and navigate to the backend directory:
   ```bash
   cd kori/backend
   ```

2. Install dependencies:
   ```bash
   npm ci
   ```

3. Set up environment variables by copying the example:
   ```bash
   cp .env.example .env
   ```

4. Initialize the Postgres database via Prisma:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

### Running the Application

```bash
# Development
npm run start:dev

# Production build
npm run build
npm run start:prod
```

## Project Structure

```text
src/
├── common/              # Global interceptors (BigInt), filters, and utility functions
├── config/              # Environment validation schemas
├── infrastructure/      # Low-level abstractions (PrismaService, RedisService)
├── modules/             # Core business logic
│   ├── auth/            # OTP, JWT, TrustDevice validation
│   ├── transactions/    # Idempotency checks, Ledger updates, and locking
│   └── wallets/         # Balance exposure, System/Merchant account administration
└── main.ts              # Global pipes and security initialization
```

## Coding Standards

Continuous Integration relies heavily on structured TypeScript. All contributions must adhere to the following principles:
- **Service Isolation:** Controllers should only parse HTTP. Business logic and Prisma interactions exclusively live in `*.service.ts` files.
- **Typing Integrity:** Explicit return types (`Promise<T>`) are required on all methods and strictly maintained interface implementations in the `interfaces` directories.

## Testing

> [!NOTE]
> Tests are critical when modifying the transaction pipeline. Ensure the double-entry math assertions pass before creating a pull request.

Run the unit tests natively using the built-in testing commands:
```bash
npm run test
```
