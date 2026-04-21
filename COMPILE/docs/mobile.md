# Mobile App

Expo (React Native) application for Field Engineers and Mitra crews. Source: [src/mobile/](../src/mobile).

## 1. Stack

- Expo SDK 50, React Native 0.73, TypeScript.
- `expo-secure-store` (Keychain / Keystore) for tokens.
- `expo-sqlite` for the local mirror + outbox.
- `expo-image-picker`, `expo-location` for evidence capture.
- Simple state-driven router (no `@react-navigation/native` in MVP).

## 2. Screens

| Screen | Purpose |
|---|---|
| Login | Email + password. Stores access + refresh in SecureStore. |
| Today | Sites assigned to me, with status pill. |
| SiteDetail | Site metadata, milestone list, "Update" button. |
| MilestoneUpdate | Status / actualDate / remark. Queued offline. |
| SyncStatus | Outbox count, last pull token, conflicts. |
| Profile | User info + logout (revokes refresh tokens). |

## 3. Offline model

Local SQLite tables mirror server entities (`sites`, `milestones`) plus an `outbox` ledger:

```
outbox(
  client_id  TEXT PRIMARY KEY,   -- UUIDv4 generated client-side
  entity     TEXT,                -- Milestone | FieldUpdate | Photo
  entity_id  TEXT,                -- server UUID (UPSERT) or null (CREATE)
  op         TEXT,                -- UPSERT | DELETE
  payload    TEXT,                -- JSON
  client_updated_at  TEXT,        -- ISO
  created_at TEXT,
  status     TEXT                 -- PENDING | ACCEPTED | REJECTED_STALE | REJECTED_INVALID
)
```

Configure the API base URL with `EXPO_PUBLIC_API_URL` (e.g., `http://192.168.1.10:3600` for LAN dev).

## 4. Sync flow

### Pull
1. App start, pull-to-refresh, or network-up event.
2. `POST /v1/sync/pull { since: lastToken, scope: "mine" }`.
3. Upsert returned `entities.sites` and `entities.milestones` into SQLite. Save `nextToken`.

### Push
1. User edits offline -> insert into `outbox` (status = `PENDING`).
2. On connectivity, drain in batches of <=50:
   ```
   POST /v1/sync/push { items: [...] }
   ```
3. For each result:
   - `ACCEPTED` -> mark outbox row `ACCEPTED`, drop from queue.
   - `REJECTED_STALE` -> store `serverState`, surface in SyncStatus for manual merge.
   - `REJECTED_INVALID` -> show user-friendly error.

### Conflict policy

Mirrored from the server (see [api.md](api.md#sync) and [architecture.md](architecture.md#5-mobile-sync-architecture)):

| Field | Policy |
|---|---|
| `Milestone.status`, `Milestone.actualDate` | server-wins on `updatedAt`; client receives `serverState` |
| `Milestone.remark` | append-only with `[ts][author]` prefix |
| `FieldUpdate` | append-only, deduped by `clientId` |
| `Photo` | append-only, deduped by `sha256` (Phase 2 path) |

State-machine guard is mirrored on the server (`NOT_STARTED -> IN_PROGRESS / BLOCKED`, `IN_PROGRESS -> DONE / BLOCKED`, `BLOCKED -> IN_PROGRESS`, `DONE` locked). FE may only update milestones for sites assigned to them; otherwise the push item is rejected as forbidden.

## 5. Photo capture (Phase 2)

`Photo` entity is wired in the schema and rejected at the sync runtime today. Phase 2 will add per-user presigned S3 PUT URLs (`POST /v1/uploads/presign`), server-side EXIF strip, and `Content-Type` allowlist.

## 6. Security on device

- Tokens in `expo-secure-store` (hardware-backed where available).
- No biometric gate in MVP (recommended for prod build).
- TLS pinning is not in MVP (`react-native-ssl-pinning` recommended for prod).
- Logout calls `POST /v1/auth/logout` to revoke all refresh tokens for the user.

## 7. Run dev

```bash
npm run dev:mobile
# scan QR with Expo Go, or run on emulator
```

Set `EXPO_PUBLIC_API_URL` in `.env` to your dev host (must be reachable from the device).
