# Customizable Categories (Tabs) — Design

## Purpose

Today's category tabs (Foods 🍎, Medicines 💊) are fixed defaults seeded by
`ensureDefaultCategories` — there is no UI to create, rename, delete, set
the icon of, or reorder a category. This work (tracked as
[#9](https://github.com/george-gca/expiring_products_v2/issues/9)) adds
that management UI on top of a data model that already supports it:
`users/{uid}/categories/{key}` is already a per-user Firestore subcollection,
not a hardcoded constant, and new users already get `foods`/`medicines`
seeded as their starting tabs. This is UI + a small schema addition, not a
backend migration.

A separate, future feature (not this one) is expected to add per-category
statistics (spoilage rate, percent spoiled, etc.). The delete/archive
design below is chosen specifically so that feature stays feasible later.

## Scope

**In scope:**
- A "Categories" section in Settings (a fourth Card, alongside
  Preferences/Notifications/Backup) listing every active category with
  rename, icon change, reorder (up/down), and delete actions, plus an "Add
  category" button.
- Create/rename via one shared modal: name (text) + icon (emoji picker).
- Delete = archive (soft-delete): the category disappears from the tab bar
  and the management list, but its `items`/`item_history` docs are left
  untouched in Firestore. Always gated behind a typed-name confirmation
  modal (GitHub-repo-delete style — type the category's exact name to
  enable the confirm button), regardless of whether the category has any
  items.
- Deleting/archiving the last remaining active category is blocked (button
  disabled with an explanatory tooltip) — there must always be at least one
  tab.
- `emoji-picker-react` (MIT, actively maintained) as the icon picker,
  configured with `EmojiStyle.NATIVE` (renders Unicode glyphs via the OS
  font — no images, no CDN calls, no bundled dataset; fits this PWA's
  offline requirement).

**Out of scope (explicit non-goals for this pass):**
- Any UI to browse or restore an archived category. Once archived, a
  category is only recoverable by hand-editing Firestore. A "manage
  archived categories" / restore screen is a natural follow-up, not part
  of this issue.
- The statistics feature itself — this design only avoids foreclosing it.
- Drag-and-drop reordering (up/down buttons only, per brainstorming
  decision — no new dependency, identical behavior on mobile and desktop).
- Any change to `PantryItem`/`item_history` schemas — items already
  reference a category by its `key` string, which does not change when a
  category is renamed (only `name`/`emoji` change) or archived.
- Firestore security rules — the deployed rule
  `match /users/{userId}/{document=**} { allow read, write: if
  request.auth != null && request.auth.uid == userId; }` already covers
  `users/{uid}/categories/**` (see
  [[reference-firebase-v1-project]]); no rule changes are needed.

## Data model

`src/features/categories/schema.ts` gains one optional field:

```ts
export const categoryDocSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  emoji: z.string().min(1),
  order: z.number().int().nonnegative(),
  archived: z.boolean().optional().catch(undefined),
});

export interface Category {
  id: string;
  key: string;
  name: string;
  emoji: string;
  order: number;
  archived: boolean;
}

export function parseCategoryDoc(id: string, data: unknown): Category {
  const parsed = categoryDocSchema.parse(data);
  return { id, ...parsed, archived: parsed.archived ?? false };
}

export function toCategoryDoc(category: Omit<Category, "id">) {
  return {
    key: category.key,
    name: category.name,
    emoji: category.emoji,
    order: category.order,
    archived: category.archived,
  };
}
```

`archived` is `.optional()` so every existing `foods`/`medicines` doc
(written before this field existed) parses cleanly and normalizes to
`archived: false` — zero data migration required.

**`key` generation:** a newly created category's `key` is the Firestore
auto-generated document ID (`doc(collection(...)).id`), not a slug derived
from the name. This sidesteps slug-collision handling entirely and keeps
`key` — the value `PantryItem.category` actually stores — permanently
stable across renames. It also matches the existing invariant: seeded
defaults already have `key === id` (`foods`/`medicines`).

## Firestore writes

New `src/features/categories/firestoreWrites.ts`:

- `createCategory(uid, name, emoji, order): Promise<void>` — generates a
  new doc ref via `doc(collection(...))`, writes
  `toCategoryDoc({ key: ref.id, name, emoji, order, archived: false })`.
  The caller (`CategorySection`) computes `order` as one past the current
  highest — new categories always append at the end of the tab order.
- `renameCategory(uid, categoryId, name, emoji): Promise<void>` —
  `updateDoc` on `name`/`emoji` only.
- `archiveCategory(uid, categoryId): Promise<void>` — `updateDoc({
  archived: true })`.
- `swapCategoryOrder(uid, a: {id, order}, b: {id, order}): Promise<void>`
  — a `writeBatch` swapping the two categories' `order` values atomically
  (used by the up/down reorder buttons on adjacent rows).

`useCategories.ts` changes in one place: after parsing, filter
`categories.filter((c) => !c.archived)` before returning — client-side,
not a Firestore `where("archived", "==", false)` query. A Firestore
equality query does not match documents where the field is simply absent,
so a query-level filter would silently hide every pre-existing category
(none of which have the field yet) the moment this ships. `ensureDefaultCategories` is unchanged.

## Components

**`SettingsPane.tsx`**: add a fourth `Card` (`t("settings.sectionCategories")`)
wrapping the new `CategorySection`, after Backup.

**New `src/features/categories/CategorySection.tsx`**: reads
`useCategories(uid)` (same hook the tab bar uses, so the list and the tabs
always match 1:1). Renders each active category as a row: emoji + name,
edit (pencil), move-up/move-down (disabled at the list's boundaries),
delete (trash, disabled with a tooltip when it's the last active
category). An "Add category" button opens the create modal. Owns the
delete-confirmation modal's state (`categoryPendingDelete`, typed
`confirmText`), mirroring `BackupSection.tsx`'s existing import-confirm
modal shape exactly: `Input` bound to `confirmText`, `okButtonProps={{
disabled: confirmText.trim() !== category.name, danger: true }}`.

**New `src/features/categories/CategoryFormModal.tsx`**: shared
create/rename modal. Props: `uid`, `open`, `onClose`,
`editingCategory?: Category` (undefined ⇒ create mode, seeded ⇒ rename
mode). Fields: Name (`Input`, required), Icon (a button showing the
current emoji that opens an `emoji-picker-react` `Picker` in a `Popover`,
`emojiStyle={EmojiStyle.NATIVE}`). On submit, calls `createCategory` or
`renameCategory` accordingly.

**`CategoryTabs.tsx`**: unchanged — it already just renders whatever
`categories` array it's given; the archived-filtering happens upstream in
`useCategories`.

## i18n

New keys under `settings` in both `pt-br.json`/`en-us.json`:
`sectionCategories`, `addCategory`, `editCategory`, `categoryName`,
`categoryIcon`, `deleteCategory`, `deleteCategoryConfirmTitle`,
`deleteCategoryConfirmBody` (interpolates `{{categoryName}}`),
`deleteCategoryConfirmInputLabel`, `deleteCategoryConfirmPlaceholder`,
`cannotDeleteLastCategory`, `moveCategoryUp`, `moveCategoryDown`.

## New dependency

`emoji-picker-react` (MIT license, actively maintained — confirmed via
research before adopting, per this project's third-party-tool
scrutiny preference). No companion data package needed (unlike
`emoji-mart`, which requires `@emoji-mart/data` to avoid runtime CDN
fetches) — `EmojiStyle.NATIVE` needs nothing beyond the base package.

## Testing plan

- `schema.test.ts`: `archived` defaults to `false` when absent/invalid;
  `toCategoryDoc` round-trips it.
- `firestoreWrites.test.ts` (new, emulator-backed): each of the four write
  functions, including that `swapCategoryOrder` is atomic (both docs'
  `order` updated together).
- `useCategories.test.ts`: archived categories are excluded from the
  returned list; a category doc with no `archived` field at all still
  appears (regression guard for the migration-free-ness claim above).
- `CategorySection.test.tsx` (new): renders active categories only; add
  flow calls `createCategory`; rename flow calls `renameCategory`; delete
  is blocked (button disabled) when only one active category remains;
  delete's confirm button stays disabled until the typed text exactly
  matches the category name, then calls `archiveCategory`.
- `CategoryFormModal.test.tsx` (new): create mode vs. rename mode
  pre-fill; emoji picker selection updates the icon field.

No e2e test changes anticipated — existing `e2e/`
flows don't touch category management.

## Error handling

Every write function follows this codebase's established pattern
(`message.error("Something went wrong, please try again")` on a caught
Firestore error, matching `NotificationSection`/`BackupSection`) — no new
error-handling pattern introduced.
