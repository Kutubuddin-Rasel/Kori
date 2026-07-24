# Kori — Mobile Financial Service Backend

> A production-grade backend for a Mobile Financial Service (MFS) platform, engineered for correctness, security, and concurrency. Built with NestJS and PostgreSQL, Kori handles complex multi-party financial transactions with strict ACID compliance, zero-sum double-entry bookkeeping, and distributed idempotency guarantees.

> [!IMPORTANT]
> The primary architectural goal is to prevent race conditions, database deadlocks, and duplicate charges in high-throughput financial environments. Every design decision — from pessimistic row locking to hardware-bound refresh tokens — is made with this constraint in mind.

---

## Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [Architecture](#architecture)
- [Key Features](#key-features)
- [Data Model](#data-model)
- [API Reference](#api-reference)
- [Transaction Flows](#transaction-flows)
- [Fee Structure](#fee-structure)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Development](#development)
- [Testing](#testing)
- [Coding Standards](#coding-standards)

---

## Overview

Kori is the server-side engine for a Mobile Financial Service similar to bKash or Nagad. It enables a multi-role ecosystem — **Customers**, **Agents**, **Merchants**, and **Admins** — to interact with a shared financial ledger through a RESTful API.

The platform supports five core financial operations: peer-to-peer money transfers, agent-facilitated cash-in/cash-out, merchant payments, and bank-linked top-ups. Every operation is atomic, idempotent, and auditable.

---

## Technology Stack

| Layer | Technology | Version |
|---|---|---|
| **Framework** | [NestJS](https://nestjs.com/) | `^11.0` |
| **Language** | TypeScript | `^5.7` |
| **Database** | PostgreSQL | `16` |
| **ORM** | Prisma | `^7.4` |
| **Cache / Locks** | Redis (ioredis) | `7.4-alpine` |
| **Auth** | Passport.js + JWT | passport-jwt `^4.0` |
| **Hashing** | Argon2 | `^0.44` |
| **Validation** | class-validator + class-transformer | `^0.14 / ^0.5` |
| **Testing** | Jest + Supertest | `^30.0 / ^7.0` |
| **Containerization** | Docker + Docker Compose | — |

---

## Architecture

Kori follows a **modular, layered architecture** strictly enforced by NestJS. The responsibility boundaries are:

```
Controller      →  Validates and parses HTTP input only
Service         →  All business logic and database interactions
Infrastructure  →  Thin wrappers around external systems (Prisma, Redis)
Common          →  Cross-cutting concerns (guards, interceptors, filters, utilities)
```

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Client (Mobile App)                      │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS / REST
┌──────────────────────────▼──────────────────────────────────┐
│                   NestJS API  (/api/v1)                      │
│                                                              │
│  ┌──────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │ Auth Module  │  │ Wallets Module  │  │  Txn Module   │  │
│  │ /auth        │  │ /wallets        │  │ /transactions │  │
│  └──────┬───────┘  └────────┬────────┘  └──────┬────────┘  │
│         └──────────────────-┼──────────────────-┘           │
│                             │                               │
│         Global Cross-Cutting Concerns                       │
│         AccessTokenGuard · IdempotencyInterceptor           │
│         BigIntInterceptor · AllExceptionFilter              │
│                             │                               │
│  ┌─────────────────┐  ┌─────▼───────────────────────────┐  │
│  │  RedisService   │  │         PrismaService            │  │
│  │  (ioredis)      │  │   (PostgreSQL via pg adapter)    │  │
│  └────────┬────────┘  └──────────────────────────────────┘  │
└───────────┼──────────────────────────────────────────────────┘
            │
┌───────────▼──────────────────────────────────────┐
│                Infrastructure                     │
│  PostgreSQL :5832         Redis :9879             │
│  kori_postgres            kori_redis              │
└───────────────────────────────────────────────────┘
```

### Distributed Transaction Integrity

The system implements three interlocking safety mechanisms to guarantee correctness under concurrent load:

#### 1. Two-Phase Idempotency (Redis + Database)

Before a transaction reaches the database, the `IdempotencyInterceptor` resolves the `x-idempotency-key` header against a Redis state machine with three possible states:

| State | Redis Value | Action |
|---|---|---|
| **New Request** | Key does not exist | Lock key as `PROCESSING` (30 s TTL), execute transaction |
| **In-Flight Collision** | `"PROCESSING"` | Return `409 Conflict` immediately |
| **Already Processed** | Cached response payload | Return cached response, skip all business logic |

On success the full HTTP response payload is cached in Redis for **24 hours** (`IDEMPOTENCY_TTL_SECONDS`). On failure the `PROCESSING` lock is immediately deleted so the client can retry after fixing the issue.

#### 2. Pessimistic Locking with Deadlock Prevention

Every financial transfer executes inside a `prisma.$transaction()` block with `FOR NO KEY UPDATE` pessimistic row locks. To prevent circular wait-chain deadlocks under concurrent requests, wallet IDs are sorted alphabetically before locking:

```sql
-- Wallets are ALWAYS locked in a consistent alphabetical order of their UUIDs
SELECT id FROM wallets
WHERE id IN ($1, $2, $3)
FOR NO KEY UPDATE;
```

After acquiring locks, wallet balances are re-fetched to reflect any changes made by concurrent transactions between the pre-flight check and the actual write.

#### 3. Double-Entry Ledger

Every financial operation produces paired `DEBIT` and `CREDIT` `LedgerEntry` records atomically within the same database transaction. No funds are ever created or destroyed — only moved. This produces a fully auditable financial trail.

```
SEND_MONEY(500 BDT + 5 BDT fee):
  → Sender wallet:  DEBIT  505 BDT
  → Receiver wallet: CREDIT 500 BDT
  → System wallet:  CREDIT   5 BDT  (fee revenue)
```

---

## Key Features

- **OTP-Gated Registration State Machine** — Phone verification issues a short-lived Redis clearance key, acting as a cryptographic gate before a user can set a PIN and register.
- **Hardware-Bound Device Trust** — Every session is tied to a physical `deviceId`. Refresh tokens are Argon2-hashed and stored per-device in the `trusted_devices` table. An unrecognized device is immediately rejected with an `UNRECOGNIZED_DEVICE` error.
- **Secure Refresh Token via HttpOnly Cookie** — The refresh token never appears in the response body. It is set as an `HttpOnly`, path-scoped (`/auth`) cookie to prevent XSS exfiltration. In production, `Secure` and `SameSite=Strict` attributes are automatically applied.
- **Dual-JWT Authentication** — Short-lived access tokens carry the minimal `sub + role` claim. Long-lived refresh tokens carry `sub + phone + role + deviceId` for device-aware rotation.
- **BigInt Financial Precision** — All monetary amounts are stored and calculated as `BigInt` (backed by PostgreSQL `BIGINT`) in the smallest currency unit. The `BigIntInterceptor` serializes these to strings in all HTTP responses, eliminating IEEE 754 floating-point inaccuracies.
- **Strict Input Sanitization** — Global `ValidationPipe` with `whitelist: true` and `forbidNonWhitelisted: true` silently drops any payload keys not declared in a DTO.
- **Structured Error Responses** — The `AllExceptionFilter` catches all thrown exceptions globally and normalizes the response to a consistent `{ success, timestamp, path, message }` envelope.
- **Strategy Pattern Fee Engine** — The fee calculator follows the Open/Closed Principle: adding a new transaction type requires only a new entry in the `feeStrategies` dictionary with zero changes to existing logic.
- **KYC Status Tracking** — User accounts carry a `KycStatus` (`PENDING`, `APPROVED`, `REJECTED`) and `AccountStatus` (`ACTIVE`, `LOCKED`, `SUSPENDED`) field, enabling future compliance-gate integration.
- **Optimistic Concurrency Control (OCC) Field** — The `Wallet` model includes a `version` integer field providing a foundation for OCC-based conflict detection as a future alternative to pessimistic locking.

---

## Data Model

The schema defines four core entities connected through a financial ledger.

```
┌──────────────┐          ┌──────────────────────┐
│    User      │  1 ── 1  │       Wallet          │
│──────────────│          │──────────────────────│
│ id (UUID)    │          │ id (UUID)             │
│ phone        │          │ userId (FK)           │
│ pin (Argon2) │          │ type: PERSONAL        │
│ role         │          │       AGENT           │
│   CUSTOMER   │          │       MERCHANT        │
│   AGENT      │          │       SYSTEM          │
│   MERCHANT   │          │ balance: BigInt        │
│   ADMIN      │          │ currency (BDT)        │
│ kycStatus    │          │ isActive              │
│ status       │          │ version (OCC)         │
│ nidNumber    │          └──────────┬────────────┘
│ fullName     │                     │ sent / received
└──────────────┘          ┌──────────▼────────────┐
                          │     Transaction        │
                          │──────────────────────│
                          │ id (UUID)             │
                          │ trxId (TX-YYMMDD-XXXX)│
                          │ idempotencyKey (UUID) │
                          │ type                  │
                          │ status                │
                          │ amount: BigInt        │
                          │ fee: BigInt           │
                          │ senderWalletId (FK)   │
                          │ receiverWalletId (FK) │
                          └──────────┬────────────┘
                                     │ 1:N
                          ┌──────────▼────────────┐
                          │     LedgerEntry        │
                          │──────────────────────│
                          │ transactionId (FK)    │
                          │ walletId (FK)         │
                          │ type: DEBIT | CREDIT  │
                          │ amount: BigInt        │
                          │ balanceAfter: BigInt  │
                          │ description           │
                          └──────────────────────┘

┌────────────────────────┐
│      TrustDevice        │  (per-device session state)
│────────────────────────│
│ id (UUID)              │
│ deviceId (UNIQUE)      │
│ userId (FK → User)     │
│ refreshTokenHash       │
│ isAuthorized: Boolean  │
│ lastUsedAt             │
└────────────────────────┘
```

---

## API Reference

All endpoints are prefixed with `/api/v1`.

### Auth — `/api/v1/auth`

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `POST` | `/send-otp` | None | Send a 4-digit OTP to a phone number |
| `POST` | `/verify-otp` | None | Verify OTP; returns registration clearance or login redirect |
| `POST` | `/register` | OTP clearance key | Register new user with phone + PIN; creates personal wallet atomically |
| `POST` | `/login` | None | Authenticate with phone + PIN + deviceId; validates device trust |
| `POST` | `/refresh` | Refresh token cookie | Rotate access + refresh tokens for the authenticated device |

### Wallets — `/api/v1/wallets`

| Method | Endpoint | Auth | Role | Description |
|---|---|---|---|---|
| `GET` | `/my-balance` | Access token | Any | Get the caller's wallet balance and status |
| `GET` | `/:walletId` | Access token | `ADMIN` | Look up any wallet by ID |
| `POST` | `/system` | Access token | `ADMIN` | Create a system, agent, or merchant wallet |
| `PATCH` | `/:walletId/activate` | Access token | `ADMIN` | Unfreeze a wallet, allowing transactions |
| `PATCH` | `/:walletId/deactivate` | Access token | `ADMIN` | Freeze a wallet, blocking all transactions |

### Transactions — `/api/v1/transactions`

All transaction endpoints require a **Bearer access token** and a client-generated **`x-idempotency-key`** UUID header.

| Method | Endpoint | Sender Wallet | Receiver Wallet | Fee |
|---|---|---|---|---|
| `POST` | `/send` | `PERSONAL` | `PERSONAL` | Fixed ৳5 |
| `POST` | `/cash-in` | `AGENT` | `PERSONAL` | Free |
| `POST` | `/cash-out` | `PERSONAL` | `AGENT` | 1.85% of amount |
| `POST` | `/payment` | `PERSONAL` | `MERCHANT` | Free |
| `POST` | `/add-money` | `SYSTEM` | `PERSONAL` | Free |

> [!NOTE]
> The `x-idempotency-key` must be a client-generated UUID (v4) unique to each transaction intent. Reusing the same key within 24 hours returns the original cached response without re-processing.

---

## Transaction Flows

### Registration Flow

```
Client                    Server                     Redis / DB
  │                         │                            │
  ├── POST /send-otp ──────►│                            │
  │   { phone }             ├── Generate OTP ───────────►│
  │                         │   SET otp:{phone} 180s TTL │
  │◄── { message } ─────────┤                            │
  │                         │                            │
  ├── POST /verify-otp ────►│                            │
  │   { phone, otp,         ├── GET otp:{phone} ────────►│
  │     deviceId }          │◄── stored OTP ─────────────│
  │                         ├── DEL otp:{phone}           │
  │                         ├── SET clearance:{phone}     │
  │◄── { isRegistered }─────┤         300s TTL            │
  │                         │                            │
  ├── POST /register ──────►│                            │
  │   { phone, pin,         ├── GET clearance:{phone} ──►│
  │     deviceId }          │◄── "GRANTED" ──────────────│
  │                         ├── $transaction {            │
  │                         │     CREATE user             │
  │                         │     CREATE wallet           │
  │                         │     CREATE trustDevice      │
  │                         │   }                        │
  │                         ├── DEL clearance:{phone}     │
  │◄── { accessToken } ─────┤                            │
  │   [Cookie: refresh_token]│                           │
```

### Send Money Flow

```
Client              IdempotencyInterceptor      TransactionsService
  │                           │                        │
  ├─ POST /send ─────────────►│                        │
  │  x-idempotency-key: <uuid>│                        │
  │                           ├── GET Redis key ───────►│(Redis)
  │                           │   Miss → lock PROCESSING│
  │                           ├───────────────────────►│
  │                           │                Pre-flight:
  │                           │                - wallet type check
  │                           │                - balance check
  │                           │                        │
  │                           │                ACID Block:
  │                           │                1. Sort & lock UUIDs
  │                           │                2. Re-fetch balances
  │                           │                3. CREATE transaction
  │                           │                4. DEBIT sender
  │                           │                5. CREDIT receiver
  │                           │                6. CREDIT system (fee)
  │                           │                7. CREATE ledger entries
  │                           │                        │
  │                           │◄── TransactionResult ──┤
  │                           ├── Cache response 24h   │
  │◄─ { trxId, newBalance } ──┤                        │
```

---

## Fee Structure

| Transaction Type | Fee | Notes |
|---|---|---|
| `SEND_MONEY` | ৳5.00 (fixed) | Flat fee per transfer |
| `CASH_OUT` | 1.85% of amount | e.g. ৳1,000 → ৳18.50 fee |
| `CASH_IN` | Free | Agent-facilitated deposit |
| `PAYMENT` | Free | Merchant payment |
| `ADD_MONEY` | Free | Bank/card top-up |

All fees are collected atomically to a designated **System Wallet** whose ID is cached in memory at application startup (`onModuleInit`). The application will throw a critical error and refuse to start if no `SYSTEM`-type wallet exists in the database.

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Docker](https://www.docker.com/) and Docker Compose

### 1. Clone and Install

```bash
git clone <repository-url>
cd Kori
```

### 2. Configure Environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` with your secrets. All variables are validated on startup — the application will refuse to boot if any are missing or malformed.

```env
# Application
NODE_ENV=development
PORT=3000

# PostgreSQL
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5832/kori_db?schema=public"
DATABASE_USER=postgres
DATABASE_PASSWORD=<strong-password>
DATABASE_NAME=kori_db
DATABASE_PORT=5832

# Redis
REDIS_HOST=localhost
REDIS_PORT=9879
REDIS_PASSWORD=<strong-password>
REDIS_INSIGHT_PORT=5540

# JWT
ACCESS_TOKEN_SECRET=<min-32-char-random-secret>
REFRESH_TOKEN_SECRET=<min-32-char-random-secret>
ACCESS_TOKEN_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# OTP & Session TTLs (seconds)
OTP_TIME_LIMIT=180
CLEARANCE_TTL=300
IDEMPOTENCY_TTL_SECONDS=86400
PROCESSING_TTL_SECONDS=30
```

### 3. Start Infrastructure Services

```bash
docker compose up -d
```

| Service | Endpoint |
|---|---|
| PostgreSQL | `localhost:5832` |
| Redis | `localhost:9879` |
| RedisInsight (GUI) | `http://localhost:5540` |
| Mailpit (OTP capture) | `http://localhost:8025` |

### 4. Initialize the Database

```bash
cd backend
npm ci
npx prisma generate
npx prisma db push
```

### 5. Create the System Wallet

> [!IMPORTANT]
> The `TransactionsService` will throw on startup if no `SYSTEM`-type wallet exists. Create one via the Admin API immediately after first boot:
>
> ```
> POST /api/v1/wallets/system
> Authorization: Bearer <admin-access-token>
> Content-Type: application/json
>
> { "type": "SYSTEM", "currency": "BDT" }
> ```

### 6. Run the Application

```bash
# Development (hot-reload)
npm run start:dev

# Production
npm run build && npm run start:prod
```

The API is available at `http://localhost:3000/api/v1`.

---

## Project Structure

```
Kori/
├── docker-compose.yml             # PostgreSQL, Redis, RedisInsight, Mailpit
└── backend/
    ├── prisma/
    │   ├── schema.prisma          # Entity definitions & enums
    │   └── migrations/            # Migration history
    ├── src/
    │   ├── main.ts                # Bootstrap: global prefix, pipes, filters, interceptors
    │   ├── app.module.ts          # Root module composition
    │   ├── config/
    │   │   └── env.validation.ts  # class-validator env schema (fail-fast on startup)
    │   ├── infrastructure/
    │   │   ├── prisma/            # PrismaService
    │   │   └── redis/             # RedisService (ioredis + typed helpers)
    │   ├── common/
    │   │   ├── decorators/        # @CurrentUser() — extracts JWT payload
    │   │   ├── filters/           # AllExceptionFilter — normalized error envelope
    │   │   ├── interceptors/
    │   │   │   ├── idempotency.interceptor.ts   # Redis-backed duplicate prevention
    │   │   │   └── bigInt.interceptor.ts        # BigInt → string serialization
    │   │   └── utils/
    │   │       ├── fee-calculator.util.ts       # OCP fee strategy dictionary
    │   │       ├── trx-generator.util.ts        # TX-YYMMDD-XXXX ID generator
    │   │       └── dynamic-ledger-description.util.ts  # Per-type ledger labels
    │   └── modules/
    │       ├── auth/
    │       │   ├── auth.controller.ts           # send-otp, verify-otp, register, login, refresh
    │       │   ├── auth.service.ts              # Token generation, device trust
    │       │   ├── decorators/roles.decorator.ts
    │       │   ├── dto/                         # SendOtpDto, VerifyOtpDto, AuthCredentialsDto
    │       │   ├── guards/                      # AccessTokenGuard, RefreshTokenGuard, RolesGuard
    │       │   ├── interfaces/                  # JWT payload & response types
    │       │   ├── services/
    │       │   │   ├── otp.service.ts           # OTP flow & clearance gates
    │       │   │   ├── password.service.ts      # Argon2 hash / verify
    │       │   │   └── cookie.service.ts        # HttpOnly refresh cookie management
    │       │   └── strategies/
    │       │       ├── jwt-strategy.ts          # Access token validation
    │       │       └── jwt-refresh.strategy.ts  # Refresh token + device hash validation
    │       ├── wallets/
    │       │   ├── wallets.controller.ts        # my-balance, getById, system, activate/deactivate
    │       │   ├── wallets.service.ts           # Balance reads, wallet CRUD, state projections
    │       │   └── dto/                         # WalletIdParam, CreateSystemWalletDto
    │       └── transactions/
    │           ├── transactions.controller.ts   # send, cash-in, cash-out, payment, add-money
    │           ├── transactions.service.ts      # ACID engine, deadlock prevention, ledger writes
    │           └── dto/                         # SendMoneyDto, CashInDto, CashOutDto, PaymentDto, AddMoneyDto
    └── test/                                    # Jest e2e configuration
```

---

## Development

### Available Scripts

```bash
# Start with hot-reload
npm run start:dev

# Lint and auto-fix
npm run lint

# Format with Prettier
npm run format

# Open Prisma Studio (database GUI)
npx prisma studio

# Create a new database migration
npx prisma migrate dev --name <migration-name>
```

### Development Tools

| Tool | URL | Purpose |
|---|---|---|
| RedisInsight | `http://localhost:5540` | Inspect OTP codes, idempotency keys, clearance tokens |
| Mailpit | `http://localhost:8025` | View captured OTP emails in development |

---

## Testing

> [!NOTE]
> Tests are critical when modifying the transaction pipeline. The double-entry ledger math and the idempotency interceptor are the highest-risk components. Ensure all assertions pass before opening a pull request.

```bash
# Run all unit tests
npm run test

# Watch mode
npm run test:watch

# Coverage report
npm run test:cov

# End-to-end tests
npm run test:e2e
```

Unit test files (`*.spec.ts`) are co-located alongside their implementation files in `src/`. The Jest configuration uses `tsconfig-paths` to resolve TypeScript path aliases.

---

## Coding Standards

- **Controller responsibility:** Controllers parse and validate HTTP input only — they delegate entirely to services. No business logic or Prisma calls in controllers.
- **Service responsibility:** All Prisma interactions, business rule enforcement, and external service calls live exclusively in `*.service.ts` files.
- **Explicit return types:** All public service methods must declare their return type (`Promise<T>`). Implicit `any` is disallowed.
- **Interface contracts:** Response shapes are defined in `interfaces/` directories within each module and shared across controller and service boundaries.
- **Error propagation:** Services throw typed NestJS exceptions (`NotFoundException`, `BadRequestException`, etc.). The `AllExceptionFilter` formats the response — services must never build raw response objects.
- **BigInt in DTOs:** Financial amounts in request DTOs are received as `string` and converted to `BigInt` inside the service. Never use `number` for monetary values.
- **Env validation:** All environment variables must be declared and validated in `src/config/env.validation.ts`. The application refuses to start with missing or malformed configuration.
