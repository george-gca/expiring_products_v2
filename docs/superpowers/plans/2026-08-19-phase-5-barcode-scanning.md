# Phase 5: Barcode Scanning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a camera-based barcode scan button to Add Item that auto-fills the product name (and opened-duration when known), backed by a Firestore product cache and a free Open Food Facts fallback lookup.

**Architecture:** A new `src/features/barcode/` feature owns `barcode_products/{barcode}` (nested under `users/{uid}`, no new security rule needed), a cache-first `lookupBarcode` function (Firestore → Open Food Facts → `null`), and a `BarcodeScanner` component wrapping `getUserMedia` + the `barcode-detector` package's `BarcodeDetector` polyfill/ponyfill. `AddItemModal` swaps its form body for the scanner on demand; a successful detect looks up the barcode and pre-fills the form; saving with a barcode present writes both the item's own `barcode`/`source` fields (already existing on `PantryItem` since Phase 1, currently always hardcoded to `null`/`"manual"`) and re-teaches the `barcode_products` cache.

**Tech Stack:** Same as Phases 1–4 — Vite, React 19, TypeScript, Ant Design v6, Firebase (Auth + Firestore, Local Emulator Suite for tests), Zod v4, Vitest + Testing Library, Playwright, Biome. New: `barcode-detector` (runtime dependency), `msw` (already a dev dependency, unused until now — first real usage in this codebase).

**Spec:** [docs/superpowers/specs/2026-08-19-phase-5-barcode-scanning-design.md](../specs/2026-08-19-phase-5-barcode-scanning-design.md)

## Global Constraints

- `barcode_products` lives at `users/{uid}/barcode_products/{barcode}` — never a top-level collection. No new Firestore security rule.
- `category` is written to the cache but is **never** read back out of it for pre-filling a form — the modal's own `category` prop is always the source of truth for that field. `lookupBarcode` takes `category` as a parameter (to write into the cache on an Open Food Facts hit) but never returns it.
- Every error path (Firestore, network, malformed response, camera permission) degrades to plain manual entry. Nothing in this feature may block adding an item — every failure mode returns `null`/shows an inline message rather than throwing past its own boundary.
- `BarcodeScanner` must stop every media track on unmount (covers both the cancel path and the successful-detect path, since `AddItemModal` unmounts `BarcodeScanner` — by swapping back to the form view — immediately after a detect fires).
- Only `["ean_13", "ean_8", "upc_a", "upc_e"]` formats are configured on `BarcodeDetector` — not `"any"`.
- No custom `User-Agent` header is attempted on the Open Food Facts `fetch` call — browsers block script-set `User-Agent`; this project accepts the browser's default rather than adding a server-side proxy (see the spec's dedicated section on this).
- `jsdom` (this project's test environment) does not implement `navigator.mediaDevices` at all — tests that need it must define it with `Object.defineProperty(navigator, "mediaDevices", { value: {...}, configurable: true })`, not `vi.spyOn` (there's nothing to spy on until it's defined). Confirmed during planning.
- `barcode-detector/polyfill`'s side-effect import (added once, in `main.tsx`) both registers `BarcodeDetector` on `globalThis` (only if not already present natively) **and** declares its ambient TypeScript global type — no separate `@types` package or manual `.d.ts` file is needed; the global type is visible project-wide once `main.tsx` is part of the compiled program. Confirmed during planning by inspecting the installed package's own `.d.ts` files.
- `BarcodeDetector.prototype.detect()` accepts an `HTMLVideoElement` directly — no manual `<canvas>` frame-sampling is needed. Confirmed during planning against the installed package's type declarations.
- For emulator-backed tests, run the full `npm test`, or `npx firebase emulators:exec --only auth,firestore "npx vitest run <path>"` for a filtered run — `npm test -- <path>` does not filter (see CLAUDE.md). Pure-function/schema tests and MSW-only tests that never touch Firestore don't need the emulator wrapper.
- Always run the FULL `npm run lint` (`biome check . && eslint .`) before considering a task done.
- `afterEach` emulator cleanup always calls `clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID)` — never a hardcoded project-id literal.
- **Before writing any Ant Design component code, verify the current API with `antd info <Component>` / `antd demo <Component> <name>` — do not write component JSX from memory.**

---

## File Structure

```
src/
├── features/
│   ├── barcode/                              # NEW feature
│   │   ├── schema.ts                         # BarcodeProduct type, parseBarcodeProductDoc, toBarcodeProductDoc
│   │   ├── schema.test.ts
│   │   ├── firestoreWrites.ts                # upsertBarcodeProduct(uid, barcode, product)
│   │   ├── firestoreWrites.test.ts
│   │   ├── lookupBarcode.ts                  # lookupBarcode(uid, barcode, category)
│   │   ├── lookupBarcode.test.ts
│   │   ├── BarcodeScanner.tsx                # camera + detection loop
│   │   └── BarcodeScanner.test.tsx
│   └── pantry-items/
│       ├── AddItemModal.tsx                  # MODIFY: scan button, scanner view, barcode/source on save
│       └── AddItemModal.test.tsx             # MODIFY: add barcode-scanning tests
├── locales/
│   ├── en-us.json                            # MODIFY: add items.scanBarcode, items.cancelScan, items.cameraUnavailable
│   └── pt-br.json                            # MODIFY: same
└── main.tsx                                   # MODIFY: import "barcode-detector/polyfill"
package.json                                   # MODIFY: add barcode-detector dependency
e2e/
└── core-loop.spec.ts                          # MODIFY: barcode scan/cache round-trip case
```

---

### Task 1: `barcode_products` schema

**Files:**
- Create: `src/features/barcode/schema.ts`, `src/features/barcode/schema.test.ts`

**Interfaces:**
- Produces:
  - `interface BarcodeProduct { name: string; category: string; suggestedDuration: number | null; source: "openfoodfacts" | "manual"; updatedAt: Date }`
  - `parseBarcodeProductDoc(data: unknown): BarcodeProduct` — throws on invalid input (this is a Firestore document your own code always writes in a known shape, unlike a user-supplied backup file — matching the strictness of every other Firestore-read parse function in this codebase, e.g. `parseItemDoc`).
  - `toBarcodeProductDoc(product: Omit<BarcodeProduct, "updatedAt">): object` — Firestore-write shape, stamping a fresh `updatedAt`.

- [x] **Step 1: Write failing tests**

`src/features/barcode/schema.test.ts`:

```typescript
import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import { parseBarcodeProductDoc, toBarcodeProductDoc } from "./schema";

describe("parseBarcodeProductDoc", () => {
	it("parses a valid barcode_products document", () => {
		const now = Timestamp.now();
		const result = parseBarcodeProductDoc({
			name: "Whole Milk",
			category: "foods",
			suggestedDuration: 7,
			source: "openfoodfacts",
			updatedAt: now,
		});
		expect(result).toEqual({
			name: "Whole Milk",
			category: "foods",
			suggestedDuration: 7,
			source: "openfoodfacts",
			updatedAt: now.toDate(),
		});
	});

	it("parses a document with a null suggestedDuration", () => {
		const now = Timestamp.now();
		const result = parseBarcodeProductDoc({
			name: "Whole Milk",
			category: "foods",
			suggestedDuration: null,
			source: "manual",
			updatedAt: now,
		});
		expect(result.suggestedDuration).toBeNull();
	});

	it("rejects a document missing required fields", () => {
		expect(() => parseBarcodeProductDoc({ name: "Milk" })).toThrow();
	});
});

describe("toBarcodeProductDoc", () => {
	it("produces a Firestore-shaped payload with a fresh updatedAt Timestamp", () => {
		const result = toBarcodeProductDoc({
			name: "Whole Milk",
			category: "foods",
			suggestedDuration: null,
			source: "manual",
		});
		expect(result.name).toBe("Whole Milk");
		expect(result.category).toBe("foods");
		expect(result.suggestedDuration).toBeNull();
		expect(result.source).toBe("manual");
		expect(result.updatedAt).toBeInstanceOf(Timestamp);
	});
});
```

- [x] **Step 2: Run it, verify it fails**

```bash
npx vitest run src/features/barcode/schema.test.ts
```

Expected: FAIL — `./schema` doesn't exist yet.

- [x] **Step 3: Implement the schema**

`src/features/barcode/schema.ts`:

```typescript
import { Timestamp } from "firebase/firestore";
import { z } from "zod";

const timestampSchema = z.custom<Timestamp>(
	(val) => val instanceof Timestamp,
	{ message: "Expected a Firestore Timestamp" },
);

export const barcodeProductDocSchema = z.object({
	name: z.string().min(1),
	category: z.string().min(1),
	suggestedDuration: z.number().int().positive().nullable(),
	source: z.enum(["openfoodfacts", "manual"]),
	updatedAt: timestampSchema,
});

export interface BarcodeProduct {
	name: string;
	category: string;
	suggestedDuration: number | null;
	source: "openfoodfacts" | "manual";
	updatedAt: Date;
}

export function parseBarcodeProductDoc(data: unknown): BarcodeProduct {
	const parsed = barcodeProductDocSchema.parse(data);
	return {
		name: parsed.name,
		category: parsed.category,
		suggestedDuration: parsed.suggestedDuration,
		source: parsed.source,
		updatedAt: parsed.updatedAt.toDate(),
	};
}

export function toBarcodeProductDoc(product: Omit<BarcodeProduct, "updatedAt">) {
	return {
		name: product.name,
		category: product.category,
		suggestedDuration: product.suggestedDuration,
		source: product.source,
		updatedAt: Timestamp.now(),
	};
}
```

- [x] **Step 4: Run it, verify it passes**

```bash
npx vitest run src/features/barcode/schema.test.ts
```

- [x] **Step 5: Run full verification and commit**

```bash
npm run format
npm run lint
npx vitest run src/features/barcode/schema.test.ts
```

```bash
git add src/features/barcode/schema.ts src/features/barcode/schema.test.ts
git commit -m "feat: add barcode_products schema"
```

---

### Task 2: `upsertBarcodeProduct` write function

**Files:**
- Create: `src/features/barcode/firestoreWrites.ts`, `src/features/barcode/firestoreWrites.test.ts`

**Interfaces:**
- Consumes: `BarcodeProduct`, `toBarcodeProductDoc` (Task 1).
- Produces: `upsertBarcodeProduct(uid: string, barcode: string, product: Omit<BarcodeProduct, "updatedAt">): Promise<void>`.

- [x] **Step 1: Write a failing test**

`src/features/barcode/firestoreWrites.test.ts`:

```typescript
import { doc, getDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { upsertBarcodeProduct } from "./firestoreWrites";

const uid = "test-user-barcode-writes-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("upsertBarcodeProduct", () => {
	it("writes a new barcode_products doc", async () => {
		await upsertBarcodeProduct(uid, "0123456789012", {
			name: "Whole Milk",
			category: "foods",
			suggestedDuration: 7,
			source: "openfoodfacts",
		});
		const snapshot = await getDoc(
			doc(db, "users", uid, "barcode_products", "0123456789012"),
		);
		expect(snapshot.exists()).toBe(true);
		expect(snapshot.data()?.name).toBe("Whole Milk");
		expect(snapshot.data()?.source).toBe("openfoodfacts");
	});

	it("overwrites an existing doc (full replace, not merge)", async () => {
		await upsertBarcodeProduct(uid, "0123456789012", {
			name: "Whole Milk",
			category: "foods",
			suggestedDuration: null,
			source: "openfoodfacts",
		});
		await upsertBarcodeProduct(uid, "0123456789012", {
			name: "Whole Milk (2%)",
			category: "foods",
			suggestedDuration: 10,
			source: "manual",
		});
		const snapshot = await getDoc(
			doc(db, "users", uid, "barcode_products", "0123456789012"),
		);
		expect(snapshot.data()?.name).toBe("Whole Milk (2%)");
		expect(snapshot.data()?.suggestedDuration).toBe(10);
		expect(snapshot.data()?.source).toBe("manual");
	});
});
```

- [x] **Step 2: Run it, verify it fails**

```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/barcode/firestoreWrites.test.ts"
```

Expected: FAIL — `./firestoreWrites` doesn't exist yet.

- [x] **Step 3: Implement `upsertBarcodeProduct`**

`src/features/barcode/firestoreWrites.ts`:

```typescript
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { type BarcodeProduct, toBarcodeProductDoc } from "./schema";

export async function upsertBarcodeProduct(
	uid: string,
	barcode: string,
	product: Omit<BarcodeProduct, "updatedAt">,
): Promise<void> {
	await setDoc(
		doc(db, "users", uid, "barcode_products", barcode),
		toBarcodeProductDoc(product),
	);
}
```

- [x] **Step 4: Run it, verify it passes**

```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/barcode/firestoreWrites.test.ts"
```

- [x] **Step 5: Run full verification and commit**

```bash
npm run format
npm run lint
npm test
```

```bash
git add src/features/barcode/firestoreWrites.ts src/features/barcode/firestoreWrites.test.ts
git commit -m "feat: add upsertBarcodeProduct"
```

---

### Task 3: `lookupBarcode` cache-first flow

**Files:**
- Create: `src/features/barcode/lookupBarcode.ts`, `src/features/barcode/lookupBarcode.test.ts`

**Interfaces:**
- Consumes: `upsertBarcodeProduct` (Task 2); `parseBarcodeProductDoc` (Task 1).
- Produces: `interface BarcodeLookupResult { name: string; suggestedDuration: number | null }`; `lookupBarcode(uid: string, barcode: string, category: string): Promise<BarcodeLookupResult | null>`.

This task introduces this codebase's first use of MSW (already an unused dev dependency) — confirmed during planning that `setupServer`/`http`/`HttpResponse` from `msw`/`msw/node` correctly intercept `fetch` in this project's Vitest + jsdom setup.

- [x] **Step 1: Write failing tests**

`src/features/barcode/lookupBarcode.test.ts`:

```typescript
import { doc, getDoc, setDoc } from "firebase/firestore";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { lookupBarcode } from "./lookupBarcode";

const uid = "test-user-barcode-lookup-1";

const server = setupServer();
// "bypass" (not "error"): this suite also makes real network calls to the
// Firestore emulator (both from the SDK itself and from clearFirestoreEmulator's
// afterEach cleanup) — MSW's node interceptor patches fetch process-wide, so
// "error" would reject those unmocked emulator requests too, not just an
// actually-forgotten Open Food Facts mock. Discovered by running this task,
// not anticipated during planning — the earlier MSW probe only tested a
// single isolated fetch call, not alongside real Firestore emulator traffic.
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterEach(() => server.resetHandlers());
afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);
afterAll(() => server.close());

describe("lookupBarcode", () => {
	it("returns a cached result without calling Open Food Facts", async () => {
		server.use(
			http.get(
				"https://world.openfoodfacts.org/api/v2/product/:barcode.json",
				() => {
					throw new Error("should not have called Open Food Facts");
				},
			),
		);
		await setDoc(
			doc(db, "users", uid, "barcode_products", "0123456789012"),
			{
				name: "Cached Milk",
				category: "foods",
				suggestedDuration: 5,
				source: "manual",
				updatedAt: new Date(),
			},
		);

		const result = await lookupBarcode(uid, "0123456789012", "foods");
		expect(result).toEqual({ name: "Cached Milk", suggestedDuration: 5 });
	});

	it("falls back to Open Food Facts on a cache miss and writes the cache", async () => {
		server.use(
			http.get(
				"https://world.openfoodfacts.org/api/v2/product/0123456789012.json",
				() => HttpResponse.json({ product: { product_name: "Whole Milk" } }),
			),
		);

		const result = await lookupBarcode(uid, "0123456789012", "foods");
		expect(result).toEqual({ name: "Whole Milk", suggestedDuration: null });

		const cached = await getDoc(
			doc(db, "users", uid, "barcode_products", "0123456789012"),
		);
		expect(cached.data()?.name).toBe("Whole Milk");
		expect(cached.data()?.category).toBe("foods");
		expect(cached.data()?.source).toBe("openfoodfacts");
	});

	it("returns null and writes nothing when Open Food Facts has no match", async () => {
		server.use(
			http.get(
				"https://world.openfoodfacts.org/api/v2/product/0000000000000.json",
				() => HttpResponse.json({ status: 0 }, { status: 404 }),
			),
		);

		const result = await lookupBarcode(uid, "0000000000000", "foods");
		expect(result).toBeNull();

		const cached = await getDoc(
			doc(db, "users", uid, "barcode_products", "0000000000000"),
		);
		expect(cached.exists()).toBe(false);
	});

	it("returns null when the Open Food Facts request fails outright", async () => {
		server.use(
			http.get(
				"https://world.openfoodfacts.org/api/v2/product/0000000000001.json",
				() => HttpResponse.error(),
			),
		);

		const result = await lookupBarcode(uid, "0000000000001", "foods");
		expect(result).toBeNull();
	});
});
```

- [x] **Step 2: Run it, verify it fails**

```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/barcode/lookupBarcode.test.ts"
```

Expected: FAIL — `./lookupBarcode` doesn't exist yet.

- [x] **Step 3: Implement `lookupBarcode`**

`src/features/barcode/lookupBarcode.ts`:

```typescript
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { upsertBarcodeProduct } from "./firestoreWrites";
import { parseBarcodeProductDoc } from "./schema";

export interface BarcodeLookupResult {
	name: string;
	suggestedDuration: number | null;
}

export async function lookupBarcode(
	uid: string,
	barcode: string,
	category: string,
): Promise<BarcodeLookupResult | null> {
	try {
		const cached = await getDoc(
			doc(db, "users", uid, "barcode_products", barcode),
		);
		if (cached.exists()) {
			const product = parseBarcodeProductDoc(cached.data());
			return {
				name: product.name,
				suggestedDuration: product.suggestedDuration,
			};
		}
	} catch {
		// Fall through to Open Food Facts — a Firestore lookup failure is
		// treated the same as a cache miss, never blocks adding the item.
	}

	try {
		const response = await fetch(
			`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name`,
		);
		if (!response.ok) return null;
		const data = await response.json();
		const name = data?.product?.product_name;
		if (typeof name !== "string" || name.length === 0) return null;

		await upsertBarcodeProduct(uid, barcode, {
			name,
			category,
			suggestedDuration: null,
			source: "openfoodfacts",
		});

		return { name, suggestedDuration: null };
	} catch {
		return null;
	}
}
```

- [x] **Step 4: Run it, verify it passes**

```bash
npx firebase emulators:exec --only auth,firestore "npx vitest run src/features/barcode/lookupBarcode.test.ts"
```

- [x] **Step 5: Run full verification and commit**

```bash
npm run format
npm run lint
npm test
```

```bash
git add src/features/barcode/lookupBarcode.ts src/features/barcode/lookupBarcode.test.ts
git commit -m "feat: add cache-first barcode lookup with Open Food Facts fallback"
```

---

### Task 4: `barcode-detector` install + `BarcodeScanner` component

**Files:**
- Create: `src/features/barcode/BarcodeScanner.tsx`, `src/features/barcode/BarcodeScanner.test.tsx`
- Modify: `src/main.tsx`, `src/locales/en-us.json`, `src/locales/pt-br.json`, `package.json`, `package-lock.json`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `BarcodeScanner({ onDetect: (barcode: string) => void; onCancel: () => void })`. Renders a live camera preview and calls `onDetect` once a supported barcode format is recognized; calls `onCancel` (and shows an inline message) if `getUserMedia` fails for any reason. Always stops its media stream on unmount.

- [x] **Step 1: Install the dependency**

```bash
npm install barcode-detector
```

- [x] **Step 2: Import the polyfill once, at the app entry point**

Modify `src/main.tsx` — add as the first import:

```typescript
import "barcode-detector/polyfill";
```

This registers `BarcodeDetector` on `globalThis` only if the browser doesn't already have a native implementation, and declares its ambient TypeScript type for the whole program — no other file needs to import anything from `barcode-detector` to use the global `BarcodeDetector` class.

- [x] **Step 3: Add locale keys**

Add to the `"items"` object in **both** locale files:

en-us.json:
```json
"scanBarcode": "Scan barcode",
"cancelScan": "Cancel scan",
"cameraUnavailable": "Camera unavailable. Enter the item manually below."
```

pt-br.json:
```json
"scanBarcode": "Escanear código de barras",
"cancelScan": "Cancelar escaneamento",
"cameraUnavailable": "Câmera indisponível. Preencha os campos manualmente abaixo."
```

- [x] **Step 4: Write failing tests**

`src/features/barcode/BarcodeScanner.test.tsx`:

```tsx
import "../../lib/i18n";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BarcodeScanner } from "./BarcodeScanner";

afterEach(() => {
	vi.unstubAllGlobals();
	// jsdom doesn't define navigator.mediaDevices at all by default — each
	// test defines it fresh via Object.defineProperty; this removes it so
	// the next test starts from the same undefined baseline.
	delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
});

describe("BarcodeScanner", () => {
	it("calls onDetect with the scanned value, requesting the rear camera", async () => {
		const getUserMedia = vi.fn().mockResolvedValue({
			getTracks: () => [{ stop: vi.fn() }],
		});
		Object.defineProperty(navigator, "mediaDevices", {
			value: { getUserMedia },
			configurable: true,
		});
		class FakeBarcodeDetector {
			detect() {
				return Promise.resolve([{ rawValue: "0123456789012" }]);
			}
		}
		vi.stubGlobal("BarcodeDetector", FakeBarcodeDetector);

		const onDetect = vi.fn();
		const onCancel = vi.fn();
		render(<BarcodeScanner onDetect={onDetect} onCancel={onCancel} />);

		await waitFor(() =>
			expect(onDetect).toHaveBeenCalledWith("0123456789012"),
		);
		expect(getUserMedia).toHaveBeenCalledWith({
			video: { facingMode: "environment" },
		});
	});

	it("shows an inline error and calls onCancel when the camera is unavailable", async () => {
		const getUserMedia = vi.fn().mockRejectedValue(new Error("denied"));
		Object.defineProperty(navigator, "mediaDevices", {
			value: { getUserMedia },
			configurable: true,
		});

		const onDetect = vi.fn();
		const onCancel = vi.fn();
		const { findByText } = render(
			<BarcodeScanner onDetect={onDetect} onCancel={onCancel} />,
		);

		await findByText(/camera unavailable/i);
		expect(onCancel).toHaveBeenCalled();
		expect(onDetect).not.toHaveBeenCalled();
	});
});
```

- [x] **Step 5: Run it, verify it fails**

```bash
npx vitest run src/features/barcode/BarcodeScanner.test.tsx
```

Expected: FAIL — `./BarcodeScanner` doesn't exist yet.

- [x] **Step 6: Implement `BarcodeScanner`**

`src/features/barcode/BarcodeScanner.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

const BARCODE_FORMATS: BarcodeFormat[] = ["ean_13", "ean_8", "upc_a", "upc_e"];

export function BarcodeScanner({
	onDetect,
	onCancel,
}: {
	onDetect: (barcode: string) => void;
	onCancel: () => void;
}) {
	const { t } = useTranslation();
	const videoRef = useRef<HTMLVideoElement>(null);
	const [error, setError] = useState(false);

	// Latest callbacks are read via refs rather than listed as effect deps:
	// the camera-acquisition effect below must run exactly once per mount
	// (acquire the camera once, release it once) regardless of how many
	// times the parent re-renders with a new inline onDetect/onCancel
	// function identity. The refs are synced in their own effect (not
	// written during render) since eslint-plugin-react-hooks's `refs` rule
	// forbids writing ref.current outside an effect/event handler — this
	// was discovered by running `npm run lint` while implementing this
	// task, not anticipated during planning.
	const onDetectRef = useRef(onDetect);
	const onCancelRef = useRef(onCancel);
	useEffect(() => {
		onDetectRef.current = onDetect;
		onCancelRef.current = onCancel;
	});

	useEffect(() => {
		let stream: MediaStream | null = null;
		let rafId: number;
		let cancelled = false;

		navigator.mediaDevices
			.getUserMedia({ video: { facingMode: "environment" } })
			.then((mediaStream) => {
				if (cancelled) {
					for (const track of mediaStream.getTracks()) track.stop();
					return;
				}
				stream = mediaStream;
				if (videoRef.current) {
					videoRef.current.srcObject = mediaStream;
				}
				const detector = new BarcodeDetector({ formats: BARCODE_FORMATS });
				const loop = async () => {
					if (cancelled || !videoRef.current) return;
					const results = await detector.detect(videoRef.current);
					if (results.length > 0) {
						onDetectRef.current(results[0].rawValue);
						return;
					}
					rafId = requestAnimationFrame(loop);
				};
				loop();
			})
			.catch(() => {
				setError(true);
				onCancelRef.current();
			});

		return () => {
			cancelled = true;
			if (rafId) cancelAnimationFrame(rafId);
			if (stream) for (const track of stream.getTracks()) track.stop();
		};
	}, []);

	if (error) {
		return <div>{t("items.cameraUnavailable")}</div>;
	}

	return <video ref={videoRef} autoPlay muted style={{ width: "100%" }} />;
}
```

- [x] **Step 7: Run it, verify it passes**

```bash
npx vitest run src/features/barcode/BarcodeScanner.test.tsx
```

- [x] **Step 8: Run full verification and commit**

```bash
npm run format
npm run lint
npm run build
npm test
```

```bash
git add src/features/barcode/BarcodeScanner.tsx src/features/barcode/BarcodeScanner.test.tsx \
  src/main.tsx src/locales/en-us.json src/locales/pt-br.json package.json package-lock.json
git commit -m "feat: add BarcodeScanner camera component"
```

---

### Task 5: Wire scanning into `AddItemModal`

**Files:**
- Modify: `src/features/pantry-items/AddItemModal.tsx`, `src/features/pantry-items/AddItemModal.test.tsx`

**Interfaces:**
- Consumes: `BarcodeScanner` (Task 4); `lookupBarcode` (Task 3); `upsertBarcodeProduct` (Task 2).
- Produces: `AddItemModal`'s existing props are unchanged. `addItem` is now called with real `barcode`/`source` values instead of the hardcoded `null`/`"manual"`.

- [x] **Step 1: Write failing tests**

Read the current `src/features/pantry-items/AddItemModal.test.tsx` first — these two new tests get added alongside its existing two (which stay unmodified). Its current imports are just
`import "../../lib/i18n"; import { render, screen } from "@testing-library/react"; import { describe, expect, it, vi } from "vitest"; import type { Category } from "../categories/schema"; import { AddItemModal } from "./AddItemModal";`
— neither `userEvent` nor `waitFor` is imported yet (the existing two tests only render and read state, they never interact or wait). Change the `@testing-library/react` import to also pull in `waitFor`, and add a new import for `userEvent`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
```

The existing `import { describe, expect, it, vi } from "vitest";` also needs `afterEach` added (see the mock-leakage fix below).

Then add this import and a module mock, placed after the existing imports:

```tsx
import * as lookupBarcodeModule from "../barcode/lookupBarcode";

vi.mock("../barcode/BarcodeScanner", () => ({
	BarcodeScanner: ({ onDetect }: { onDetect: (barcode: string) => void }) => (
		<button type="button" onClick={() => onDetect("0123456789012")}>
			fake-detect
		</button>
	),
}));
```

Then add this new `describe` block:

```tsx
describe("AddItemModal barcode scanning", () => {
	// Without this, vi.spyOn's call history on the shared lookupBarcode module
	// export leaks across tests in this file (same pattern as Phase 4's
	// SettingsPane i18n flake) — the second test's "not called" assertion
	// would otherwise see the first test's leftover call. Discovered by
	// running this task, not anticipated during planning.
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("opens the scanner and pre-fills the name after a successful detect", async () => {
		vi.spyOn(lookupBarcodeModule, "lookupBarcode").mockResolvedValue({
			name: "Whole Milk",
			suggestedDuration: 7,
		});

		render(
			<AddItemModal
				uid="test-user-barcode-modal-1"
				category={category}
				open
				onClose={vi.fn()}
			/>,
		);

		await userEvent.click(
			screen.getByRole("button", { name: /scan barcode/i }),
		);
		expect(screen.getByText("fake-detect")).toBeInTheDocument();

		await userEvent.click(screen.getByText("fake-detect"));

		await waitFor(() =>
			expect(lookupBarcodeModule.lookupBarcode).toHaveBeenCalledWith(
				"test-user-barcode-modal-1",
				"0123456789012",
				"foods",
			),
		);
		await waitFor(() =>
			expect(screen.getByLabelText(/name/i)).toHaveValue("Whole Milk"),
		);
	});

	it("returns to the form view without looking anything up when scanning is cancelled", async () => {
		const lookupSpy = vi.spyOn(lookupBarcodeModule, "lookupBarcode");

		render(
			<AddItemModal
				uid="test-user-barcode-modal-2"
				category={category}
				open
				onClose={vi.fn()}
			/>,
		);

		await userEvent.click(
			screen.getByRole("button", { name: /scan barcode/i }),
		);
		await userEvent.click(
			screen.getByRole("button", { name: /cancel scan/i }),
		);

		expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
		expect(lookupSpy).not.toHaveBeenCalled();
	});
});
```

- [x] **Step 2: Run it, verify it fails**

```bash
npx vitest run src/features/pantry-items/AddItemModal.test.tsx
```

Expected: FAIL — no "Scan barcode" button exists yet.

- [x] **Step 3: Wire scanning into `AddItemModal`**

Replace the full contents of `src/features/pantry-items/AddItemModal.tsx`:

```tsx
import { BarcodeOutlined } from "@ant-design/icons";
import {
	Button,
	DatePicker,
	Form,
	Input,
	InputNumber,
	Modal,
	message,
	Switch,
} from "antd";
import type { Dayjs } from "dayjs";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { upsertBarcodeProduct } from "../barcode/firestoreWrites";
import { lookupBarcode } from "../barcode/lookupBarcode";
import { BarcodeScanner } from "../barcode/BarcodeScanner";
import type { Category } from "../categories/schema";
import { addItem } from "./firestoreWrites";

interface AddItemFormValues {
	name: string;
	quantity: number;
	expiringDate: Dayjs;
	duration?: number;
	recurring: boolean;
}

export function AddItemModal({
	uid,
	category,
	open,
	onClose,
	initialName,
	initialRecurring = false,
}: {
	uid: string;
	category: Category;
	open: boolean;
	onClose: () => void;
	initialName?: string;
	initialRecurring?: boolean;
}) {
	const { t } = useTranslation();
	const [form] = Form.useForm<AddItemFormValues>();
	const [scannerOpen, setScannerOpen] = useState(false);
	const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);

	// eslint-plugin-react-hooks's `set-state-in-effect` rule forbids calling
	// setState synchronously inside an effect body — discovered by running
	// `npm run lint` while implementing this task, not anticipated during
	// planning. Fixed with the React-recommended "adjusting state when a prop
	// changes" render-time-resync pattern (same pattern already used by
	// SettingsPane's threshold fields), keeping only the imperative
	// `form.setFieldsValue` call — an external system, not React state — in
	// its own effect:
	const [prevOpen, setPrevOpen] = useState(open);
	if (open !== prevOpen) {
		setPrevOpen(open);
		if (open) {
			setScannedBarcode(null);
			setScannerOpen(false);
		}
	}

	useEffect(() => {
		if (open) {
			form.setFieldsValue({
				name: initialName ?? "",
				recurring: initialRecurring,
			});
		}
	}, [open, initialName, initialRecurring, form]);

	const handleDetect = async (barcode: string) => {
		setScannerOpen(false);
		setScannedBarcode(barcode);
		const result = await lookupBarcode(uid, barcode, category.key);
		if (result) {
			form.setFieldsValue({
				name: result.name,
				...(result.suggestedDuration !== null
					? { duration: result.suggestedDuration }
					: {}),
			});
		}
	};

	const handleOk = async () => {
		const values = await form.validateFields();
		try {
			await addItem(uid, {
				name: values.name.trim(),
				category: category.key,
				quantity: values.quantity,
				expiringDate: values.expiringDate.toDate(),
				duration: values.duration ?? null,
				dateOpened: null,
				opened: false,
				recurring: values.recurring,
				barcode: scannedBarcode,
				source: scannedBarcode ? "barcode" : "manual",
			});
			if (scannedBarcode) {
				await upsertBarcodeProduct(uid, scannedBarcode, {
					name: values.name.trim(),
					category: category.key,
					suggestedDuration: values.duration ?? null,
					source: "manual",
				});
			}
			form.resetFields();
			setScannedBarcode(null);
			onClose();
		} catch {
			message.error("Something went wrong, please try again");
		}
	};

	return (
		<Modal
			title={t("items.addTitle")}
			open={open}
			onOk={handleOk}
			onCancel={onClose}
			footer={scannerOpen ? null : undefined}
			destroyOnHidden
		>
			{scannerOpen ? (
				<>
					<BarcodeScanner
						onDetect={handleDetect}
						onCancel={() => setScannerOpen(false)}
					/>
					<Button
						onClick={() => setScannerOpen(false)}
						style={{ marginTop: 8 }}
					>
						{t("items.cancelScan")}
					</Button>
				</>
			) : (
				<Form
					form={form}
					layout="vertical"
					initialValues={{
						name: initialName ?? "",
						quantity: 1,
						recurring: initialRecurring,
					}}
				>
					<Form.Item
						name="name"
						label={t("items.name")}
						rules={[{ required: true }]}
					>
						<Input />
					</Form.Item>
					<Button
						icon={<BarcodeOutlined />}
						onClick={() => setScannerOpen(true)}
						style={{ marginBottom: 16 }}
					>
						{t("items.scanBarcode")}
					</Button>
					<Form.Item
						name="quantity"
						label={t("items.quantity")}
						rules={[{ required: true }]}
					>
						<InputNumber min={1} style={{ width: "100%" }} />
					</Form.Item>
					<Form.Item
						name="expiringDate"
						label={t("items.expiringDate")}
						rules={[{ required: true }]}
					>
						<DatePicker style={{ width: "100%" }} />
					</Form.Item>
					<Form.Item name="duration" label={t("items.duration")}>
						<InputNumber min={1} style={{ width: "100%" }} />
					</Form.Item>
					<Form.Item
						name="recurring"
						label={t("items.recurring")}
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
				</Form>
			)}
		</Modal>
	);
}
```

- [x] **Step 4: Run it, verify it passes**

```bash
npx vitest run src/features/pantry-items/AddItemModal.test.tsx
```

All four tests (the original two plus the two new ones) should pass.

- [x] **Step 5: Verify manually**

```bash
npm run dev
```

Open Add Item, click "Scan barcode" — your browser will prompt for camera permission (grant it if you have a webcam; otherwise confirm the inline "Camera unavailable" message appears and you can still fill the form manually). Point a real barcode at the camera if available, confirm the name field pre-fills.

- [x] **Step 6: Run full verification and commit**

```bash
npm run format
npm run lint
npm run build
npm test
```

```bash
git add src/features/pantry-items/AddItemModal.tsx src/features/pantry-items/AddItemModal.test.tsx
git commit -m "feat: wire barcode scanning into AddItemModal"
```

---

### Task 6: E2e coverage and final verification

**Files:**
- Modify: `e2e/core-loop.spec.ts`

**Interfaces:**
- Consumes: the full feature built in Tasks 1–5.

- [x] **Step 1: Add a barcode scan/cache-reuse e2e case**

Add to `e2e/core-loop.spec.ts`, following its established conventions (pt-br button/label text, the `.ant-picker-cell-today` date-picker workaround). This test mocks the detector via `page.addInitScript` (which runs before any of the app's own JavaScript, including its `barcode-detector/polyfill` import — the polyfill only registers `BarcodeDetector` if it isn't already present, so setting it here first means the app always uses this fake) and mocks the Open Food Facts response via `page.route`.

**Camera mocking correction, found by running this task, not anticipated during planning:** a plain mock object (`{ getTracks: () => [...] }`) returned from a JS-overridden `getUserMedia` works fine in jsdom (unit tests) but throws when assigned to a real `HTMLVideoElement.srcObject` in actual Chromium — that setter requires a real `MediaStream`/`MediaSource`/`Blob`. The uncaught throw inside `BarcodeScanner`'s `.then()` was swallowed by its own `.catch()`, which set the error state AND called `onCancel()` — so the modal silently snapped back to the empty form with no visible error, no network request, and no console error, making this look like a name-prefill bug rather than a camera-mocking bug. Fixed by NOT overriding `navigator.mediaDevices` in the test at all, and instead adding Chromium fake-camera launch flags to `playwright.config.ts`:

```typescript
use: {
	baseURL: "http://localhost:5173",
	locale: "pt-BR",
	permissions: ["camera"],
	launchOptions: {
		args: [
			"--use-fake-device-for-media-stream",
			"--use-fake-ui-for-media-stream",
		],
	},
},
```

With these flags, Chromium auto-grants camera permission and `getUserMedia` returns a real (synthetic test-pattern) `MediaStream`, satisfying `srcObject`'s type check. Only `BarcodeDetector` still needs mocking (no real barcode is ever in frame).

```typescript
test("scans a barcode, pre-fills the name from Open Food Facts, and reuses the cache on a repeat scan", async ({ page }) => {
	let offCallCount = 0;
	await page.route(
		"https://world.openfoodfacts.org/api/v2/product/0123456789012.json*",
		(route) => {
			offCallCount++;
			route.fulfill({ json: { product: { product_name: "Whole Milk" } } });
		},
	);

	// getUserMedia itself is real here (see playwright.config.ts's fake-camera
	// launch flags) — only BarcodeDetector needs a JS-level mock, since no
	// real barcode is in frame for Chromium's synthetic test-pattern video.
	await page.addInitScript(() => {
		class FakeBarcodeDetector {
			detect() {
				return Promise.resolve([{ rawValue: "0123456789012" }]);
			}
		}
		(window as unknown as { BarcodeDetector: unknown }).BarcodeDetector =
			FakeBarcodeDetector;
	});

	await page.goto("/");
	await page.getByText("Cadastrar").click();
	await page.getByLabel("E-mail").fill(`e2e-barcode-${Date.now()}@example.com`);
	await page.getByLabel("Senha").fill("correct-horse-battery");
	await page.getByRole("button", { name: "Cadastrar" }).click();

	await page.getByRole("tab", { name: /Foods/ }).click();
	await page.getByRole("button", { name: "plus" }).click();
	await page
		.getByRole("button", { name: "Escanear código de barras" })
		.click();

	await expect(page.getByLabel("Nome")).toHaveValue("Whole Milk", {
		timeout: 10000,
	});

	await page.getByLabel("Quantidade").fill("1");
	await page.getByLabel("Data de validade").click();
	await page.locator(".ant-picker-cell-today").click();
	await page.getByRole("button", { name: "OK" }).click();
	await expect(page.getByText("Whole Milk")).toBeVisible();

	// Second scan of the SAME barcode, in a fresh Add Item flow — should
	// resolve from the Firestore cache written by the first scan, without a
	// second Open Food Facts call.
	await page.getByRole("button", { name: "plus" }).click();
	await page
		.getByRole("button", { name: "Escanear código de barras" })
		.click();
	await expect(page.getByLabel("Nome")).toHaveValue("Whole Milk", {
		timeout: 10000,
	});

	expect(offCallCount).toBe(1);
});
```

Verify every selector empirically against the real running app rather than trusting this brief blindly — check the actual rendered DOM/accessible names before assuming they match. Every prior phase's e2e task has found at least one brief-guessed selector needed adjusting after checking reality.

- [x] **Step 2: Run it against the emulator**

```bash
npx firebase emulators:exec --only auth,firestore "VITE_USE_FIREBASE_EMULATORS=true npm run test:e2e"
```

Expected: PASS (all existing cases plus the new one).

- [x] **Step 3: Run the full verification suite one more time**

```bash
npm run format
npm run lint
npm run build
npm test
npx firebase emulators:exec --only auth,firestore "VITE_USE_FIREBASE_EMULATORS=true npm run test:e2e"
```

All five must be clean before this task is considered done.

- [x] **Step 4: Commit**

```bash
git add e2e/core-loop.spec.ts
git commit -m "test: add e2e coverage for barcode scanning and cache reuse"
```

---

## Self-Review Notes

- **Spec coverage:** `barcode_products` data model under `users/{uid}` (Task 1) ✓; cache-first lookup with the Open Food Facts fallback and immediate cache write on an OFF hit (Task 3) ✓; the `User-Agent` limitation honored (plain `fetch`, no header manipulation attempted) ✓; camera component with rear-camera preference, restricted barcode formats, guaranteed stream cleanup, and permission-denied inline fallback (Task 4) ✓; `AddItemModal` integration including the item's own `barcode`/`source` fields and the save-time cache re-teach (Task 5) ✓; e2e round trip proving both the Open Food Facts path and the cache-reuse path (Task 6) ✓. Every "out of scope" item from the spec (receipt OCR, a server-side OFF proxy, a cache-management UI, non-retail barcode formats) has no corresponding task, as intended.
- **Type consistency:** `BarcodeProduct`/`BarcodeLookupResult` (Tasks 1 and 3) are the only two shapes involved, threaded consistently through `lookupBarcode` → `AddItemModal`'s `handleDetect`. `upsertBarcodeProduct`'s exact signature (Task 2) matches both of its call sites (`lookupBarcode`'s OFF-hit branch, and `AddItemModal`'s `handleOk`).
- **Placeholder scan:** no TBD/TODO markers. Every runtime claim this plan depends on (MSW actually intercepting fetch in this project's test setup, `jsdom`'s missing `navigator.mediaDevices`, `barcode-detector`'s exact API and ambient-type behavior, `BarcodeDetector.detect()` accepting a raw `HTMLVideoElement`) was empirically verified during planning, not assumed from memory — each is called out in Global Constraints with a note on how it was confirmed.
