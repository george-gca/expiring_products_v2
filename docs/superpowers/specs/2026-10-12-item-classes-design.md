# Item Classes — Design

## Problem

Pantry items are tracked individually by name (`"Dove soap"`, `"Lux soap"`),
which is correct for inventory but wrong for shopping: the household doesn't
care which soap brand it buys, just that it's low on soap in general. Today,
Shopping Mode (Phase 2) derives its list per exact item name, so three
distinct soap items never get combined — each would independently need to
drop to/below the shared low-stock threshold before showing up, even though
combined stock might already be plenty (or combined low stock never
triggers because no single brand crosses the threshold alone).

A **Class** is a user-defined grouping of item names within one category
(e.g. a "Soap" class under Cleaning, covering any brand of soap bought). It
powers two things: a collapsed "group by class" view of the pantry, and
class-level aggregation in Shopping Mode.

## Goals

- Let the user define classes per category and assign them to items via the
  Add/Edit Item modal.
- A per-category "group by class" toggle on the item list: items sharing a
  class collapse into one row (name + count + summed quantity, expandable).
- Shopping Mode aggregates by class when an item has one: combined quantity
  across all member items compared to the threshold, surfaced as the class
  name rather than any one brand.
- Settings UI to rename/archive classes (mirrors the existing Categories
  section).

## Non-goals (deferred)

- Cross-category classes — a class belongs to exactly one category, matching
  how items already reference a category.
- Auto-suggesting a class from the item name (fuzzy matching) — explicit
  user assignment only, via a picker.
- Making class required, or backfilling existing items with one — the field
  is optional/nullable; unclassed items behave exactly as they do today.
- A class-level recurring flag independent of item names — recurring stays
  tracked per name in `item_history`, as today; a class is "recurring" if
  any one of its member names is.
- Reorder/icon for classes — classes aren't tabs, no `order`/`emoji` fields.
- A dedicated "Classes" tab/route — grouping is a toggle on the existing
  per-category item list, not a new navigation surface.

## Architecture

**Flat sibling collection, not nested under category docs.** Items already
live in a flat `users/{uid}/items` collection referencing their category by
a `category` key string — not nested under `users/{uid}/categories/{key}`.
Classes follow the same convention: `users/{uid}/classes/{classKey}`, each
doc carrying a `category` field. A nested
`categories/{categoryKey}/classes/{classKey}` subcollection was considered
and rejected — it breaks the established flat-reference convention and
would complicate every class query with a category-scoped path for no
benefit, since a flat `where("category", "==", categoryKey)` query already
does the job `useCategories`/`useShoppingList` rely on elsewhere.

**Items gain an optional `class_key`.** Nullable and optional in the Zod
schema, so every existing item doc (written before this field existed)
still parses — zero migration, exactly the pattern `Category.archived`
already established.

**Archived classes fall back to ungrouped, not orphaned.** Unlike
archiving a category (which hides an entire tab — items under it become
invisible by accepted design, see the Customizable Categories spec's
non-goals), a class is just a grouping lens on an already-visible category
tab. Items can't disappear from their own category. So: archiving a class
removes it from the create-picker and the management list, but any item
still carrying that `class_key` renders as a standalone row in the
group-by-class view — same as an item that never had a class. No
migration, no retroactive `class_key` clearing.

**Shopping list aggregation is per-class when present, per-name otherwise.**
`useShoppingList` already aggregates quantity by name and checks
`item_history.recurring` per name (see the Phase 2 spec). This adds a class
layer in front of that: for items whose `class_key` points to a live
(non-archived) class, quantity sums across every item sharing that class
(regardless of name), and the class counts as recurring-eligible if *any*
one of its member names has `recurring === true` in `item_history`. Items
with no class, or whose class is archived, use the unchanged per-name path.
The two kinds of entries merge into one alphabetically-sorted list.

## Data layer

**`users/{uid}/classes/{classKey}`** (NEW, flat collection):

```javascript
{
  key: "abc123",       // Firestore auto-generated doc id, same as key
  category: "cleaning", // the category key this class belongs to
  name: "Soap",
  archived: false,
}
```

```ts
export const classDocSchema = z.object({
  key: z.string().min(1),
  category: z.string().min(1),
  name: z.string().min(1),
  archived: z.boolean().optional().catch(undefined),
});

export interface ItemClass {
  id: string;
  key: string;
  category: string;
  name: string;
  archived: boolean;
}

export function parseClassDoc(id: string, data: unknown): ItemClass {
  const parsed = classDocSchema.parse(data);
  return { id, ...parsed, archived: parsed.archived ?? false };
}

export function toClassDoc(cls: Omit<ItemClass, "id">) {
  return {
    key: cls.key,
    category: cls.category,
    name: cls.name,
    archived: cls.archived,
  };
}
```

**`items` doc** (`src/features/pantry-items/schema.ts`) gains:

```ts
class_key: z.string().nullable().optional(),
```

mapped to/from `PantryItem.classKey: string | null` the same way
`barcode`/`last_notified_at` already handle optional-nullable fields.

**Shopping-list query addition**: `useShoppingList` now also takes the
category's classes (from a new `useClasses(uid, categoryKey)` — same shape
as `useCategories`, querying
`collection(db, "users", uid, "classes")` filtered client-side by
`category === categoryKey && !archived`, matching `useCategories`'
client-side archived-filter rationale: a Firestore equality query on
`archived` wouldn't match docs missing the field).

**Aggregation algorithm** (replaces the current flat per-name reduce in
`useShoppingList`):
1. Build `classKey -> ItemClass` map from live (non-archived) classes.
2. Partition `pantryItems` into classed (live `class_key`) and unclassed
   (no `class_key`, or `class_key` pointing to an archived/missing class).
3. For classed items: group by `class_key`, sum `quantity`, collect the
   distinct `name`s in the group; recurring-eligible if `item_history` has
   `recurring === true` for any of those names. Entry label = the class's
   `name`.
4. For unclassed items: unchanged existing per-name grouping.
5. Merge both entry lists, apply the existing threshold/skip filtering,
   sort alphabetically by label.

## Components

- **`AddItemModal`/`EditItemModal`**: new "Class" field — a `Select`
  (optional, clearable) listing the current category's live classes, plus
  an inline "create new" option (antd's standard create-on-the-fly select
  pattern: typing a value not in the list offers "Create '<value>'",
  calling `createClass` and selecting the new doc). No icon/emoji, unlike
  the category create flow.
- **`ItemList.tsx`**: new per-category `Switch` ("Group by class") next to
  the existing sort/filter controls, wired to a new Zustand flag
  `groupByClass` (same per-category, in-memory slice as
  `shoppingModeOn`/`skippedNames`). When on, items are grouped client-side
  by live `class_key` into collapsible rows (class name, member count,
  summed quantity, expandable to the normal per-item rows); unclassed/
  archived-class items render individually, unchanged.
- **New `src/features/categories/ClassSection.tsx`** (or nested inside the
  existing `CategorySection.tsx` — exact placement decided during
  implementation): per selected category, lists its live classes with
  rename and archive actions. Archive uses the same typed-name-confirm
  modal pattern as category delete. No reorder/icon — just name.
- **New `src/features/categories/ClassFormModal.tsx`**: shared create/
  rename modal, text-only (name field), mirroring `CategoryFormModal`
  minus the emoji picker.

## Firestore writes

New functions in `src/features/categories/firestoreWrites.ts` (or a new
sibling `classFirestoreWrites.ts` — decided during implementation,
following whichever keeps the file from growing unwieldy):

- `createClass(uid, category, name): Promise<string>` — generates a new
  doc ref via `doc(collection(...))`, writes
  `toClassDoc({ key: ref.id, category, name, archived: false })`, returns
  the new key (so the Add/Edit Item modal's inline-create flow can select
  it immediately).
- `renameClass(uid, classId, name): Promise<void>` — `updateDoc` on `name`
  only.
- `archiveClass(uid, classId): Promise<void>` — `updateDoc({ archived:
  true })`.

`PantryItem` writes (`firestoreWrites.ts` in `pantry-items`) pass through
`classKey` the same way they already pass through `barcode`/`source`.

## i18n

New keys under `settings` (class management) and `items` (the Class field,
group-by-class switch) in both `pt-br.json`/`en-us.json`: `sectionClasses`,
`addClass`, `editClass`, `className`, `deleteClass`,
`deleteClassConfirmTitle`, `deleteClassConfirmBody`,
`deleteClassConfirmInputLabel`, `itemClassLabel`, `itemClassCreateOption`,
`groupByClass`.

## Testing plan

- `schema.test.ts`: `class_key` optional/nullable, round-trips through
  `toItemDoc`; `classDocSchema`/`parseClassDoc`/`toClassDoc` round-trip,
  `archived` defaults to `false` when absent.
- `firestoreWrites.test.ts` (classes, emulator-backed): `createClass`
  returns a usable key; `renameClass`/`archiveClass` update only their
  target field.
- `useClasses.test.ts`: filters archived classes client-side; a class doc
  missing the `archived` field entirely still appears (regression guard,
  same shape as the existing `useCategories` test).
- `useShoppingList.test.ts` (extended): classed items aggregate combined
  quantity across member names; class counts as recurring-eligible if *any*
  member name is recurring, even if others aren't; an item whose
  `class_key` points to an archived class falls back to per-name behavior;
  a mixed list (some classed, some not) merges correctly.
- `ClassSection.test.tsx`/`ClassFormModal.test.tsx` (new): same shape as
  the existing `CategorySection`/`CategoryFormModal` tests — create, rename,
  archive-confirm-gated-on-typed-name.
- `ItemList.test.tsx` (extended): group-by-class toggle collapses classed
  items into one row with correct summed quantity/count; archived-class and
  unclassed items still render individually when the toggle is on.

No e2e test changes anticipated beyond extending the existing smoke test if
implementation surfaces a gap — not assumed necessary up front.

## Error handling

Consistent with the established pattern: `onSnapshot` error callbacks +
`message.error(...)` on the new `useClasses` listener; `try/catch` +
`message.error` around `createClass`/`renameClass`/`archiveClass` writes
and the Add/Edit Item modal's inline class-create action.

## Open items for the implementation plan

- Exact file split for class Firestore writes (new file vs. extending
  `categories/firestoreWrites.ts`) — decide based on resulting file size.
- Exact placement of `ClassSection` in Settings (its own Card vs. nested
  inside the existing Categories Card, scoped to a category selector) —
  refine during implementation.
- Confirm the `users/{uid}/classes/**` path needs no Firestore security
  rule change beyond the existing `users/{uid}/{document=**}` isolation
  rule (same reasoning as every other root-level subcollection added so
  far).

## Addendum: class membership must be durable at the name level, not the purchase level

Found during the final whole-branch review of the implementation (after all 15
plan tasks shipped), not anticipated in the design above.

**The gap:** the original design above derives class membership entirely from
each `PantryItem`'s own `classKey` field. But fully consuming an item deletes
its Firestore doc (`updateItemQuantities`'s transaction), so once every
instance of one brand in a class is used up, no live document carries that
`classKey` anymore — Shopping Mode's aggregation (`useShoppingList`) falls
back to listing that brand under its own name instead of its class, exactly
the problem classes exist to solve.

**The fix:** `item_history` (keyed by name, already the durable "is this name
recurring" record per Phase 2) now also durably records `class_key` per name.
`addItem`'s existing merge-write gains an asymmetric guard identical to its
`recurring` field's (`item_history`'s field is only ever written when the new
value is truthy — a purchase with no class never clobbers an existing class
tag, same rationale as never writing `recurring: false` there).
`updateItemDetails` (the Edit modal's Details-tab correction path) gains the
same durable write when a class is explicitly set. `useShoppingList` now
classifies by `item_history`'s `classKey` first, falling back to a live
item's own `classKey` only for names not yet durably tagged (e.g. classed
before this fix shipped, or never purchased as recurring) — zero migration,
same as every other optional field in this codebase.

**Known accepted limitation:** `item_history`'s class durability currently
only reaches names returned by the `useShoppingList`'s own `recurring == true`
Firestore query. A class member brand that is itself non-recurring, runs out,
and is repurchased without the user manually re-picking its class will not
have its new stock counted toward the class until re-tagged — the same
narrower gap `recurring` itself already has on rename (a renamed item's new
name starts untracked until bought/edited again). This is accepted as a
follow-up rather than fixed immediately: closing it fully requires dropping
the query's `recurring == true` filter, defaulting `recurring` to `false` in
`itemHistoryDocSchema` (so non-recurring docs round-trip, including through
backup export), and reclassifying client-side — a real query-shape change,
not a quick patch.
