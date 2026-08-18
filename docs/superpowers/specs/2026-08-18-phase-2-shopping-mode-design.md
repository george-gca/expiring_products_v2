# Phase 2: Shopping Mode + Recurring Items — Design

## Problem

Phase 1 (foundation + core loop) is merged: pantry CRUD, categories, auth, i18n, and item
`recurring` flag capture (a "Recurring purchase" switch in Add Item) already exist. Phase 2
is the first of the phases outlined in the original v2 rewrite design spec — it builds v1's
Shopping Mode feature, which helps the household know what to buy before a grocery trip,
grounded in v1's documented behavior (`USER_GUIDE.md`) rather than invented from scratch.

## Goals

- A per-category Shopping Mode toggle that shows recurring items whose current stock is low
  enough to be worth buying — not just items you're completely out of.
- A user-editable, household-shared low-stock threshold (not per-item; one number for
  everything, editable in the Settings tab).
- Let a recurring item be un/marked recurring after the fact, from the Edit Item modal, not
  only at add-time.
- Quick add-to-pantry from the shopping list (pre-filled name), and a per-session skip for
  items you don't need to buy this trip.

## Non-goals (deferred)

- Per-item low-stock thresholds (explicitly rejected — one shared threshold for now).
- Skip persistence beyond the current Shopping Mode session (explicitly rejected — skips
  clear when Shopping Mode toggles off, per the user's own call, resolving v1's own
  self-contradictory docs on this point).
- A manually-curated shopping list independent of the recurring/low-stock derivation (the
  list is fully derived, never manually maintained, per this phase's scope).
- The rest of Phase 4's settings (language, notifications) — only the low-stock threshold
  field is pulled forward into the new settings doc this phase creates.

## Architecture

The shopping list is **derived, not stored**. It's computed client-side from data already
being fetched — `item_history` (which item types are recurring) joined against the
category's already-fetched pantry items (summed by name, since opening an item splits it
into a second Firestore doc). No new persisted "shopping list" collection, no backend
computation. This also means "add it to pantry → it drops off the list" requires no explicit
bookkeeping: the list re-derives from the updated quantity on the next Firestore snapshot.

- **New `users/{uid}` Firestore doc** (root, not a subcollection): `{ lowStockThreshold: 3 }`.
  `useSettings(uid)` bootstraps it with the default on first read (same seed-if-missing
  pattern as `useCategories`' default-category creation) and subscribes via `onSnapshot` so
  an edit on one device shows up live on the other. This is the first slice of the eventual
  Phase 4 settings doc (language, notifications) — extended later, not replaced.
- **New `useShoppingList(uid, categoryKey, pantryItems)` hook** — takes the category's
  already-fetched `usePantryItems` data as a parameter rather than opening a second
  `onSnapshot` listener on the same underlying data. Queries `item_history` for
  `category == categoryKey && recurring == true`, sums `pantryItems` quantity by `name`,
  keeps entries where that sum is `≤ threshold`, drops session-skipped names, returns
  alphabetically.
- **Zustand** (extends the existing `useUiPreferencesStore`): per-category
  `shoppingModeOn: boolean` and per-category `skippedNames: Set<string>`, cleared whenever
  Shopping Mode toggles off for that category. Both in-memory, per-device — same pattern as
  the existing sort/filter prefs.
- **`item_history.recurring` becomes the authoritative "is this item type recurring" flag.**
  It's keyed by name+category (per item *type*), unlike each item doc's own `recurring`
  field (per purchase instance). The Edit Item modal's new "Recurring purchase" switch writes
  to `item_history` — and also mirrors onto the specific item doc being edited, for schema
  consistency, though nothing reads that copy for shopping-list purposes.

## Data layer

**`users/{uid}`** (NEW, root doc):

```javascript
{
  lowStockThreshold: 3   // positive integer, editable in Settings, default 3 on first read
}
```

**`item_history`** gets its first Firestore *read* in this codebase (write-only since Phase
1) — this phase adds its first Zod boundary schema for it (`parseItemHistoryDoc`), matching
the established "every Firestore read goes through a schema" rule from Phase 1's CLAUDE.md.

**Shopping-list query**:

```typescript
query(
  collection(db, "users", uid, "item_history"),
  where("category", "==", categoryKey),
  where("recurring", "==", true),
)
```

**Aggregation**: sum `quantity` across all `pantryItems` sharing the same `name` (handles the
opened/unopened split-doc case from Phase 1's `updateItemQuantities` transaction). An item
absent from the pantry entirely aggregates to 0, which is always `≤ threshold` — correctly
included as "need to buy."

## Components

- **Settings tab**: replaces the current `<div>Settings — Phase 4</div>` placeholder with a
  real (if minimal) pane: a number input bound to `useSettings`'s `lowStockThreshold`, with
  `try/catch` + `message.error` around the write.
- **Shopping Mode toggle**: a `Switch` near the top of each category pane (matching v1's
  placement), wired to Zustand's per-category `shoppingModeOn`. When on, swaps the normal
  `ItemList` for `ShoppingList` and hides the sort/filter controls (matching v1's documented
  behavior). The floating "+" add button stays visible in both modes, for buying something
  unplanned (e.g. a sale) outside the recurring/low-stock list.
- **`ShoppingList.tsx`** (NEW): renders `useShoppingList`'s entries via `Listy` (the
  component Phase 1 just migrated `ItemList` to — no new deprecated-component risk). Each
  row: item name, a cart-icon button (opens `AddItemModal` with the name pre-filled — see
  below), an eye-icon button (adds the name to that category's `skippedNames`).
- **`AddItemModal`** gains an optional `initialName?: string` prop, used to pre-fill the
  `name` field when opened from a shopping-list row's cart icon.
- **`EditItemModal`** gains a "Recurring purchase" `Switch`, alongside the existing
  opened/consumed/discarded fields, writing to `item_history` (and mirrored onto the edited
  item doc) on save.

## Error handling

Consistent with the pattern Phase 1 converged on after its final review: `onSnapshot` error
callbacks + `message.error(...)` on both new listeners (`useSettings`, the `item_history`
shopping-list query); `try/catch` + `message.error` around the threshold-edit write and the
recurring-toggle write.

## Testing

Emulator-backed tests, following the established per-hook TDD pattern:

- `useSettings`: bootstraps the default on first read; doesn't re-seed if the doc already
  exists; updates propagate via `onSnapshot`.
- `useShoppingList`: aggregates quantity correctly across split (opened/unopened) item docs;
  includes items at exactly the threshold; excludes items above it; excludes non-recurring
  items even at low stock; excludes session-skipped names.
- `parseItemHistoryDoc`: parses a valid doc; the `recurring`/`duration` field shapes already
  established in Phase 1's `addItem()` writes.
- Zustand store extension: `skippedNames` isolated per category; cleared on `shoppingModeOn`
  toggling off for that category (but not on toggling other categories).

One e2e case, extending the existing smoke-test pattern: mark an item recurring in Edit Item,
consume it down to/below the default threshold, turn on Shopping Mode, confirm it appears;
use the cart icon to re-add it, confirm it's added to the pantry and (once its quantity is
back above threshold) no longer appears in Shopping Mode.

## Open items for the implementation plan

- Exact UI copy/placement for the Settings tab's threshold input (a single `InputNumber` is
  assumed; refine during implementation).
- Whether the new `users/{uid}` doc needs a Firestore security-rule change beyond the
  existing `users/{uid}/{document=**}` isolation rule — it shouldn't, since it's a doc
  directly under the already-covered `users/{uid}` path, but confirm during implementation
  since this is the first *root-level* doc under `users/{uid}` (everything else so far has
  been in subcollections).
