# Phase 5: Barcode Scanning — Design

## Purpose

Phase 5 delivers the master rewrite spec's "Barcode scanning on the add-item
flow (new capability, the core adoption fix)" — the capability the original
design's Problem section identifies as the most likely fix for the
household's non-adoption of v1 (manual data-entry friction on every add).
This phase adds a camera-based scan button to `AddItemModal`, a
Firestore-backed product-metadata cache, and a fallback lookup against the
free Open Food Facts API, so that scanning a barcode auto-fills as much of
the add form as possible.

The master rewrite spec already sketches this feature's Firestore shape and
cache-first flow (see its "Barcode scanning feature" section) and explicitly
flags two open items this design resolves: the exact scanning library, and
permission-denied UX.

## Scope

**In scope:**
- A camera-based scan button inside `AddItemModal`, using the device's rear
  camera where available.
- A `users/{uid}/barcode_products/{barcode}` Firestore cache (product name,
  category, suggested opened-duration).
- Cache-first lookup: local Firestore cache → Open Food Facts API → plain
  manual entry, with every step degrading silently on failure.
- Writing back to the cache both on a successful Open Food Facts lookup
  (immediately) and on every item save where a barcode is present
  (re-teaching the cache with the user-confirmed final values).

**Out of scope (deferred, not dropped):**
- Receipt-OCR batch import — explicitly a non-goal of the whole rewrite
  (bigger, riskier follow-up to barcode scanning per the master spec).
- A server-side proxy for the Open Food Facts call — see the User-Agent
  discussion below; this phase calls OFF directly from the browser.
- Editing/removing a cached `barcode_products` entry from the UI — if a
  household member scans a barcode and the pre-filled data is wrong, they
  just edit the form fields before saving; the next save's unconditional
  cache re-teach (see below) self-corrects the cache. No separate
  cache-management screen.
- Barcode formats beyond retail linear codes (EAN-13, EAN-8, UPC-A, UPC-E)
  — the formats actually printed on grocery/pharmacy products, which is
  this app's whole domain. QR codes, data matrix, etc. are not scanned.

## Data model

`users/{uid}/barcode_products/{barcode}` — nested under the existing
per-user document tree (matching the master spec's data-layer diagram
exactly), so the existing `users/{userId}/{document=**}` security rule
already covers it; no new Firestore rule is needed.

```typescript
{
  name: string,
  category: string,              // the category key the item was added under
  suggestedDuration: number | null,
  source: "openfoodfacts" | "manual",
  updatedAt: Timestamp,
}
```

A new `src/features/barcode/` feature owns this, following the same
Firestore-boundary-parsing pattern every existing feature already uses:
`schema.ts` (`barcodeProductDocSchema`, `parseBarcodeProductDoc(id, data)`,
`toBarcodeProductDoc(product)`), `firestoreWrites.ts`
(`upsertBarcodeProduct(uid, barcode, product)`).

`category` is stored for completeness (matches the master spec's example
doc) but is never read back out of the cache for pre-filling — see the
lookup flow below for why.

## Cache-first lookup flow

`lookupBarcode(uid, barcode): Promise<{ name: string; suggestedDuration: number | null } | null>`
in `src/features/barcode/lookupBarcode.ts`:

1. `getDoc` on `users/{uid}/barcode_products/{barcode}`. If found, return
   `{ name, suggestedDuration }` immediately — no network call. Firestore's
   local cache makes this work offline too, once synced.
2. Not found → call Open Food Facts:
   `GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json?fields=product_name`,
   no auth, browser's default `User-Agent` (see the dedicated section
   below for why a custom one isn't used). If the response has a
   `product_name`, **immediately** `upsertBarcodeProduct` with
   `source: "openfoodfacts"` — this write happens right away, independent
   of whether the user ends up saving the item, so an abandoned Add Item
   flow still teaches the cache for next time. Return
   `{ name: product_name, suggestedDuration: null }` — Open Food Facts has
   no "days after opening" concept, so `suggestedDuration` is never sourced
   from it.
3. Not found in Open Food Facts either, the fetch fails, or the response is
   malformed → return `null`. No cache write here; nothing was learned.

Any error at any step (network failure, malformed response, Firestore
error) is caught internally and treated as step 3's "not found" outcome —
scanning degrades to plain manual entry, never blocks adding the item,
matching the master spec's stated principle for scan/lookup failures.

**On save** (`AddItemModal`'s existing `handleOk`), if a barcode was
scanned this session, `upsertBarcodeProduct` runs unconditionally with
whatever `name`/`category`/`duration` the user actually submitted and
`source: "manual"`. This is a deliberate simplification of the master
spec's two separate cases (OFF-taught vs. manually-taught): every save with
a barcode present re-teaches the cache with the final, human-confirmed
values — whether that data originated from Open Food Facts, a prior cache
hit, or from scratch — keeping the cache self-correcting over time with one
rule instead of two.

## On the Open Food Facts `User-Agent`

The master spec states this design sets "a proper `User-Agent`" on the Open
Food Facts request, per OFF's usage policy recommendation. **This is not
achievable from a pure client-side `fetch` call** — `User-Agent` is a
forbidden header name browsers do not let JavaScript override; the browser
always sends its own value regardless of what the code sets. This is a
correction to the master spec's stated design, not an implementation
detail to work around.

Given this app makes occasional, human-triggered lookups for a two-person
household (not automated bulk scraping — the behavior OFF's guidance
actually targets), and given this project's established preference for
avoiding server-side infrastructure wherever avoidable (the same reasoning
already used to choose GitHub Actions over Cloud Functions for push
notifications), this phase calls Open Food Facts directly from the browser
and accepts the browser's default `User-Agent`. A server-side proxy solely
to set a custom header is out of scope (see Scope).

## Camera component + `AddItemModal` integration

- `barcode-detector` (MIT-licensed npm package, ponyfill/polyfill for the
  native Barcode Detection API backed by `zxing-wasm`, also MIT) is added
  as a dependency. `barcode-detector/polyfill` is imported once, as a
  side-effect import in `main.tsx` — it registers `BarcodeDetector` on
  `globalThis` only if not already present natively, so the rest of the
  app's code always just uses `window.BarcodeDetector` without any
  native-vs-fallback branching. The WASM fallback only loads when actually
  invoked (i.e., only on browsers lacking native support).
- New `src/features/barcode/BarcodeScanner.tsx`:
  `{ onDetect: (barcode: string) => void; onCancel: () => void }`.
  Internally: `navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })`
  (rear camera preferred), assigns the resulting stream to a `<video>`
  ref, and polls
  `new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] }).detect(videoEl)`
  via `requestAnimationFrame` — `detect()` accepts an `HTMLVideoElement`
  directly, no manual canvas frame-sampling needed. On a result, calls
  `onDetect(barcode)`. Always stops every media track on unmount or
  cancel — releasing the camera is a hard requirement, not optional
  cleanup. If `getUserMedia` rejects (permission denied, no camera, or any
  other `getUserMedia` error), shows an inline message in place of the
  video and calls `onCancel` — the modal's form remains fully usable via
  manual entry.
- `AddItemModal` gets a "Scan barcode" button next to the `name` field.
  Clicking it swaps the form body for `<BarcodeScanner>` (within the same
  `Modal` — no nested Modal-in-Modal). On detect: call `lookupBarcode`,
  `form.setFieldsValue({ name })` if a result came back (category is
  already known from the modal's existing `category` prop, never read from
  the cache; duration pre-fills from `suggestedDuration` if present,
  otherwise stays blank for manual entry), store the barcode in local
  component state (`scannedBarcode: string | null`), and swap back to the
  form view. On cancel: swap back with no state change.
- On save, `AddItemModal`'s `handleOk` now passes
  `barcode: scannedBarcode, source: scannedBarcode ? "barcode" : "manual"`
  to `addItem` (both fields already exist on `PantryItem`/`itemDocSchema`
  since Phase 1 — currently always hardcoded to `null`/`"manual"` there),
  in addition to the `upsertBarcodeProduct` cache re-teach described above.

## Testing

- `schema.test.ts` — `parseBarcodeProductDoc`/`toBarcodeProductDoc`
  round-trip; malformed-input handling.
- `lookupBarcode.test.ts` — emulator-backed for the Firestore cache-hit
  path (skips the network call entirely, verified via not mocking
  `fetch`); MSW-mocked for the Open Food Facts path (per the master
  spec's testing section): cache miss + OFF hit returns the name and
  writes the cache; cache miss + OFF miss returns `null` with no write; a
  simulated OFF fetch failure also returns `null` without throwing.
- `firestoreWrites.test.ts` — `upsertBarcodeProduct` writes/overwrites
  correctly.
- `BarcodeScanner.test.tsx` — mocks `navigator.mediaDevices.getUserMedia`
  and `window.BarcodeDetector` (a fake class whose `detect()` resolves
  with a canned `{ rawValue }`): a successful detection calls `onDetect`
  with the right value and stops the stream; a rejected `getUserMedia`
  shows the inline error and calls `onCancel`.
- e2e: extend `core-loop.spec.ts` with a scan-flow case, mocking
  `getUserMedia` and `BarcodeDetector` via `page.addInitScript` (so the
  fakes exist before the app's own module-load-time
  `barcode-detector/polyfill` import runs) plus a Playwright-route-mocked
  Open Food Facts response — sign up, open Add Item, click Scan, "detect"
  a barcode, confirm the name pre-fills, save, then scan the *same*
  barcode again in a second Add Item and confirm it now resolves from the
  Firestore cache (no second Open Food Facts call).

## Global constraints for implementation

- `barcode_products` lives under `users/{uid}/` — never a top-level
  collection. No new Firestore security rule.
- `category` is written to the cache but never read from it for pre-fill —
  the modal's own `category` prop is always the source of truth for that
  field.
- Every error path (Firestore, network, malformed response, camera
  permission) degrades to plain manual entry. Nothing in this feature may
  block adding an item.
- The camera stream must be stopped on every exit path from
  `BarcodeScanner` (successful detect, cancel, and unmount) — no
  code path may leave a stream running.
- Only `ean_13`, `ean_8`, `upc_a`, `upc_e` formats are configured on the
  `BarcodeDetector` — not `"any"`.
- No custom `User-Agent` header is attempted on the Open Food Facts
  `fetch` call — see the dedicated section above.
