# Waste / Consumption Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a feedback loop showing how pantry items actually resolve —
consumed in time vs. wasted — so the user can see whether the app is
actually reducing waste, not just tracking expiration dates.

**Architecture:** A new `users/{uid}/waste_events` Firestore subcollection
is written transactionally inside the existing `updateItemQuantities` call
(the one choke point every quantity change already passes through), tagged
with two facts about the source item at that moment (`was_opened`,
`was_expired`). A new `📊 Insights` tab reads that history plus a live view
of the existing `items` collection, aggregates both with two small pure
functions, and renders one `antd` `Table` row per category.

**Tech Stack:** React 19 + TypeScript, Firestore `onSnapshot` (no
TanStack Query — matches every other data hook in this codebase), Zod for
boundary parsing, `antd` `Table` (already a dependency — no new package),
Vitest + Testing Library against the real Firebase Local Emulator Suite.

**Spec:** `docs/superpowers/specs/2026-08-23-waste-insights-design.md`

## Global Constraints

- Always run the full `npm run lint` (`biome check . && eslint .`), never
  `tsc`/Biome alone — this repo's `eslint-plugin-react-hooks` catches
  conditional-hook bugs the other two tools miss.
- Any test touching Firestore/Auth must run through the emulator wrapper:
  `npx firebase emulators:exec --only auth,firestore "npx vitest run <path>"`.
  Pure unit tests with no Firestore/Auth dependency (the two aggregator
  functions) run directly: `npx vitest run <path>`.
- `afterEach` cleanup in every emulator-backed test file must call
  `clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID)` — never
  a hardcoded project-id string.
- No new dependencies. `antd`'s `Table` component covers the UI needs; no
  charting library.
- Firestore boundary parsing: every new doc shape gets a Zod schema plus
  `parseXDoc`/`safeParseXDoc` in `schema.ts`, following the existing
  `itemDocSchema`/`parseItemDoc`/`safeParseItemDoc` pattern exactly — no
  component or hook reads `doc.data()` untyped.
- New Firestore field names are snake_case (`was_opened`, `was_expired`,
  `occurred_at`); the parsed domain object is camelCase
  (`wasOpened`, `wasExpired`, `occurredAt`) — matches every existing schema
  in this codebase.

---

### Task 1: `waste_events` schema

**Files:**
- Modify: `src/features/pantry-items/schema.ts`
- Test: `src/features/pantry-items/schema.test.ts`

**Interfaces:**
- Produces: `wasteEventDocSchema` (Zod schema), `WasteEvent` interface
  (`{ id, category, wasOpened, wasExpired, consumed, discarded, occurredAt }`),
  `parseWasteEventDoc(id: string, data: unknown): WasteEvent`,
  `safeParseWasteEventDoc(id: string, data: unknown): WasteEvent | null`.
  Task 2 (the transactional write), Task 4 (`useWasteEvents`), and Task 6
  (`aggregateWasteEvents`) all consume these exact names.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/pantry-items/schema.test.ts` (after the existing
`parseItemHistoryDoc` describe block, keep the existing `Timestamp` import
— just add the new names to the existing `import { ... } from "./schema"`
list at the top of the file):

```ts
describe("parseWasteEventDoc", () => {
	it("parses a valid waste_event document, converting the Timestamp to a Date", () => {
		const occurredAt = Timestamp.fromDate(new Date("2026-08-23T12:00:00Z"));
		const result = parseWasteEventDoc("event1", {
			category: "foods",
			was_opened: true,
			was_expired: false,
			consumed: 2,
			discarded: 0,
			occurred_at: occurredAt,
		});
		expect(result).toEqual({
			id: "event1",
			category: "foods",
			wasOpened: true,
			wasExpired: false,
			consumed: 2,
			discarded: 0,
			occurredAt: occurredAt.toDate(),
		});
	});
});

describe("safeParseWasteEventDoc", () => {
	it("returns the parsed event for a valid document", () => {
		const result = safeParseWasteEventDoc("event1", {
			category: "medicines",
			was_opened: false,
			was_expired: true,
			consumed: 0,
			discarded: 1,
			occurred_at: Timestamp.fromDate(new Date("2026-08-23T12:00:00Z")),
		});
		expect(result).not.toBeNull();
		expect(result?.category).toBe("medicines");
	});

	it("returns null instead of throwing for a malformed document", () => {
		const result = safeParseWasteEventDoc("event1", {
			category: "foods",
			was_opened: "yes",
			was_expired: false,
			consumed: 1,
			discarded: 0,
			occurred_at: "2026-08-23",
		});
		expect(result).toBeNull();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/pantry-items/schema.test.ts`
Expected: FAIL — `parseWasteEventDoc`/`safeParseWasteEventDoc` are not
exported from `./schema` yet.

- [ ] **Step 3: Write the minimal implementation**

Append to `src/features/pantry-items/schema.ts` (after the existing
`safeParseItemHistoryDoc` function, at the end of the file):

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

// Same rationale as safeParseItemDoc/safeParseItemHistoryDoc above:
// onSnapshot's success callback has no try/catch, so a hook that maps over
// a whole snapshot must use this variant to skip malformed docs instead of
// wedging `loading` at `true` forever.
export function safeParseWasteEventDoc(
	id: string,
	data: unknown,
): WasteEvent | null {
	const result = wasteEventDocSchema.safeParse(data);
	return result.success ? parseWasteEventDoc(id, data) : null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/pantry-items/schema.test.ts`
Expected: PASS, all tests in the file green (including the pre-existing
ones — confirms nothing broke).

- [ ] **Step 5: Commit**

```bash
git add src/features/pantry-items/schema.ts src/features/pantry-items/schema.test.ts
git commit -m "feat: add a waste_events Firestore doc schema"
```

---

### Task 2: Write a `waste_events` doc from `updateItemQuantities`

**Files:**
- Modify: `src/features/pantry-items/firestoreWrites.ts`
- Test: `src/features/pantry-items/firestoreWrites.test.ts`

**Interfaces:**
- Consumes: `wasteEventDocSchema`'s field shape from Task 1 (written as a
  plain object here, not via a `toXDoc` helper — same precedent as
  `toItemHistoryDoc` living inline in this file rather than in `schema.ts`).
- Produces: no new exported function — `updateItemQuantities`'s existing
  signature (`uid: string, itemId: string, changes: QuantityChanges`) is
  unchanged; this task only adds a side effect.

- [ ] **Step 1: Write the failing tests**

Add to `src/features/pantry-items/firestoreWrites.test.ts`. First, extend
the existing top-of-file imports:

```ts
import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { addItem, setItemRecurring, updateItemQuantities } from "./firestoreWrites";
import { toItemDoc } from "./schema";
```

Then append a new describe block at the end of the file:

```ts
describe("updateItemQuantities waste_events", () => {
	async function seedItem(overrides: {
		quantity: number;
		expiringDate: Date;
		opened: boolean;
	}) {
		const itemRef = doc(collection(db, "users", uid, "items"));
		await setDoc(
			itemRef,
			toItemDoc({
				name: "Test Item",
				category: "foods",
				quantity: overrides.quantity,
				expiringDate: overrides.expiringDate,
				duration: null,
				dateOpened: null,
				opened: overrides.opened,
				recurring: false,
				barcode: null,
				source: "manual",
			}),
		);
		return itemRef.id;
	}

	it("writes a waste_events doc with was_expired: false for a consumed, non-expired item", async () => {
		const itemId = await seedItem({
			quantity: 2,
			expiringDate: new Date("2099-01-01"),
			opened: false,
		});

		await updateItemQuantities(uid, itemId, {
			opened: 0,
			consumed: 1,
			discarded: 0,
		});

		const eventsSnapshot = await getDocs(
			collection(db, "users", uid, "waste_events"),
		);
		expect(eventsSnapshot.size).toBe(1);
		const event = eventsSnapshot.docs[0].data();
		expect(event.category).toBe("foods");
		expect(event.was_opened).toBe(false);
		expect(event.was_expired).toBe(false);
		expect(event.consumed).toBe(1);
		expect(event.discarded).toBe(0);
	});

	it("writes was_opened: true and was_expired: true when discarding an overdue, previously opened item", async () => {
		const itemId = await seedItem({
			quantity: 1,
			expiringDate: new Date("2020-01-01"),
			opened: true,
		});

		await updateItemQuantities(uid, itemId, {
			opened: 0,
			consumed: 0,
			discarded: 1,
		});

		const eventsSnapshot = await getDocs(
			collection(db, "users", uid, "waste_events"),
		);
		expect(eventsSnapshot.size).toBe(1);
		const event = eventsSnapshot.docs[0].data();
		expect(event.was_opened).toBe(true);
		expect(event.was_expired).toBe(true);
		expect(event.discarded).toBe(1);
	});

	it("writes no waste_events doc for a pure opened action", async () => {
		const itemId = await seedItem({
			quantity: 3,
			expiringDate: new Date("2099-01-01"),
			opened: false,
		});

		await updateItemQuantities(uid, itemId, {
			opened: 1,
			consumed: 0,
			discarded: 0,
		});

		const eventsSnapshot = await getDocs(
			collection(db, "users", uid, "waste_events"),
		);
		expect(eventsSnapshot.size).toBe(0);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/pantry-items/firestoreWrites.test.ts"
```
Expected: the three new tests FAIL (`eventsSnapshot.size` is `0` where `1`
is expected, or `updateItemQuantities` is not yet imported/exported —
confirm the failure is about the missing `waste_events` write, not a typo).

- [ ] **Step 3: Write the minimal implementation**

In `src/features/pantry-items/firestoreWrites.ts`, first extend the
top-of-file `firebase/firestore` import to add `Timestamp`:

```ts
import {
	addDoc,
	collection,
	doc,
	runTransaction,
	setDoc,
	Timestamp,
	updateDoc,
} from "firebase/firestore";
```

Then replace the body of `updateItemQuantities` (the whole
`runTransaction` callback) with:

```ts
export async function updateItemQuantities(
	uid: string,
	itemId: string,
	changes: QuantityChanges,
): Promise<void> {
	const itemRef = doc(db, "users", uid, "items", itemId);

	await runTransaction(db, async (transaction) => {
		const snapshot = await transaction.get(itemRef);
		if (!snapshot.exists()) throw new Error(`Item ${itemId} not found`);
		const item = parseItemDoc(snapshot.id, snapshot.data());

		const totalHandled = changes.opened + changes.consumed + changes.discarded;
		if (totalHandled > item.quantity) {
			throw new Error(
				"Total opened + consumed + discarded exceeds current quantity",
			);
		}

		const now = new Date();
		const wasExpired = item.expiringDate.getTime() < now.getTime();

		const remaining = item.quantity - totalHandled;
		if (remaining > 0) {
			transaction.update(itemRef, { quantity: remaining });
		} else {
			transaction.delete(itemRef);
		}

		if (changes.opened > 0) {
			const newExpiringDate =
				item.duration !== null && !wasExpired
					? new Date(now.getTime() + item.duration * 24 * 60 * 60 * 1000)
					: item.expiringDate;

			const openedItemDocRef = doc(collection(db, "users", uid, "items"));
			transaction.set(
				openedItemDocRef,
				toItemDoc({
					name: item.name,
					category: item.category,
					quantity: changes.opened,
					expiringDate: newExpiringDate,
					duration: item.duration,
					dateOpened: now,
					opened: true,
					recurring: item.recurring,
					barcode: item.barcode,
					source: item.source,
				}),
			);
		}

		if (changes.consumed > 0 || changes.discarded > 0) {
			const wasteEventDocRef = doc(collection(db, "users", uid, "waste_events"));
			transaction.set(wasteEventDocRef, {
				category: item.category,
				was_opened: item.opened,
				was_expired: wasExpired,
				consumed: changes.consumed,
				discarded: changes.discarded,
				occurred_at: Timestamp.now(),
			});
		}
	});
}
```

(This only renames `alreadyExpired` to `wasExpired` and hoists it above
the `remaining`/delete logic — the `opened` branch's behavior is
unchanged, it just references the hoisted variable.)

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/pantry-items/firestoreWrites.test.ts"
```
Expected: PASS, all tests in the file green.

- [ ] **Step 5: Commit**

```bash
git add src/features/pantry-items/firestoreWrites.ts src/features/pantry-items/firestoreWrites.test.ts
git commit -m "feat: record a waste_events doc when items are consumed or discarded"
```

---

### Task 3: `useAllPantryItems` hook

**Files:**
- Create: `src/features/pantry-items/useAllPantryItems.ts`
- Test: `src/features/pantry-items/useAllPantryItems.test.ts`

**Interfaces:**
- Consumes: `safeParseItemDoc`, `type PantryItem`, `toItemDoc` from
  `./schema` (Task 1's dependencies — unchanged by this task).
- Produces: `useAllPantryItems(uid: string): { items: PantryItem[]; loading: boolean }`.
  Task 8 (`InsightsPane`) calls this directly.

- [ ] **Step 1: Write the failing test**

Create `src/features/pantry-items/useAllPantryItems.test.ts`:

```ts
import { renderHook, waitFor } from "@testing-library/react";
import { addDoc, collection } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { toItemDoc } from "./schema";
import { useAllPantryItems } from "./useAllPantryItems";

const uid = "test-user-all-pantry-items-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("useAllPantryItems", () => {
	it("returns items across every category, not just one", async () => {
		await addDoc(
			collection(db, "users", uid, "items"),
			toItemDoc({
				name: "Milk",
				category: "foods",
				quantity: 1,
				expiringDate: new Date("2099-01-01"),
				duration: null,
				dateOpened: null,
				opened: false,
				recurring: false,
				barcode: null,
				source: "manual",
			}),
		);
		await addDoc(
			collection(db, "users", uid, "items"),
			toItemDoc({
				name: "Aspirin",
				category: "medicines",
				quantity: 1,
				expiringDate: new Date("2099-01-01"),
				duration: null,
				dateOpened: null,
				opened: false,
				recurring: false,
				barcode: null,
				source: "manual",
			}),
		);

		const { result } = renderHook(() => useAllPantryItems(uid));
		await waitFor(() => expect(result.current.loading).toBe(false));

		const categories = result.current.items.map((item) => item.category).sort();
		expect(categories).toEqual(["foods", "medicines"]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/pantry-items/useAllPantryItems.test.ts"
```
Expected: FAIL — `./useAllPantryItems` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `src/features/pantry-items/useAllPantryItems.ts`:

```ts
import { message } from "antd";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { type PantryItem, safeParseItemDoc } from "./schema";

export function useAllPantryItems(uid: string): {
	items: PantryItem[];
	loading: boolean;
} {
	const [items, setItems] = useState<PantryItem[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const unsubscribe = onSnapshot(
			collection(db, "users", uid, "items"),
			(snapshot) => {
				// Same malformed-doc handling as usePantryItems — see
				// safeParseItemDoc's doc comment for why the safe variant is
				// required here.
				const parsedItems: PantryItem[] = [];
				for (const d of snapshot.docs) {
					const parsed = safeParseItemDoc(d.id, d.data());
					if (parsed) {
						parsedItems.push(parsed);
					} else {
						console.warn(
							`useAllPantryItems: skipping malformed item doc ${d.id}`,
						);
					}
				}
				setItems(parsedItems);
				setLoading(false);
			},
			() => {
				message.error("Something went wrong, please try again");
				setLoading(false);
			},
		);
		return unsubscribe;
	}, [uid]);

	return { items, loading };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/pantry-items/useAllPantryItems.test.ts"
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/pantry-items/useAllPantryItems.ts src/features/pantry-items/useAllPantryItems.test.ts
git commit -m "feat: add useAllPantryItems, an unfiltered items listener"
```

---

### Task 4: `useWasteEvents` hook

**Files:**
- Create: `src/features/insights/useWasteEvents.ts`
- Test: `src/features/insights/useWasteEvents.test.ts`

**Interfaces:**
- Consumes: `safeParseWasteEventDoc`, `type WasteEvent` from
  `../pantry-items/schema` (Task 1).
- Produces: `useWasteEvents(uid: string): { events: WasteEvent[]; loading: boolean }`.
  Task 8 (`InsightsPane`) calls this directly.

- [ ] **Step 1: Write the failing test**

Create `src/features/insights/useWasteEvents.test.ts`:

```ts
import { renderHook, waitFor } from "@testing-library/react";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { useWasteEvents } from "./useWasteEvents";

const uid = "test-user-waste-events-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("useWasteEvents", () => {
	it("returns parsed waste_events docs", async () => {
		await addDoc(collection(db, "users", uid, "waste_events"), {
			category: "foods",
			was_opened: false,
			was_expired: false,
			consumed: 1,
			discarded: 0,
			occurred_at: Timestamp.fromDate(new Date("2026-08-23T12:00:00Z")),
		});

		const { result } = renderHook(() => useWasteEvents(uid));
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.events).toHaveLength(1);
		expect(result.current.events[0].category).toBe("foods");
		expect(result.current.events[0].consumed).toBe(1);
	});

	it("skips a malformed waste_events doc instead of wedging loading at true", async () => {
		await addDoc(collection(db, "users", uid, "waste_events"), {
			category: "foods",
			was_opened: "not-a-boolean",
			was_expired: false,
			consumed: 1,
			discarded: 0,
			occurred_at: Timestamp.now(),
		});

		const { result } = renderHook(() => useWasteEvents(uid));
		await waitFor(() => expect(result.current.loading).toBe(false));

		expect(result.current.events).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/insights/useWasteEvents.test.ts"
```
Expected: FAIL — `src/features/insights/` doesn't exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `src/features/insights/useWasteEvents.ts`:

```ts
import { message } from "antd";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import {
	safeParseWasteEventDoc,
	type WasteEvent,
} from "../pantry-items/schema";

export function useWasteEvents(uid: string): {
	events: WasteEvent[];
	loading: boolean;
} {
	const [events, setEvents] = useState<WasteEvent[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const unsubscribe = onSnapshot(
			collection(db, "users", uid, "waste_events"),
			(snapshot) => {
				const parsedEvents: WasteEvent[] = [];
				for (const d of snapshot.docs) {
					const parsed = safeParseWasteEventDoc(d.id, d.data());
					if (parsed) {
						parsedEvents.push(parsed);
					} else {
						console.warn(
							`useWasteEvents: skipping malformed waste_events doc ${d.id}`,
						);
					}
				}
				setEvents(parsedEvents);
				setLoading(false);
			},
			() => {
				message.error("Something went wrong, please try again");
				setLoading(false);
			},
		);
		return unsubscribe;
	}, [uid]);

	return { events, loading };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/insights/useWasteEvents.test.ts"
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/insights/useWasteEvents.ts src/features/insights/useWasteEvents.test.ts
git commit -m "feat: add useWasteEvents, a waste_events listener"
```

---

### Task 5: `computeCurrentStatus` pure function

**Files:**
- Create: `src/features/insights/currentStatus.ts`
- Test: `src/features/insights/currentStatus.test.ts`

**Interfaces:**
- Consumes: `type PantryItem` from `../pantry-items/schema` (fields used:
  `category: string`, `quantity: number`, `expiringDate: Date`,
  `opened: boolean`).
- Produces: `interface CategoryCurrentStatus { sealedGood: number;
  openedGood: number; overdueUnopened: number; overdueOpened: number; }`
  and `computeCurrentStatus(items: PantryItem[], now: Date):
  Record<string, CategoryCurrentStatus>`. Task 8 (`InsightsPane`) calls
  this directly with the exact same field names.

- [ ] **Step 1: Write the failing test**

Create `src/features/insights/currentStatus.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { PantryItem } from "../pantry-items/schema";
import { computeCurrentStatus } from "./currentStatus";

const now = new Date("2026-08-23T00:00:00Z");

function item(overrides: Partial<PantryItem>): PantryItem {
	return {
		id: "id1",
		name: "Item",
		category: "foods",
		quantity: 1,
		expiringDate: new Date("2099-01-01"),
		duration: null,
		dateOpened: null,
		opened: false,
		recurring: false,
		barcode: null,
		source: "manual",
		...overrides,
	};
}

describe("computeCurrentStatus", () => {
	it("buckets a sealed, not-yet-expired item as sealedGood", () => {
		const result = computeCurrentStatus(
			[item({ category: "foods", quantity: 3, opened: false })],
			now,
		);
		expect(result.foods).toEqual({
			sealedGood: 3,
			openedGood: 0,
			overdueUnopened: 0,
			overdueOpened: 0,
		});
	});

	it("buckets an opened, not-yet-expired item as openedGood", () => {
		const result = computeCurrentStatus(
			[item({ category: "foods", quantity: 2, opened: true })],
			now,
		);
		expect(result.foods.openedGood).toBe(2);
	});

	it("buckets an overdue, unopened item as overdueUnopened", () => {
		const result = computeCurrentStatus(
			[
				item({
					category: "medicines",
					quantity: 1,
					opened: false,
					expiringDate: new Date("2020-01-01"),
				}),
			],
			now,
		);
		expect(result.medicines.overdueUnopened).toBe(1);
	});

	it("buckets an overdue, opened item as overdueOpened", () => {
		const result = computeCurrentStatus(
			[
				item({
					category: "medicines",
					quantity: 1,
					opened: true,
					expiringDate: new Date("2020-01-01"),
				}),
			],
			now,
		);
		expect(result.medicines.overdueOpened).toBe(1);
	});

	it("sums quantities across multiple items in the same category", () => {
		const result = computeCurrentStatus(
			[
				item({ category: "foods", quantity: 2, opened: false }),
				item({ category: "foods", quantity: 5, opened: false }),
			],
			now,
		);
		expect(result.foods.sealedGood).toBe(7);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/insights/currentStatus.test.ts`
Expected: FAIL — `./currentStatus` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `src/features/insights/currentStatus.ts`:

```ts
import type { PantryItem } from "../pantry-items/schema";

export interface CategoryCurrentStatus {
	sealedGood: number;
	openedGood: number;
	overdueUnopened: number;
	overdueOpened: number;
}

export function computeCurrentStatus(
	items: PantryItem[],
	now: Date,
): Record<string, CategoryCurrentStatus> {
	const result: Record<string, CategoryCurrentStatus> = {};
	for (const item of items) {
		const bucket = (result[item.category] ??= {
			sealedGood: 0,
			openedGood: 0,
			overdueUnopened: 0,
			overdueOpened: 0,
		});
		const overdue = item.expiringDate.getTime() < now.getTime();
		if (overdue) {
			if (item.opened) {
				bucket.overdueOpened += item.quantity;
			} else {
				bucket.overdueUnopened += item.quantity;
			}
		} else {
			if (item.opened) {
				bucket.openedGood += item.quantity;
			} else {
				bucket.sealedGood += item.quantity;
			}
		}
	}
	return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/insights/currentStatus.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/insights/currentStatus.ts src/features/insights/currentStatus.test.ts
git commit -m "feat: add computeCurrentStatus, live per-category item status"
```

---

### Task 6: `aggregateWasteEvents` pure function

**Files:**
- Create: `src/features/insights/aggregateWasteEvents.ts`
- Test: `src/features/insights/aggregateWasteEvents.test.ts`

**Interfaces:**
- Consumes: `type WasteEvent` from `../pantry-items/schema` (Task 1).
- Produces: `interface CategoryWasteHistory { consumedInTime: number;
  expiredUnopened: number; expiredOpened: number; discardedNotExpired:
  number; consumedAfterExpiry: number; }` and `aggregateWasteEvents(events:
  WasteEvent[]): Record<string, CategoryWasteHistory>`. Task 8
  (`InsightsPane`) calls this directly with the exact same field names.

- [ ] **Step 1: Write the failing test**

Create `src/features/insights/aggregateWasteEvents.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { WasteEvent } from "../pantry-items/schema";
import { aggregateWasteEvents } from "./aggregateWasteEvents";

function event(overrides: Partial<WasteEvent>): WasteEvent {
	return {
		id: "event1",
		category: "foods",
		wasOpened: false,
		wasExpired: false,
		consumed: 0,
		discarded: 0,
		occurredAt: new Date("2026-08-23T00:00:00Z"),
		...overrides,
	};
}

describe("aggregateWasteEvents", () => {
	it("buckets a non-expired consumed event as consumedInTime", () => {
		const result = aggregateWasteEvents([
			event({ category: "foods", consumed: 2, wasExpired: false }),
		]);
		expect(result.foods.consumedInTime).toBe(2);
	});

	it("buckets an expired, unopened discarded event as expiredUnopened", () => {
		const result = aggregateWasteEvents([
			event({
				category: "foods",
				discarded: 1,
				wasExpired: true,
				wasOpened: false,
			}),
		]);
		expect(result.foods.expiredUnopened).toBe(1);
	});

	it("buckets an expired, opened discarded event as expiredOpened", () => {
		const result = aggregateWasteEvents([
			event({
				category: "foods",
				discarded: 1,
				wasExpired: true,
				wasOpened: true,
			}),
		]);
		expect(result.foods.expiredOpened).toBe(1);
	});

	it("buckets a non-expired discarded event as discardedNotExpired", () => {
		const result = aggregateWasteEvents([
			event({ category: "foods", discarded: 3, wasExpired: false }),
		]);
		expect(result.foods.discardedNotExpired).toBe(3);
	});

	it("buckets an expired consumed event as consumedAfterExpiry", () => {
		const result = aggregateWasteEvents([
			event({ category: "medicines", consumed: 1, wasExpired: true }),
		]);
		expect(result.medicines.consumedAfterExpiry).toBe(1);
	});

	it("sums both consumed and discarded from the same event doc", () => {
		const result = aggregateWasteEvents([
			event({
				category: "foods",
				consumed: 1,
				discarded: 2,
				wasExpired: false,
				wasOpened: false,
			}),
		]);
		expect(result.foods.consumedInTime).toBe(1);
		expect(result.foods.discardedNotExpired).toBe(2);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/insights/aggregateWasteEvents.test.ts`
Expected: FAIL — `./aggregateWasteEvents` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `src/features/insights/aggregateWasteEvents.ts`:

```ts
import type { WasteEvent } from "../pantry-items/schema";

export interface CategoryWasteHistory {
	consumedInTime: number;
	expiredUnopened: number;
	expiredOpened: number;
	discardedNotExpired: number;
	consumedAfterExpiry: number;
}

export function aggregateWasteEvents(
	events: WasteEvent[],
): Record<string, CategoryWasteHistory> {
	const result: Record<string, CategoryWasteHistory> = {};
	for (const event of events) {
		const bucket = (result[event.category] ??= {
			consumedInTime: 0,
			expiredUnopened: 0,
			expiredOpened: 0,
			discardedNotExpired: 0,
			consumedAfterExpiry: 0,
		});
		if (event.consumed > 0) {
			if (event.wasExpired) {
				bucket.consumedAfterExpiry += event.consumed;
			} else {
				bucket.consumedInTime += event.consumed;
			}
		}
		if (event.discarded > 0) {
			if (event.wasExpired) {
				if (event.wasOpened) {
					bucket.expiredOpened += event.discarded;
				} else {
					bucket.expiredUnopened += event.discarded;
				}
			} else {
				bucket.discardedNotExpired += event.discarded;
			}
		}
	}
	return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/features/insights/aggregateWasteEvents.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/insights/aggregateWasteEvents.ts src/features/insights/aggregateWasteEvents.test.ts
git commit -m "feat: add aggregateWasteEvents, historical per-category totals"
```

---

### Task 7: i18n keys

**Files:**
- Modify: `src/locales/en-us.json`
- Modify: `src/locales/pt-br.json`

**Interfaces:**
- Produces: a new top-level `insights` namespace with keys
  `sectionRightNow`, `sectionAllTime`, `sealedGood`, `openedGood`,
  `overdueUnopened`, `overdueOpened`, `consumedInTime`, `expiredUnopened`,
  `expiredOpened`, `discardedNotExpired`, `consumedAfterExpiry`,
  `allCategories`. Task 8 (`InsightsPane`) calls `t("insights.<key>")` for
  every one of these.

This task has no test of its own — it's pure data consumed by Task 8's
component test, which is where these strings get exercised.

- [ ] **Step 1: Add the `insights` namespace to `src/locales/en-us.json`**

Insert a new top-level `"insights"` key after the closing `}` of
`"settings"` (i.e. as the file's last top-level key, before the file's
final closing `}`):

```json
  "insights": {
    "sectionRightNow": "Right now",
    "sectionAllTime": "All time",
    "sealedGood": "Sealed, good",
    "openedGood": "Opened, good",
    "overdueUnopened": "Overdue, unopened",
    "overdueOpened": "Overdue, opened",
    "consumedInTime": "Consumed in time",
    "expiredUnopened": "Expired, unopened",
    "expiredOpened": "Expired, opened",
    "discardedNotExpired": "Discarded, not expired",
    "consumedAfterExpiry": "Consumed after expiry",
    "allCategories": "All categories"
  }
```

- [ ] **Step 2: Add the matching `insights` namespace to `src/locales/pt-br.json`**

Same position (last top-level key):

```json
  "insights": {
    "sectionRightNow": "Agora",
    "sectionAllTime": "Histórico",
    "sealedGood": "Lacrados, bons",
    "openedGood": "Abertos, bons",
    "overdueUnopened": "Vencidos, não abertos",
    "overdueOpened": "Vencidos, abertos",
    "consumedInTime": "Consumidos a tempo",
    "expiredUnopened": "Vencidos sem abrir",
    "expiredOpened": "Vencidos após abrir",
    "discardedNotExpired": "Descartados sem estar vencidos",
    "consumedAfterExpiry": "Consumidos após vencer",
    "allCategories": "Todas as categorias"
  }
```

- [ ] **Step 3: Verify both files are still valid JSON**

Run: `node -e "require('./src/locales/en-us.json'); require('./src/locales/pt-br.json'); console.log('ok')"`
Expected: prints `ok` with no error.

- [ ] **Step 4: Commit**

```bash
git add src/locales/en-us.json src/locales/pt-br.json
git commit -m "feat: add insights i18n strings"
```

---

### Task 8: `InsightsPane` component

**Files:**
- Create: `src/features/insights/InsightsPane.tsx`
- Test: `src/features/insights/InsightsPane.test.tsx`

**Interfaces:**
- Consumes: `useAllPantryItems` (Task 3), `useWasteEvents` (Task 4),
  `computeCurrentStatus` (Task 5), `aggregateWasteEvents` (Task 6),
  `type Category` from `../categories/schema` (fields: `key: string`,
  `name: string`, `emoji: string`), the `insights.*` i18n keys (Task 7).
- Produces: `InsightsPane({ uid: string; categories: Category[] }): JSX.Element`.
  Task 9 wires this into `CategoryTabs`/`AppRoute`.

- [ ] **Step 1: Write the failing test**

Create `src/features/insights/InsightsPane.test.tsx`:

```tsx
import "../../lib/i18n";
import { render, screen, waitFor, within } from "@testing-library/react";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import type { Category } from "../categories/schema";
import { toItemDoc } from "../pantry-items/schema";
import { InsightsPane } from "./InsightsPane";

const uid = "test-user-insights-pane-1";

const categories: Category[] = [
	{ id: "foods-id", key: "foods", name: "Foods", emoji: "🍎", order: 0, archived: false },
	{ id: "medicines-id", key: "medicines", name: "Medicines", emoji: "💊", order: 1, archived: false },
];

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

// Category cells render as "<emoji> <name>" (e.g. "🍎 Foods") in one text
// node, and every numeric column also appears in the "All categories"
// total row — so assertions below match the combined label text and scope
// numeric lookups to one row via `within`, rather than a bare getByText
// that would either miss the combined string or hit more than one match.
describe("InsightsPane", () => {
	it("renders a row per category, plus an All categories row, all zero when there's no data", async () => {
		render(<InsightsPane uid={uid} categories={categories} />);

		await waitFor(() =>
			expect(screen.getByText("🍎 Foods")).toBeInTheDocument(),
		);
		expect(screen.getByText("💊 Medicines")).toBeInTheDocument();
		expect(screen.getByText("All categories")).toBeInTheDocument();
	});

	it("reflects a seeded sealed item in the Right now block", async () => {
		await addDoc(
			collection(db, "users", uid, "items"),
			toItemDoc({
				name: "Milk",
				category: "foods",
				quantity: 4,
				expiringDate: new Date("2099-01-01"),
				duration: null,
				dateOpened: null,
				opened: false,
				recurring: false,
				barcode: null,
				source: "manual",
			}),
		);

		render(<InsightsPane uid={uid} categories={categories} />);

		const foodsRow = await waitFor(() =>
			screen.getByText("🍎 Foods").closest("tr"),
		);
		expect(foodsRow).not.toBeNull();
		expect(within(foodsRow as HTMLElement).getByText("4")).toBeInTheDocument();
	});

	it("reflects a seeded waste_events doc in the All time block", async () => {
		await addDoc(collection(db, "users", uid, "waste_events"), {
			category: "medicines",
			was_opened: false,
			was_expired: true,
			consumed: 0,
			discarded: 2,
			occurred_at: Timestamp.fromDate(new Date("2026-08-23T12:00:00Z")),
		});

		render(<InsightsPane uid={uid} categories={categories} />);

		const medicinesRow = await waitFor(() =>
			screen.getByText("💊 Medicines").closest("tr"),
		);
		expect(medicinesRow).not.toBeNull();
		expect(
			within(medicinesRow as HTMLElement).getByText("2"),
		).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:
```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/insights/InsightsPane.test.tsx"
```
Expected: FAIL — `./InsightsPane` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `src/features/insights/InsightsPane.tsx`:

```tsx
import { Table, type TableColumnsType } from "antd";
import { useTranslation } from "react-i18next";
import type { Category } from "../categories/schema";
import { useAllPantryItems } from "../pantry-items/useAllPantryItems";
import { aggregateWasteEvents } from "./aggregateWasteEvents";
import { computeCurrentStatus } from "./currentStatus";
import { useWasteEvents } from "./useWasteEvents";

interface InsightsRow {
	key: string;
	categoryLabel: string;
	sealedGood: number;
	openedGood: number;
	overdueUnopened: number;
	overdueOpened: number;
	consumedInTime: number;
	expiredUnopened: number;
	expiredOpened: number;
	discardedNotExpired: number;
	consumedAfterExpiry: number;
}

const EMPTY_CURRENT = {
	sealedGood: 0,
	openedGood: 0,
	overdueUnopened: 0,
	overdueOpened: 0,
};

const EMPTY_HISTORY = {
	consumedInTime: 0,
	expiredUnopened: 0,
	expiredOpened: 0,
	discardedNotExpired: 0,
	consumedAfterExpiry: 0,
};

export function InsightsPane({
	uid,
	categories,
}: {
	uid: string;
	categories: Category[];
}) {
	const { t } = useTranslation();
	const { items, loading: itemsLoading } = useAllPantryItems(uid);
	const { events, loading: eventsLoading } = useWasteEvents(uid);

	if (itemsLoading || eventsLoading) return null;

	const currentByCategory = computeCurrentStatus(items, new Date());
	const historyByCategory = aggregateWasteEvents(events);

	const rows: InsightsRow[] = categories.map((category) => ({
		key: category.key,
		categoryLabel: `${category.emoji} ${category.name}`,
		...(currentByCategory[category.key] ?? EMPTY_CURRENT),
		...(historyByCategory[category.key] ?? EMPTY_HISTORY),
	}));

	const totalRow: InsightsRow = rows.reduce(
		(acc, row) => ({
			key: "all",
			categoryLabel: t("insights.allCategories"),
			sealedGood: acc.sealedGood + row.sealedGood,
			openedGood: acc.openedGood + row.openedGood,
			overdueUnopened: acc.overdueUnopened + row.overdueUnopened,
			overdueOpened: acc.overdueOpened + row.overdueOpened,
			consumedInTime: acc.consumedInTime + row.consumedInTime,
			expiredUnopened: acc.expiredUnopened + row.expiredUnopened,
			expiredOpened: acc.expiredOpened + row.expiredOpened,
			discardedNotExpired: acc.discardedNotExpired + row.discardedNotExpired,
			consumedAfterExpiry: acc.consumedAfterExpiry + row.consumedAfterExpiry,
		}),
		{
			key: "all",
			categoryLabel: t("insights.allCategories"),
			...EMPTY_CURRENT,
			...EMPTY_HISTORY,
		},
	);

	const columns: TableColumnsType<InsightsRow> = [
		{ title: "", dataIndex: "categoryLabel", key: "categoryLabel" },
		{
			title: t("insights.sectionRightNow"),
			children: [
				{ title: t("insights.sealedGood"), dataIndex: "sealedGood", key: "sealedGood" },
				{ title: t("insights.openedGood"), dataIndex: "openedGood", key: "openedGood" },
				{ title: t("insights.overdueUnopened"), dataIndex: "overdueUnopened", key: "overdueUnopened" },
				{ title: t("insights.overdueOpened"), dataIndex: "overdueOpened", key: "overdueOpened" },
			],
		},
		{
			title: t("insights.sectionAllTime"),
			children: [
				{ title: t("insights.consumedInTime"), dataIndex: "consumedInTime", key: "consumedInTime" },
				{ title: t("insights.expiredUnopened"), dataIndex: "expiredUnopened", key: "expiredUnopened" },
				{ title: t("insights.expiredOpened"), dataIndex: "expiredOpened", key: "expiredOpened" },
				{ title: t("insights.discardedNotExpired"), dataIndex: "discardedNotExpired", key: "discardedNotExpired" },
				{ title: t("insights.consumedAfterExpiry"), dataIndex: "consumedAfterExpiry", key: "consumedAfterExpiry" },
			],
		},
	];

	return (
		<Table
			columns={columns}
			dataSource={[...rows, totalRow]}
			pagination={false}
			rowKey="key"
			scroll={{ x: true }}
		/>
	);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:
```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/insights/InsightsPane.test.tsx"
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/insights/InsightsPane.tsx src/features/insights/InsightsPane.test.tsx
git commit -m "feat: add InsightsPane, the waste/consumption insights table"
```

---

### Task 9: Wire the Insights tab into the app, update README, full verification

**Files:**
- Modify: `src/features/categories/CategoryTabs.tsx`
- Modify: `src/routes/app-route.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `InsightsPane` (Task 8), `useAllPantryItems` (Task 3, transitively).
- Produces: no new exports — `CategoryTabs` gains one new required prop.

- [ ] **Step 1: Add an `insightsPane` prop to `CategoryTabs`**

Replace the full contents of `src/features/categories/CategoryTabs.tsx`:

```tsx
import { Tabs } from "antd";
import type { ReactNode } from "react";
import type { Category } from "./schema";

interface CategoryTabsProps {
	categories: Category[];
	renderPane: (category: Category) => ReactNode;
	insightsPane: ReactNode;
	settingsPane: ReactNode;
}

export function CategoryTabs({
	categories,
	renderPane,
	insightsPane,
	settingsPane,
}: CategoryTabsProps) {
	const items = [
		...categories.map((category) => ({
			key: category.key,
			label: `${category.emoji} ${category.name}`,
			children: renderPane(category),
		})),
		{ key: "insights", label: "📊", children: insightsPane },
		{ key: "settings", label: "⚙️", children: settingsPane },
	];
	return <Tabs className="category-tabs" items={items} />;
}
```

- [ ] **Step 2: Pass `InsightsPane` from `AppRoute`**

In `src/routes/app-route.tsx`, add the import (alongside the existing
`ItemList`/`SettingsPane` imports):

```ts
import { InsightsPane } from "../features/insights/InsightsPane";
```

Then add the new prop to the existing `<CategoryTabs ... />` call, right
after `renderPane` and before `settingsPane`:

```tsx
			insightsPane={<InsightsPane uid={user.uid} categories={categories} />}
```

- [ ] **Step 3: Run the full lint, typecheck, and test suite**

Run:
```bash
npm run lint
```
Expected: no errors (`biome check .` and `eslint .` both clean).

Run:
```bash
npm run typecheck
```
Expected: no errors.

Run:
```bash
npm test
```
Expected: every test file passes, including all the new ones from Tasks
1-8.

- [ ] **Step 4: Update the README**

In `README.md`, add a new bullet to the Features list (after the
"Barcode scanning" bullet, matching this list's existing tone and level
of detail):

```markdown
- **Waste insights** — a dedicated tab showing, per category, what's
  currently sealed/opened and still good vs. sitting overdue right now,
  plus an all-time breakdown of what got consumed in time versus what
  went to waste (and whether it was opened or not when that happened).
```

Add a new row to the Tech stack table (after the barcode-lookup row):

```markdown
| **Firestore `waste_events` + client-side aggregation** | per-category consumed/discarded history, summed in the browser — no Cloud Functions, matches this app's data-volume scale |
```

- [ ] **Step 5: Commit**

```bash
git add src/features/categories/CategoryTabs.tsx src/routes/app-route.tsx README.md
git commit -m "feat: wire the Insights tab into the app"
```

---

## Self-Review Notes

- **Spec coverage:** every spec section has a task — schema (Task 1),
  Firestore write (Task 2), `useAllPantryItems` (Task 3), `useWasteEvents`
  (Task 4), `computeCurrentStatus` (Task 5), `aggregateWasteEvents`
  (Task 6), i18n (Task 7), `InsightsPane` + wiring (Tasks 8-9). The
  spec's explicit non-goals (backfill, charting, Cloud Functions,
  date-range filtering) have correspondingly no task — confirmed
  intentional, not a gap.
- **Type consistency:** `CategoryCurrentStatus`/`CategoryWasteHistory`
  field names (Tasks 5-6) match `InsightsRow`'s spread usage in Task 8
  exactly; `WasteEvent`'s camelCase fields (Task 1) match what Tasks 4 and
  6 consume; the snake_case write shape in Task 2 matches
  `wasteEventDocSchema` from Task 1 field-for-field.
