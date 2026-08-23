# Waste / Consumption Insights — Design

## Purpose

The app's whole point is to stop food (and medicine) from going to waste —
but today nothing reports back on whether that's actually happening.
`EditItemModal` already collects `opened`/`consumed`/`discarded` quantities
per action, and `updateItemQuantities` (`pantry-items/firestoreWrites.ts`)
already runs a transaction over them, but that data is only ever used to
shrink or delete the item doc. Nothing persists which outcome happened, so
there's no feedback loop telling the user whether their buying/usage habits
are actually reducing waste over time.

This adds that feedback loop: a new `📊` tab showing, per category, how
items have historically resolved (consumed in time vs. wasted) and what's
currently sitting unresolved past its expiration date right now.

## Scope

**In scope:**
- A new `users/{uid}/waste_events` Firestore subcollection, written
  transactionally inside the existing `updateItemQuantities` call whenever
  a `consumed` or `discarded` quantity is recorded.
- A new `📊 Insights` tab (`InsightsPane`), added to `CategoryTabs` next to
  the existing `⚙️` Settings tab — no router change, same pattern already
  used for Settings.
- Two data blocks in that tab: **Right now** (live, computed from the
  existing `items` collection — no schema change) and **All time** (from
  the new `waste_events` collection).
- Five historically-tracked outcomes, derived from two booleans captured
  at the moment of the action (`was_opened`, `was_expired` — facts about
  the source item *before* this transaction, not per-unit):
  - `consumed`, not expired → **consumed while good**
  - `discarded`, expired, not opened → **expired without opening**
  - `discarded`, expired, opened → **expired after opening**
  - `discarded`, not expired → **discarded, not expired** (overbought,
    changed your mind, etc. — a real case, distinct from expiry waste)
  - `consumed`, expired → **consumed after expiry** (edge case; worth
    surfacing since it's a safety-relevant signal for categories like
    Medicines)
- Two live-only states, no new data needed (read directly off the
  existing `items` collection): **sealed, still good** (`opened: false`,
  `expiring_date >= now`) and **opened, still good** (`opened: true`,
  `expiring_date >= now`), plus their overdue-and-unresolved counterparts
  (**currently expired, unopened** / **currently expired, opened**).

**Out of scope (explicit non-goals for this pass):**
- Any historical backfill. `waste_events` starts empty at deploy — actions
  taken before this ships were never recorded and can't be reconstructed.
- Automatic detection of the *moment* something crosses into expired while
  sitting unresolved — nothing in this app deletes or flags an item on its
  own, so "currently expired and unresolved" is a live snapshot at read
  time, not a logged historical event. There is no "N items silently
  expired last month" metric; only "N items are overdue right now."
- Charting/graphing libraries — simple stat rows only (YAGNI; matches this
  app's existing no-chart-library UI elsewhere).
- Server-side aggregation (Cloud Functions, counter documents) — data
  volume for a household pantry is small enough that summing
  `waste_events` client-side on every `onSnapshot` update is trivial, and
  this app has no Cloud Functions today (`scripts/notifications` is a
  scheduled script, not a Firestore trigger).
- Any change to `ItemList`/`ItemListItem` or how items render inside their
  existing category tab — this is purely additive.
- Date-range filtering (e.g. "this month") — all-time totals only for
  this pass.

## Data model

`src/features/pantry-items/schema.ts` gains a new doc type, following the
existing `itemHistoryDocSchema` precedent (read-side parsing lives in
`schema.ts`; the write-shape object lives inline in `firestoreWrites.ts`,
next to the one call site that produces it):

```ts
export const wasteEventDocSchema = z.object({
  category: z.string().min(1),
  was_opened: z.boolean(),
  was_expired: z.boolean(),
  consumed: z.number().int().nonnegative(),
  discarded: z.number().int().nonnegative(),
  occurred_at: timestampSchema,
});

export interface WasteEvent {
  id: string;
  category: string;
  wasOpened: boolean;
  wasExpired: boolean;
  consumed: number;
  discarded: number;
  occurredAt: Date;
}

export function parseWasteEventDoc(id: string, data: unknown): WasteEvent {
  const parsed = wasteEventDocSchema.parse(data);
  return {
    id,
    category: parsed.category,
    wasOpened: parsed.was_opened,
    wasExpired: parsed.was_expired,
    consumed: parsed.consumed,
    discarded: parsed.discarded,
    occurredAt: parsed.occurred_at.toDate(),
  };
}

// Same rationale as safeParseItemDoc/safeParseItemHistoryDoc: onSnapshot's
// success callback has no try/catch, so a hook that maps over a whole
// snapshot must use this variant to skip malformed docs instead of wedging
// `loading` at `true` forever.
export function safeParseWasteEventDoc(
  id: string,
  data: unknown,
): WasteEvent | null {
  const result = wasteEventDocSchema.safeParse(data);
  return result.success ? parseWasteEventDoc(id, data) : null;
}
```

## Firestore writes

`updateItemQuantities` (`pantry-items/firestoreWrites.ts`) changes in one
place: `now` and a `wasExpired` boolean are hoisted to the top of the
transaction (currently `now`/`alreadyExpired` are computed only inside the
`changes.opened > 0` branch — reused here so the check happens once,
consistently, regardless of which branches fire). After the existing
quantity update/delete and the existing `opened` branch, one addition:

```ts
if (changes.consumed > 0 || changes.discarded > 0) {
  transaction.set(doc(collection(db, "users", uid, "waste_events")), {
    category: item.category,
    was_opened: item.opened,
    was_expired: wasExpired,
    consumed: changes.consumed,
    discarded: changes.discarded,
    occurred_at: Timestamp.now(),
  });
}
```

No event is written for a pure `opened` action (opening isn't a terminal
outcome — the resulting item just becomes a new live "opened, still good"
row, already covered by the **Right now** block). `was_opened`/`was_expired`
apply to the whole transaction because `consumed` and `discarded` in a
single `EditItemModal` submission always come from the same source item.

## Reads / components

**New `src/features/pantry-items/useAllPantryItems.ts`**: same
`onSnapshot`/`safeParseItemDoc` pattern as `usePantryItems`, but without
the `where("category", "==", categoryKey)` filter — Insights needs items
across every category at once, and no existing hook returns that.

**New `src/features/insights/useWasteEvents.ts`**: `onSnapshot` on
`users/{uid}/waste_events`, using `safeParseWasteEventDoc`. Returns
`{ events: WasteEvent[]; loading: boolean }` — same shape convention as
every other data hook in this codebase.

**New `src/features/insights/currentStatus.ts`** (pure function, unit
tested like `sortItems.ts`): `computeCurrentStatus(items: PantryItem[]):
Record<string, { sealedGood, openedGood, overdueUnopened, overdueOpened
}>` grouped by `category`, given a reference `now`.

**New `src/features/insights/aggregateWasteEvents.ts`** (pure function,
unit tested): `aggregateWasteEvents(events: WasteEvent[]):
Record<string, { consumedInTime, expiredUnopened, expiredOpened,
discardedNotExpired, consumedAfterExpiry }>` grouped by `category`.

**New `src/features/insights/InsightsPane.tsx`**: props `{ uid: string;
categories: Category[] }` (categories passed down the same way
`SettingsPane` receives `settings` — `AppRoute` already loads them via
`useCategories`). Calls `useAllPantryItems(uid)` and `useWasteEvents(uid)`,
runs both pure aggregators, and renders one table row per category (plus
an "All categories" summary row) with two column groups: **Right now**
and **All time**. Zero-state (no events yet) renders the table with all
zeros rather than an empty state — there's nothing meaningfully different
to show a brand-new user.

**`CategoryTabs.tsx`**: gains one new prop, `insightsPane: ReactNode`,
inserted as a tab between the category panes and Settings — same
shape as the existing `settingsPane` prop, not a structural change.

**`AppRoute.tsx`**: passes `<InsightsPane uid={user.uid} categories=
{categories} />` as the new prop, alongside the existing `settingsPane`.

## i18n

New keys under a new `insights` namespace in both `pt-br.json`/
`en-us.json`: `tabLabel`, `sectionRightNow`, `sectionAllTime`,
`sealedGood`, `openedGood`, `overdueUnopened`, `overdueOpened`,
`consumedInTime`, `expiredUnopened`, `expiredOpened`,
`discardedNotExpired`, `consumedAfterExpiry`, `allCategories`.

## Testing plan

- `schema.test.ts`: `parseWasteEventDoc`/`safeParseWasteEventDoc` round-trip
  and malformed-doc handling, matching the existing item/item_history
  test shapes.
- `firestoreWrites.test.ts` (extend existing, emulator-backed): a
  `consumed`-only action writes a `waste_events` doc with
  `was_expired: false`; a `discarded` action on an overdue, previously
  opened item writes `was_opened: true, was_expired: true`; a pure
  `opened` action (no consumed/discarded) writes no event at all.
- `currentStatus.test.ts` / `aggregateWasteEvents.test.ts` (new, pure
  unit tests, no emulator needed): each of the five/four bucket
  combinations lands in the right key.
- `useAllPantryItems.test.ts` / `useWasteEvents.test.ts` (new,
  emulator-backed): returns items/events across categories, skips a
  malformed doc without wedging `loading`.
- `InsightsPane.test.tsx` (new): renders a row per category plus the "All
  categories" row; reflects a seeded `waste_events` doc in the right
  bucket; renders all-zero rows when no data exists yet.

No e2e test changes anticipated — existing `e2e/` flows don't touch
Insights.

## Error handling

Every new hook follows this codebase's established
`onSnapshot`/`message.error("Something went wrong, please try again")`
pattern — no new error-handling approach introduced.
