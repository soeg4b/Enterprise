# User Guide: Field Engineer / Mitra

Audience: Field engineers and mitra crews using the mobile app. Role code: `FE`.

## What you can do

- See the sites assigned to you (only those).
- Update milestones for your sites, even **offline**.
- Add field updates (notes, GPS).
- Photos: Phase 2.

## 1. First-time setup

1. Install the PDC Enterprise mobile build (Expo Go for pilot, or the signed APK / IPA later).
2. Open the app, tap "Login", enter your email + password.
3. Allow location permission (needed for geotag on field updates).
4. The app pulls your assigned sites and caches them. You can now use it offline.

## 2. Daily flow

1. Open the app -> **Today** screen lists your sites with status pill (green / amber / red).
2. Tap a site -> milestone list (in sequence).
3. Tap a milestone -> change status, set actual date, write a remark, save.
4. The change goes into a local **outbox**. The badge on the SyncStatus tab shows the count.
5. When you are back online, the app drains the outbox automatically.

## 3. Allowed status changes

```
NOT_STARTED  ->  IN_PROGRESS | BLOCKED
IN_PROGRESS  ->  DONE | BLOCKED
BLOCKED      ->  IN_PROGRESS
DONE         ->  (locked)
```

Rules:
- Mark `DONE` only when work is actually finished. The app requires an `actualDate`.
- Backdating more than 30 days is **not allowed** in MVP. Ask your DH; Phase 2 will support an approval token.
- You can only update milestones on the sites assigned to you. Other sites won't appear and direct attempts are rejected.

## 4. Sync status screen

Shows:
- Outbox count (pending uploads).
- Last successful pull token (server time).
- Conflicts.

### Conflicts (REJECTED_STALE)

When the server already has a newer change for the same milestone, your push is rejected with the server's current state. The app shows it under "Sync Issues". Open it to:
1. Review what the server has now.
2. Decide if your change is still relevant.
3. If yes, retry; if no, discard.

### Append-only fields

Your remark is **always** added to the milestone (prefixed with `[ts] [your-email]`); it never overwrites the previous remark.

## 5. Offline tips

- The app works fully offline as long as you have already pulled at least once.
- Stay logged in; tokens are stored securely on the device. Logging out wipes the outbox cache.
- When in doubt about your last save, check the SyncStatus screen.

## 6. Common errors

| Message | Meaning | What to do |
|---|---|---|
| "Not assigned to this site" | The PM removed your assignment | Contact PM |
| "Transition not allowed" | You tried an invalid status change | Check the allowed transitions above |
| "actualDate required when status=DONE" | Set the date before saving | Pick today (or the real completion date) |
| "Backdate >30d requires DH approval" | The actualDate is too far in the past | Ask DH to update via web (Phase 2 token flow) |
| "Account locked" | 5 wrong passwords in 15 min | Wait 15 min or ask Admin |

## 7. Privacy & data on device

- Tokens are kept in the OS secure store (Keychain on iOS, Keystore on Android).
- Local data covers only the sites you are assigned to.
- Logging out revokes your refresh tokens server-side and clears local state.

## 8. Help

Tap **Profile -> Help** for contact info, or message your PM.
