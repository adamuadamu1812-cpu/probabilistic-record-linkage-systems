# Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. **Identity Ownership**: `/users/{userId}` can only be created, read, or updated by `request.auth.uid == userId` with a verified email (`request.auth.token.email_verified == true` on writes).
2. **PII Isolation**: Email addresses are stored solely in `/users/{userId}/private/info` (`docId == 'info'`), never on the parent `/users/{userId}` document. Only the owning user can read or write their private record, and parent `/users/{userId}` must exist (Master Gate).
3. **Workspace Isolation**: Saved calibration snapshots under `/users/{userId}/workspaces/{workspaceId}` belong strictly to `{userId}`. Every operation checks `ownerId == request.auth.uid`, valid `lowerThreshold <= upperThreshold`, `0 <= priorMatch <= 1`, and parent `/users/{userId}` existence.
4. **Temporal & Schema Integrity**: `createdAt` and `updatedAt` must equal `request.time` on creation, `createdAt` and `uid`/`ownerId` are immutable on update, and shadow/ghost fields are blocked via `keys().hasAll(...) && keys().hasOnly(...)` plus `affectedKeys().hasOnly(...)`.

## 2. The "Dirty Dozen" Adversarial Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated read on `/users/u1`**: Missing `request.auth`.
2. **Cross-user read on `/users/u2/private/info` as `u1`**: Violates owner-only PII isolation.
3. **Unverified email write on `/users/u1` (`email_verified: false`)**: Blocked by `isVerifiedUser()`.
4. **UID spoofing on `/users/u1` create (`uid: "u2"`)**: `data.uid != request.auth.uid`.
5. **Shadow/ghost field on `/users/u1` create (`isAdmin: true`)**: Blocked by `keys().hasOnly(...)`.
6. **Direct email injection into `/users/u1` (`email: "a@b.com"`)**: Blocked by `keys().hasOnly(...)`.
7. **Oversized `displayName` (200 chars) on `/users/u1`**: Exceeds `<= 80` size guard.
8. **Client-forged `createdAt` timestamp (`new Date(0)`)**: Fails `data.createdAt == request.time`.
9. **Mutation of immutable `createdAt` or `uid` on `/users/u1` update**: Blocked by `affectedKeys().hasOnly(...)` and immutability check.
10. **Path ID poisoning on `/users/u1/workspaces/../../bad!id`**: Fails `isValidId(workspaceId)`.
11. **Inverted thresholds on `/users/u1/workspaces/ws1` (`lowerThreshold: 12, upperThreshold: 4`)**: Fails `lowerThreshold <= upperThreshold`.
12. **Cross-user list query on `/users/u2/workspaces` as `u1`**: Fails `resource.data.ownerId == request.auth.uid`.
