# Phase 3: Backup/Export & Import — Design

## Purpose

Phase 3 delivers the "Backup/export & import (JSON)" must-have listed in the
[v2 rewrite design spec](2026-08-17-expiring-products-v2-rewrite-design.md).
A household using this app has no way today to get its data out of Firestore
or restore it after, e.g., accidentally clearing app data or moving to a new
device before Phase 7's cutover is finished. This phase adds a manual,
user-triggered export of the signed-in user's full account data to a JSON
file, and an import that restores an account from a previously exported file.

## Scope

**In scope:**
- Export: download a single JSON file containing the current user's
  settings, categories, pantry items, and item_history (recurring-item
  flags/durations).
- Import: pick a previously exported JSON file, confirm, and replace the
  current account's settings/categories/items/item_history with the file's
  contents.

**Out of scope (deferred, not dropped):**
- Migrating v1's Firestore data — unrelated to this phase; the rewrite's own
  non-goals already exclude this (v2 launches with an empty pantry).
- Merge-on-import (keeping existing data and merging in the file's) — only
  full-replace import is supported. Revisit if real usage shows a need.
- Automatic/scheduled backups — export stays a manual, on-demand action.
- Backup format migrations across versions — the format is versioned
  (`version: 1`) so a future phase *can* add migration logic, but no
  migration path exists yet since there's only one version.
- Server-side (Cloud Functions) export/import — see Approach below.

## Approach

Client-side only, using the same Firestore SDK calls already used
throughout this codebase (`getDocs`/`getDoc`/`setDoc`/`addDoc`/`deleteDoc`),
no new backend infrastructure:

- **Export** reads all of the user's data via one-off Firestore reads,
  assembles a single JSON object, and triggers a browser file download
  (`Blob` + a temporary `<a download>`).
- **Import** parses and validates a user-selected JSON file client-side,
  asks for a typed confirmation (since it's destructive), then deletes the
  account's existing items/categories/item_history/settings and writes the
  file's contents in their place.

A Cloud Functions-based approach (server-side export/import, atomic via a
single transaction) was considered and rejected: this is a household pantry
app with a handful of items and no Functions infrastructure yet. Adding a
server component for a rarely-used backup feature is the kind of premature
infrastructure this project's YAGNI stance argues against (see CLAUDE.md and
the rewrite spec's non-goals). Plain client-side reads/writes, sequential
rather than batched (data volumes here are tens of docs, not thousands),
keeps this consistent with every other feature in the codebase — one
`firestoreWrites.ts`-style write module per feature, no transaction where
one isn't required.

**Accepted risk — no cross-collection atomicity.** Without a Firestore
transaction spanning the whole replace, an import isn't fully atomic: if it
fails partway (e.g. a network drop mid-write), the account can be left with
a mix of old and new data. Given the small scale and that this is a
self-serve household tool (not a multi-tenant SaaS), this risk is accepted
rather than adding transaction/rollback complexity. The failure path
surfaces a clear message telling the user to check their pantry and retry
the import if needed.

## Backup file format

A single JSON file, versioned so a future phase can evolve the shape
without breaking old backups:

```json
{
  "version": 1,
  "exportedAt": "2026-08-19T12:00:00.000Z",
  "settings": { "lowStockThreshold": 3 },
  "categories": [
    { "key": "foods", "name": "Foods", "emoji": "🍎", "order": 0 }
  ],
  "items": [
    {
      "name": "Whole Milk", "category": "foods", "quantity": 2,
      "expiringDate": "2026-09-01T00:00:00.000Z", "duration": 7,
      "dateOpened": null, "opened": false, "recurring": true,
      "barcode": null, "source": "manual"
    }
  ],
  "itemHistory": [
    { "name": "Whole Milk", "category": "foods", "duration": "7", "recurring": true }
  ]
}
```

- Dates serialize as ISO 8601 strings (JSON has no native date type).
- `items` and `itemHistory` entries don't carry their Firestore doc IDs:
  item doc IDs are auto-generated and never referenced externally;
  item_history's ID is deterministically derivable from `category_name` the
  same way `firestoreWrites.ts` already computes it. Both regenerate
  correctly on import without needing to round-trip the ID.
- `categories` entries keep their `key` field, which import uses directly
  as the Firestore doc ID (mirrors `useCategories`'s
  `ensureDefaultCategories` convention).

## Architecture

New feature folder `src/features/backup/`, following this codebase's
feature-based structure:

- **`schema.ts`** — `backupSchema` (Zod), composed from each existing
  feature's own schema rather than redefining field shapes
  (`itemDocSchema`, `categoryDocSchema`, `itemHistoryDocSchema`,
  `settingsDocSchema`), plus `version`/`exportedAt`. Exports
  `parseBackup(data: unknown): Backup`.
- **`exportBackup.ts`** — `buildBackup(uid): Promise<Backup>`. Runs
  `getDocs`/`getDoc` in parallel (`Promise.all`) against `users/{uid}`
  (settings), `users/{uid}/categories`, `users/{uid}/items` (**all**
  categories — unlike `usePantryItems`, which is scoped to one category),
  and `users/{uid}/item_history`. Parses each collection through its
  existing feature's parse function, then assembles the `Backup` object
  with `version: 1` and `exportedAt: new Date().toISOString()`.
- **`importBackup.ts`** — `importBackup(uid, backup: Backup): Promise<void>`.
  Two phases:
  1. **Delete**: `getDocs` the current `items`, `categories`, and
     `item_history` collections; delete every doc found.
  2. **Write**: `setDoc` the settings doc (full replace, not merged);
     `setDoc` each category at its own `key` as the doc ID; `addDoc` each
     item via the existing `toItemDoc`; `setDoc` each item_history entry at
     its deterministic `encodeURIComponent(`${category}_${name}`)` ID
     (mirrors `firestoreWrites.ts`'s existing `toItemHistoryDoc`/historyId
     convention).
  All writes are sequential/`Promise.all`, not batched — see Approach.
- **UI** — a new "Backup" section added to `src/features/settings/SettingsPane.tsx`:
  - **Export** button: calls `buildBackup`, `JSON.stringify`s the result,
    wraps in a `Blob`, triggers download via a temporary
    `<a download="expiring-products-backup-YYYY-MM-DD.json">`. No new
    Firestore security rule needed — export is read-only and the existing
    rules already let the owner read their own `users/{uid}/**`.
  - **Import** button: opens a hidden `<input type="file" accept=".json">`.
    On file selection: read as text, `JSON.parse`, then `parseBackup()`. On
    failure, show an error and stop — nothing is touched. On success, open
    a typed-confirmation `Modal` (type `"replace"` to confirm) showing a
    summary (item/category counts) of what's about to be overwritten. On
    confirmed submit, call `importBackup`.

## Error handling

- Malformed/non-JSON file → caught at `JSON.parse`, user-facing error, no
  writes attempted.
- Valid JSON but wrong shape (fails `parseBackup`) → generic "not a valid
  backup file" message (Zod's internal error detail isn't surfaced,
  consistent with this codebase's existing `message.error` conventions,
  but phrased specifically enough to be actionable).
- `version` field present but not `1` → reject with "unsupported backup
  version." No migration logic exists yet (YAGNI until a second version is
  actually needed) — this is a narrow forward-compat hook, not a working
  migration path.
- Delete or write phase throws mid-import → caught at the top level,
  `message.error` with the partial-failure note ("some data may not have
  imported — check your pantry and try again if needed"). Not retried
  automatically.
- Export failures (e.g. a Firestore read error) are handled the same way as
  every other `getDocs`/`getDoc` call in this codebase — a generic error
  message, no special-casing.

## Testing

- **`schema.test.ts`** (no emulator) — `parseBackup` accepts a well-formed
  object; rejects malformed input per-field; rejects an unknown `version`.
- **`exportBackup.test.ts`** (emulator) — seeds items/categories/item_history/
  settings, calls `buildBackup`, asserts the returned object matches.
- **`importBackup.test.ts`** (emulator) — seeds pre-existing data, calls
  `importBackup` with a fixture backup, asserts old data is gone and new
  data matches exactly (including item_history's `recurring` flags and
  settings).
- **e2e** (new or extended Playwright spec) — export, then import the
  just-downloaded file back in, confirm the pantry view is unchanged
  (round-trip test). This is the one meaningfully end-to-end scenario worth
  covering in Playwright, since file download/upload exercises real browser
  APIs the emulator-backed unit tests can't reach.

## Global constraints for implementation

- Reuse each existing feature's `toXDoc`/`parseXDoc` functions for field
  mapping — never redefine item/category/settings field shapes inside
  `src/features/backup/`.
- No batched/transactional writes; sequential or `Promise.all`, consistent
  with the accepted-risk decision above.
- Import must require the typed "replace" confirmation before any delete or
  write happens — no import path may skip this gate.
- `version: 1` is the only supported version; anything else is rejected,
  not coerced or migrated.
