# Kori Authentication State Contract — v1

## Purpose

This document defines the authentication states and the server-side evidence required to move between them.

It defines security properties and expected transitions. It does not require a State Machine implementation or prescribe storage mechanisms that belong to later roadmap phases.

## Core Principle

A client request does not create authentication authority by itself.

Every security-sensitive transition must be backed by evidence the server can verify.

## Authentication Flow

```text
UNVERIFIED
→ OTP_CHALLENGE_ISSUED
→ OTP_VERIFIED

OTP_VERIFIED + new account
→ REGISTRATION_AUTHORIZED
→ ACCOUNT_CREATED
→ DEVICE/SESSION_ESTABLISHED

OTP_VERIFIED + existing account
→ DEVICE_REENROLLMENT_PATH

REGISTERED_ACCOUNT
→ LOGIN
→ AUTHENTICATED_SESSION
→ REFRESHED_SESSION

AUTHENTICATED_SESSION
→ REVOKED_SESSION
```

## Transition Evidence

### Request OTP

Required input:

- syntactically valid Bangladeshi phone number
- syntactically valid device identifier

Successful request means only that an OTP challenge has been issued.

It does not authenticate the caller.

### Verify OTP

Required evidence:

- a server-issued OTP challenge exists
- the challenge is still valid
- the submitted OTP matches
- the challenge can be consumed according to the OTP policy

Successful OTP verification proves control of the OTP challenge.

Atomic consumption and resend behavior are defined in later OTP phases.

### Authorize Registration

For a phone number that does not yet belong to an account, successful OTP verification may produce a short-lived registration authorization.

Knowing only the phone number and device identifier must not be enough to register.

The representation and binding of the registration authorization are defined in the registration-proof phase.

### Register Account

Required evidence:

- valid registration authorization
- normalized phone number is eligible for registration
- PIN satisfies the Kori PIN invariant

Account, required wallet, trusted device, and initial session must only be established through the defined registration transaction/session policy.

### Existing-Account Device Verification

OTP verification for an existing account may enter the device re-enrollment flow.

OTP success must not:

- mutate another user's trusted device
- silently revive stale session credentials
- bypass device ownership rules

Exact re-enrollment semantics are defined in the trusted-device phase.

### Login

A session may be established only when:

- the account exists
- the supplied PIN is correct
- current account state permits login
- the device belongs to the account
- the device is currently authorized

The existence of a device identifier alone is not authorization.

### Refresh

Refresh requires:

- a cryptographically valid refresh credential
- a trusted device belonging to the token subject
- a device/session state permitted by the chosen session policy
- an account state permitted by the chosen freshness policy

Rotation, single-use behavior, concurrent refresh behavior, and revocation timing are defined in later session phases.

### Revoke / Logout

Revocation changes server-side session/device authority according to the session policy.

Whether already-issued access tokens are immediately invalidated or remain valid until expiry is intentionally deferred to the session-semantics phase.

## External Authentication Error Policy

The public API should avoid unnecessary account enumeration.

For login, failures such as:

- account not found
- PIN mismatch
- account unavailable

should converge on a generic external authentication failure.

Detailed internal reason codes may still be recorded safely for operational/security monitoring.

A device-verification-required response may be distinct after primary credentials and account state have already been validated because it represents the next authentication step.

## Sensitive Logging Policy

Kori must never log authentication secrets in production.

This includes:

- PINs
- OTP values
- access tokens
- refresh tokens
- registration authorization secrets

Phone numbers and device identifiers should be minimized or masked when full values are unnecessary.

Development-only OTP diagnostics may exist while Kori has no development SMS provider, but they must be explicitly gated to the development environment and must never rely only on a log message saying "development only."

## Deferred Decisions

The following are intentionally not decided by this document:

- OTP attempt/resend storage design
- atomic OTP-consume implementation
- registration-proof representation
- trusted-device re-enrollment implementation
- refresh-token single-use/rotation policy
- immediate vs refresh-only session revocation
- access-token role/status freshness implementation