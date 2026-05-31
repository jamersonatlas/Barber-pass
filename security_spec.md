# Security Specification for BarberPass

This document outlines the security architecture and rules validation for BarberPass.

## Data Invariants

1. **Owner Isolation**: A client, cut, or service document belongs to the authenticated user who created it (`ownerId == request.auth.uid`). No user can read or write another user's documents.
2. **Key Whitelisting**: Perfect schema boundaries. No document can contain untyped fields or excess shadow fields.
3. **Temporal Integrity**: Creation and modification times are validated using `request.time`.
4. **Valid Identifiers**: Non-empty document IDs with safe sizes.

## The Dirty Dozen Payloads (Security Attack Vectors)

Here are 12 specific payloads attempting to exploit security gaps:

### Pillar 1: Identity Spoofing & Owner Hijacking
1. **Attack 1**: Attacker tries to create a client document with `ownerId` set to a different user's UID.
2. **Attack 2**: Attacker attempts to update a valid client's `ownerId` to hijack ownership.

### Pillar 2: Client-side Form Spoofing & Excess Fields
3. **Attack 3**: Shadow client creation containing an unauthorized boolean (`isAdmin: true`).
4. **Attack 4**: Cut registration containing high-volume system injection garbage keys (`{ "maliciousKey": "maliciousValue" }`).

### Pillar 3: Invalid Range & Value Poisoning
5. **Attack 5**: Subscribing client with an extremely high monthly payment fee (`value: 9999999999`).
6. **Attack 6**: Registering a due day outside of the valid calendar range (`due: 42`).
7. **Attack 7**: Setting a client status to an invalid state (`status: "expired_forfeited"`).

### Pillar 4: Temporal Spoofing
8. **Attack 8**: Providing a hardcoded `createdAt` timestamp in the past to spoof history.
9. **Attack 9**: Modifying `createdAt` field on update to forge registration dates.

### Pillar 5: Path Variable ID Poisoning & Injection
1. **Attack 10**: Attempting to inject a 1MB junk token as client document ID to exhaust resources.

### Pillar 6: Orphaned Writes & Relational Bypass
1. **Attack 11**: Creating a cut document without a valid matching client ID or pointing to a different client.
2. **Attack 12**: Trying to delete cuts under another user's client resource.

---

## Firestore Rules Draft (`DRAFT_firestore.rules`)

We implement the validation and access rules covering all targets below.
