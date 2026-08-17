# Phase 1: Foundation + Core Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the v2 Vite/React/TypeScript/Ant Design app against the existing Firebase project, with a fully working core pantry loop: login, categories, add/view/edit/consume/discard items, expiry-based sorting, red/yellow/white visual warnings, and a bilingual (pt-br/en-us) shell.

**Architecture:** Vite SPA, Ant Design v6 components, Firebase Auth + Firestore accessed via typed hooks wrapping `onSnapshot` (no TanStack Query), Zustand for local UI state, react-i18next for bilingual strings, Zod for parsing Firestore documents at the read boundary. Firestore-touching tests run against the Firebase Local Emulator Suite; pure logic is unit tested directly.

**Tech Stack:** Vite, React 19, TypeScript, Ant Design v6, `firebase` (modular SDK v10+), Zustand, react-i18next, Zod, dayjs (Ant Design's date library), Vitest, React Testing Library, Playwright, MSW, Biome, firebase-tools (emulators).

## Global Constraints

- Reuse the existing Firebase project. Vite exposes env vars to client code only with a `VITE_` prefix, so v1's `.env` keys (`FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`) get copied into v2's `.env` renamed to `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, etc. Values come from `/home/gca/repos/expiring_products/.env` (gitignored there and here — never commit it).
- Firestore field names on `items` stay snake_case (`expiring_date`, `date_opened`) to match the design spec; parsed domain objects in application code use camelCase. All Firestore reads go through a Zod schema — no untyped `doc.data()` access in components or hooks.
- `expiring_date` and `date_opened` are Firestore `Timestamp`, not strings (spec decision, enables server-side range queries later).
- Item schema includes `barcode: string | null` and `source: "manual" | "barcode"` fields now, even though barcode scanning is Phase 5 — avoids a schema migration later. Every item written in this phase sets `barcode: null, source: "manual"`.
- No `statistics` writes (deferred scope).
- Sort/filter/hidden-threshold UI preferences are Zustand-only (in-memory, per-device) in this phase — Firestore-synced settings is Phase 4. Don't build persistence for these yet.
- Every task that touches Firestore is tested against the Firebase Local Emulator Suite, not the live project.
- Before writing any Ant Design component code, confirm current props with `antd info <Component> --format json` or grab a working shape with `antd demo <Component> <name> --format json` — don't rely purely on memory. This plan's snippets are already grounded this way for Form, Modal, DatePicker, and FloatButton; re-check any component this plan didn't verify.
- Comment discipline: no comments explaining *what* code does; only WHY, when non-obvious (per `surgical-comments`).

---

## File Structure

```
expiring-products-v2/
├── .env                          # gitignored, copied+renamed from v1
├── .env.example                  # committed, no real values
├── biome.json
├── eslint.config.js
├── firebase.json                 # emulator config
├── index.html
├── vite.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── lib/
│   │   ├── firebase.ts           # Firebase app/auth/db init + emulator connection
│   │   └── i18n.ts               # react-i18next init
│   ├── locales/
│   │   ├── pt-br.json
│   │   └── en-us.json
│   ├── routes/
│   │   ├── router.tsx            # TanStack Router instance + route tree
│   │   ├── root-route.tsx        # auth gate
│   │   └── app-route.tsx         # main authenticated shell
│   ├── features/
│   │   ├── auth/
│   │   │   ├── useAuth.ts
│   │   │   └── LoginPage.tsx
│   │   ├── categories/
│   │   │   ├── schema.ts
│   │   │   ├── useCategories.ts
│   │   │   └── CategoryTabs.tsx
│   │   └── pantry-items/
│   │       ├── schema.ts
│   │       ├── usePantryItems.ts
│   │       ├── sortItems.ts
│   │       ├── store.ts          # Zustand UI-preferences store
│   │       ├── ItemList.tsx
│   │       ├── ItemListItem.tsx
│   │       ├── AddItemModal.tsx
│   │       ├── EditItemModal.tsx
│   │       └── firestoreWrites.ts
│   └── test/
│       ├── setup.ts               # RTL/jest-dom setup, i18n test init
│       └── emulator.ts            # clearFirestoreEmulator() helper
├── e2e/
│   └── core-loop.spec.ts
└── docs/superpowers/{specs,plans}/
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `biome.json`, `eslint.config.js`, `.gitignore`, `index.html`, `src/main.tsx`, `src/App.tsx`

**Interfaces:**
- Produces: a running Vite dev server and a passing `npm run build`, `npm run lint`, `npm run typecheck` — every later task assumes these commands exist and pass.

- [ ] **Step 1: Scaffold with Vite's React+TS template**

```bash
cd /home/gca/repos/expiring-products-v2
npm create vite@latest . -- --template react-ts
npm install
```

- [ ] **Step 2: Install core runtime dependencies**

```bash
npm install antd dayjs firebase zustand zod react-i18next i18next i18next-browser-languagedetector @tanstack/react-router
```

- [ ] **Step 3: Install dev/test dependencies**

```bash
npm install --save-dev @biomejs/biome eslint eslint-plugin-react-hooks eslint-plugin-react-refresh \
  vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom \
  msw @playwright/test firebase-tools
```

- [ ] **Step 4: Initialize Biome**

```bash
npx biome init
```

Edit the generated `biome.json` so `formatter.enabled` and `linter.enabled` are both `true`, and `files.includes` covers `src/**/*.{ts,tsx}`.

- [ ] **Step 5: Add a thin ESLint layer for React-specific rules Biome doesn't cover**

Create `eslint.config.js`:

```javascript
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": "warn",
    },
  },
];
```

- [ ] **Step 6: Add npm scripts**

In `package.json`, under `"scripts"`:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "typecheck": "tsc -b --noEmit",
  "lint": "biome check . && eslint .",
  "format": "biome format --write .",
  "test": "firebase emulators:exec --only auth,firestore \"vitest run\"",
  "test:watch": "vitest",
  "test:e2e": "playwright test"
}
```

- [ ] **Step 7: Verify the scaffold**

```bash
npm run build
npm run lint
```

Expected: both succeed with no errors (default Vite template content is fine as-is at this point).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React 19 + TypeScript + Biome/ESLint"
```

---

### Task 2: Firebase config, client init, and emulator wiring

**Files:**
- Create: `.env.example`, `firebase.json`, `src/lib/firebase.ts`, `src/test/emulator.ts`
- Modify: `.gitignore` (ensure `.env` is listed)

**Interfaces:**
- Produces: `app`, `auth`, `db` exports from `src/lib/firebase.ts`; `clearFirestoreEmulator(projectId: string): Promise<void>` from `src/test/emulator.ts`. Every later Firestore-touching task imports `auth`/`db` from here.

- [ ] **Step 1: Copy and rename the env file**

```bash
cd /home/gca/repos/expiring-products-v2
grep -E '^FIREBASE_' /home/gca/repos/expiring_products/.env | sed 's/^FIREBASE_/VITE_FIREBASE_/' > .env
echo 'VITE_USE_FIREBASE_EMULATORS=false' >> .env
```

Verify `.env` has 6 `VITE_FIREBASE_*` keys plus `VITE_USE_FIREBASE_EMULATORS`, then confirm `.env` is in `.gitignore` (add it if the Vite template didn't already).

- [ ] **Step 2: Write `.env.example` (committed, no real values)**

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_USE_FIREBASE_EMULATORS=false
```

- [ ] **Step 3: Write the Firebase client init module**

`src/lib/firebase.ts`:

```typescript
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
}
```

- [ ] **Step 4: Configure the emulator suite**

`firebase.json`:

```json
{
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": true, "port": 4000 }
  }
}
```

- [ ] **Step 5: Write the emulator-clearing test helper**

`src/test/emulator.ts`:

```typescript
export async function clearFirestoreEmulator(projectId: string): Promise<void> {
  const response = await fetch(
    `http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(`Failed to clear Firestore emulator: ${response.status}`);
  }
}
```

- [ ] **Step 6: Verify the emulator boots and the app connects**

```bash
VITE_USE_FIREBASE_EMULATORS=true npx firebase emulators:start --only auth,firestore &
sleep 3
curl -s http://127.0.0.1:8080 -o /dev/null -w "%{http_code}\n"
kill %1
```

Expected: HTTP status printed (200 or 404 both indicate the emulator is listening — the point is the connection succeeds, not the response body).

- [ ] **Step 7: Commit**

```bash
git add src/lib/firebase.ts src/test/emulator.ts firebase.json .env.example .gitignore
git commit -m "feat: wire Firebase client + emulator suite for tests"
```

---

### Task 3: Firestore boundary schemas (Category, Item)

**Files:**
- Create: `src/features/categories/schema.ts`, `src/features/categories/schema.test.ts`, `src/features/pantry-items/schema.ts`, `src/features/pantry-items/schema.test.ts`

**Interfaces:**
- Produces: `Category` type + `parseCategoryDoc(id: string, data: unknown): Category`; `PantryItem` type + `parseItemDoc(id: string, data: unknown): PantryItem` + `toItemDoc(item: Omit<PantryItem, "id">): object` (domain → Firestore direction, used by write tasks). Every later task reading or writing `categories`/`items` uses these, not raw `doc.data()`.

- [ ] **Step 1: Write failing tests for the category schema**

`src/features/categories/schema.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { parseCategoryDoc } from "./schema";

describe("parseCategoryDoc", () => {
  it("parses a valid category document", () => {
    const result = parseCategoryDoc("cat1", {
      key: "foods",
      name: "Foods",
      emoji: "🍎",
      order: 0,
    });
    expect(result).toEqual({ id: "cat1", key: "foods", name: "Foods", emoji: "🍎", order: 0 });
  });

  it("throws on a document missing required fields", () => {
    expect(() => parseCategoryDoc("cat1", { key: "foods" })).toThrow();
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
npx vitest run src/features/categories/schema.test.ts
```

Expected: FAIL — `./schema` has no exported member `parseCategoryDoc`.

- [ ] **Step 3: Implement the category schema**

`src/features/categories/schema.ts`:

```typescript
import { z } from "zod";

export const categoryDocSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  emoji: z.string().min(1),
  order: z.number().int().nonnegative(),
});

export interface Category {
  id: string;
  key: string;
  name: string;
  emoji: string;
  order: number;
}

export function parseCategoryDoc(id: string, data: unknown): Category {
  const parsed = categoryDocSchema.parse(data);
  return { id, ...parsed };
}
```

- [ ] **Step 4: Run it, verify it passes**

```bash
npx vitest run src/features/categories/schema.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Write failing tests for the item schema**

`src/features/pantry-items/schema.test.ts`:

```typescript
import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import { parseItemDoc, toItemDoc } from "./schema";

describe("parseItemDoc", () => {
  it("parses a valid item document, converting Timestamps to Dates", () => {
    const expiringDate = Timestamp.fromDate(new Date("2026-09-01T23:59:59Z"));
    const result = parseItemDoc("item1", {
      name: "Whole Milk",
      category: "foods",
      quantity: 2,
      expiring_date: expiringDate,
      duration: 7,
      date_opened: null,
      opened: false,
      recurring: true,
      barcode: null,
      source: "manual",
    });
    expect(result.expiringDate).toEqual(expiringDate.toDate());
    expect(result.name).toBe("Whole Milk");
    expect(result.source).toBe("manual");
  });

  it("defaults source to manual and barcode to null when absent", () => {
    const result = parseItemDoc("item1", {
      name: "Aspirin",
      category: "medicines",
      quantity: 1,
      expiring_date: Timestamp.fromDate(new Date("2027-01-01")),
      duration: null,
      date_opened: null,
      opened: false,
      recurring: false,
    });
    expect(result.source).toBe("manual");
    expect(result.barcode).toBeNull();
  });
});

describe("toItemDoc", () => {
  it("converts a domain item back to Firestore field shape", () => {
    const doc = toItemDoc({
      name: "Whole Milk",
      category: "foods",
      quantity: 2,
      expiringDate: new Date("2026-09-01T23:59:59Z"),
      duration: 7,
      dateOpened: null,
      opened: false,
      recurring: true,
      barcode: null,
      source: "manual",
    });
    expect(doc.expiring_date).toBeInstanceOf(Timestamp);
    expect(doc.name).toBe("Whole Milk");
  });
});
```

- [ ] **Step 6: Run it, verify it fails**

```bash
npx vitest run src/features/pantry-items/schema.test.ts
```

Expected: FAIL — `./schema` has no exported members.

- [ ] **Step 7: Implement the item schema**

`src/features/pantry-items/schema.ts`:

```typescript
import { Timestamp } from "firebase/firestore";
import { z } from "zod";

const timestampSchema = z.custom<Timestamp>((val) => val instanceof Timestamp, {
  message: "Expected a Firestore Timestamp",
});

export const itemDocSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  quantity: z.number().int().nonnegative(),
  expiring_date: timestampSchema,
  duration: z.number().int().positive().nullable(),
  date_opened: timestampSchema.nullable(),
  opened: z.boolean(),
  recurring: z.boolean(),
  barcode: z.string().nullable().optional(),
  source: z.enum(["manual", "barcode"]).optional(),
});

export interface PantryItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  expiringDate: Date;
  duration: number | null;
  dateOpened: Date | null;
  opened: boolean;
  recurring: boolean;
  barcode: string | null;
  source: "manual" | "barcode";
}

export function parseItemDoc(id: string, data: unknown): PantryItem {
  const parsed = itemDocSchema.parse(data);
  return {
    id,
    name: parsed.name,
    category: parsed.category,
    quantity: parsed.quantity,
    expiringDate: parsed.expiring_date.toDate(),
    duration: parsed.duration,
    dateOpened: parsed.date_opened ? parsed.date_opened.toDate() : null,
    opened: parsed.opened,
    recurring: parsed.recurring,
    barcode: parsed.barcode ?? null,
    source: parsed.source ?? "manual",
  };
}

export function toItemDoc(item: Omit<PantryItem, "id">) {
  return {
    name: item.name,
    category: item.category,
    quantity: item.quantity,
    expiring_date: Timestamp.fromDate(item.expiringDate),
    duration: item.duration,
    date_opened: item.dateOpened ? Timestamp.fromDate(item.dateOpened) : null,
    opened: item.opened,
    recurring: item.recurring,
    barcode: item.barcode,
    source: item.source,
  };
}
```

- [ ] **Step 8: Run it, verify it passes**

```bash
npx vitest run src/features/pantry-items/schema.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 9: Commit**

```bash
git add src/features/categories/schema.ts src/features/categories/schema.test.ts \
  src/features/pantry-items/schema.ts src/features/pantry-items/schema.test.ts
git commit -m "feat: add Zod schemas for Category and Item Firestore boundary parsing"
```

---

### Task 4: Auth (login/signup/logout) + route shell

**Files:**
- Create: `src/features/auth/useAuth.ts`, `src/features/auth/useAuth.test.tsx`, `src/features/auth/LoginPage.tsx`, `src/routes/router.tsx`, `src/routes/root-route.tsx`, `src/routes/app-route.tsx`
- Modify: `src/main.tsx`, `src/App.tsx`
- Test: `src/test/setup.ts`, `vitest.config.ts`

**Interfaces:**
- Consumes: `auth` from `src/lib/firebase.ts` (Task 2).
- Produces: `useAuth(): { user: User | null, loading: boolean, signIn, signUp, signOut }` from `src/features/auth/useAuth.ts`. Later tasks gate all Firestore hooks on `user` being non-null.

- [ ] **Step 1: Write `vitest.config.ts` and the RTL test setup**

`vitest.config.ts`:

```typescript
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
  },
});
```

`src/test/setup.ts`:

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 2: Write a failing test for `useAuth`**

`src/features/auth/useAuth.test.tsx`:

```typescript
import { act, renderHook, waitFor } from "@testing-library/react";
import { signOut as firebaseSignOut } from "firebase/auth";
import { afterEach, describe, expect, it } from "vitest";
import { auth } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { useAuth } from "./useAuth";

afterEach(async () => {
  await firebaseSignOut(auth);
  await clearFirestoreEmulator("demo-expiring-products");
});

describe("useAuth", () => {
  it("starts with no user and loading true, then loading false once resolved", async () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it("signUp then signIn resolves to a non-null user", async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.signUp("household@example.com", "correct-horse-battery");
    });
    expect(result.current.user?.email).toBe("household@example.com");

    await act(async () => {
      await result.current.signOut();
    });
    expect(result.current.user).toBeNull();

    await act(async () => {
      await result.current.signIn("household@example.com", "correct-horse-battery");
    });
    expect(result.current.user?.email).toBe("household@example.com");
  });
});
```

Note: this test requires `VITE_USE_FIREBASE_EMULATORS=true` and the emulator running, both handled by the `npm test` script from Task 1 (`firebase emulators:exec`) and `.env`. Set `VITE_USE_FIREBASE_EMULATORS=true` in `.env` now (Task 2's `.env` had it `false` as a safe default — flip it since all Firestore/Auth tests from here on need it).

- [ ] **Step 3: Run it, verify it fails**

```bash
npm test -- src/features/auth/useAuth.test.tsx
```

Expected: FAIL — `./useAuth` has no exported member `useAuth`.

- [ ] **Step 4: Implement `useAuth`**

`src/features/auth/useAuth.ts`:

```typescript
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { useEffect, useState } from "react";
import { auth } from "../../lib/firebase";

interface UseAuthResult {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuthResult {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  return {
    user,
    loading,
    signIn: async (email, password) => {
      await signInWithEmailAndPassword(auth, email, password);
    },
    signUp: async (email, password) => {
      await createUserWithEmailAndPassword(auth, email, password);
    },
    signOut: async () => {
      await firebaseSignOut(auth);
    },
  };
}
```

- [ ] **Step 5: Run it, verify it passes**

```bash
npm test -- src/features/auth/useAuth.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 6: Build the login page**

`src/features/auth/LoginPage.tsx`:

```tsx
import { Alert, Button, Card, Flex, Form, Input, Segmented } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "./useAuth";

interface LoginFormValues {
  email: string;
  password: string;
}

export function LoginPage() {
  const { t } = useTranslation();
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [error, setError] = useState<string | null>(null);

  const handleFinish = async (values: LoginFormValues) => {
    setError(null);
    try {
      if (mode === "signIn") {
        await signIn(values.email, values.password);
      } else {
        await signUp(values.email, values.password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Flex justify="center" align="center" style={{ minHeight: "100vh" }}>
      <Card style={{ width: 360 }} title={t("auth.title")}>
        <Segmented
          block
          value={mode}
          onChange={(value) => setMode(value as "signIn" | "signUp")}
          options={[
            { label: t("auth.signIn"), value: "signIn" },
            { label: t("auth.signUp"), value: "signUp" },
          ]}
          style={{ marginBottom: 16 }}
        />
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={handleFinish}>
          <Form.Item name="email" label={t("auth.email")} rules={[{ required: true, type: "email" }]}>
            <Input autoComplete="email" />
          </Form.Item>
          <Form.Item name="password" label={t("auth.password")} rules={[{ required: true, min: 6 }]}>
            <Input.Password autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            {mode === "signIn" ? t("auth.signIn") : t("auth.signUp")}
          </Button>
        </Form>
      </Card>
    </Flex>
  );
}
```

- [ ] **Step 7: Build the route shell**

`src/routes/root-route.tsx`:

```tsx
import type { ReactNode } from "react";
import { Spin } from "antd";
import { useAuth } from "../features/auth/useAuth";
import { LoginPage } from "../features/auth/LoginPage";

export function RootRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <Spin fullscreen />;
  }
  if (!user) {
    return <LoginPage />;
  }
  return <>{children}</>;
}
```

`src/routes/app-route.tsx` (placeholder shell filled in by Task 5's `CategoryTabs`):

```tsx
export function AppRoute() {
  return <div id="app-shell" />;
}
```

`src/App.tsx`:

```tsx
import { RootRoute } from "./routes/root-route";
import { AppRoute } from "./routes/app-route";

export function App() {
  return (
    <RootRoute>
      <AppRoute />
    </RootRoute>
  );
}
```

Note: `router.tsx` (TanStack Router instance) is deferred to Task 5, once there's a second real route (Settings) to route between — a single-route app doesn't need a router yet, and adding one now would be unused scaffolding (YAGNI).

- [ ] **Step 8: Verify manually**

```bash
npm run dev
```

Open the printed local URL, confirm the login/sign-up form renders and toggling the segmented control switches labels.

- [ ] **Step 9: Commit**

```bash
git add vitest.config.ts src/test/setup.ts src/features/auth src/routes src/App.tsx
git commit -m "feat: add Firebase auth hook, login page, and root route gate"
```

---

### Task 5: Categories (read + default creation) and tab shell

**Files:**
- Create: `src/features/categories/useCategories.ts`, `src/features/categories/useCategories.test.tsx`, `src/features/categories/CategoryTabs.tsx`, `src/routes/router.tsx`
- Modify: `src/routes/app-route.tsx`

**Interfaces:**
- Consumes: `db` (Task 2), `Category`/`parseCategoryDoc` (Task 3), `useAuth` (Task 4).
- Produces: `useCategories(uid: string): { categories: Category[], loading: boolean }` from `useCategories.ts`. Later item tasks read `categories` to know which tabs/keys exist.

- [ ] **Step 1: Write a failing test for `useCategories`**

`src/features/categories/useCategories.test.tsx`:

```typescript
import { renderHook, waitFor } from "@testing-library/react";
import { addDoc, collection } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { useCategories } from "./useCategories";

const uid = "test-user-1";

afterEach(() => clearFirestoreEmulator("demo-expiring-products"));

describe("useCategories", () => {
  it("creates default Foods and Medicines categories when none exist", async () => {
    const { result } = renderHook(() => useCategories(uid));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const keys = result.current.categories.map((c) => c.key).sort();
    expect(keys).toEqual(["foods", "medicines"]);
  });

  it("does not duplicate defaults when categories already exist", async () => {
    await addDoc(collection(db, "users", uid, "categories"), {
      key: "freezer",
      name: "Freezer",
      emoji: "🧊",
      order: 0,
    });
    const { result } = renderHook(() => useCategories(uid));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.categories).toHaveLength(1);
    expect(result.current.categories[0].key).toBe("freezer");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
npm test -- src/features/categories/useCategories.test.tsx
```

Expected: FAIL — no exported member `useCategories`.

- [ ] **Step 3: Implement `useCategories`**

`src/features/categories/useCategories.ts`:

```typescript
import { addDoc, collection, getDocs, onSnapshot, orderBy, query } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { type Category, parseCategoryDoc } from "./schema";

const DEFAULT_CATEGORIES = [
  { key: "foods", name: "Foods", emoji: "🍎", order: 0 },
  { key: "medicines", name: "Medicines", emoji: "💊", order: 1 },
];

async function ensureDefaultCategories(uid: string) {
  const categoriesRef = collection(db, "users", uid, "categories");
  const existing = await getDocs(categoriesRef);
  if (!existing.empty) return;
  await Promise.all(DEFAULT_CATEGORIES.map((category) => addDoc(categoriesRef, category)));
}

export function useCategories(uid: string): { categories: Category[]; loading: boolean } {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe = () => {};
    ensureDefaultCategories(uid).then(() => {
      const categoriesQuery = query(collection(db, "users", uid, "categories"), orderBy("order"));
      unsubscribe = onSnapshot(categoriesQuery, (snapshot) => {
        setCategories(snapshot.docs.map((d) => parseCategoryDoc(d.id, d.data())));
        setLoading(false);
      });
    });
    return () => unsubscribe();
  }, [uid]);

  return { categories, loading };
}
```

- [ ] **Step 4: Run it, verify it passes**

```bash
npm test -- src/features/categories/useCategories.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 5: Build `CategoryTabs`**

`src/features/categories/CategoryTabs.tsx`:

```tsx
import { Tabs } from "antd";
import type { ReactNode } from "react";
import type { Category } from "./schema";

interface CategoryTabsProps {
  categories: Category[];
  renderPane: (category: Category) => ReactNode;
  settingsPane: ReactNode;
}

export function CategoryTabs({ categories, renderPane, settingsPane }: CategoryTabsProps) {
  const items = [
    ...categories.map((category) => ({
      key: category.key,
      label: `${category.emoji} ${category.name}`,
      children: renderPane(category),
    })),
    { key: "settings", label: "⚙️", children: settingsPane },
  ];
  return <Tabs items={items} />;
}
```

- [ ] **Step 6: Wire it into the app route**

`src/routes/app-route.tsx`:

```tsx
import { useCategories } from "../features/categories/useCategories";
import { CategoryTabs } from "../features/categories/CategoryTabs";
import { useAuth } from "../features/auth/useAuth";
import { ItemList } from "../features/pantry-items/ItemList";

export function AppRoute() {
  const { user } = useAuth();
  const { categories, loading } = useCategories(user?.uid ?? "");

  if (!user || loading) return null;

  return (
    <CategoryTabs
      categories={categories}
      renderPane={(category) => <ItemList uid={user.uid} category={category} />}
      settingsPane={<div>Settings — Phase 4</div>}
    />
  );
}
```

This references `ItemList`, built in Task 6 — expected to not compile until then; this task's own test coverage is `useCategories.test.tsx`, already green.

- [ ] **Step 7: Commit**

```bash
git add src/features/categories/useCategories.ts src/features/categories/useCategories.test.tsx \
  src/features/categories/CategoryTabs.tsx src/routes/app-route.tsx
git commit -m "feat: add categories hook with default-category creation and tab shell"
```

---

### Task 6: Item list — read, sort, visual warnings

**Files:**
- Create: `src/features/pantry-items/usePantryItems.ts`, `src/features/pantry-items/usePantryItems.test.tsx`, `src/features/pantry-items/sortItems.ts`, `src/features/pantry-items/sortItems.test.ts`, `src/features/pantry-items/ItemList.tsx`, `src/features/pantry-items/ItemListItem.tsx`

**Interfaces:**
- Consumes: `db` (Task 2), `PantryItem`/`parseItemDoc` (Task 3), `Category` (Task 3).
- Produces: `usePantryItems(uid: string, categoryKey: string): { items: PantryItem[], loading: boolean }`; `sortItems(items: PantryItem[]): PantryItem[]`; `getExpiryWarningColor(item: PantryItem, now: Date): "red" | "yellow" | "white"`. Later tasks (Add/Edit) write to the same `items` collection this hook reads.

- [ ] **Step 1: Write failing tests for `sortItems` and the warning-color function**

`src/features/pantry-items/sortItems.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { getExpiryWarningColor, sortItems } from "./sortItems";
import type { PantryItem } from "./schema";

function makeItem(overrides: Partial<PantryItem>): PantryItem {
  return {
    id: "1",
    name: "Item",
    category: "foods",
    quantity: 1,
    expiringDate: new Date("2026-12-31"),
    duration: null,
    dateOpened: null,
    opened: false,
    recurring: false,
    barcode: null,
    source: "manual",
    ...overrides,
  };
}

describe("sortItems", () => {
  it("sorts by expiring date ascending, then opened-first, then quantity descending", () => {
    const soonUnopened = makeItem({ id: "a", expiringDate: new Date("2026-09-01"), quantity: 1 });
    const soonOpened = makeItem({
      id: "b",
      expiringDate: new Date("2026-09-01"),
      opened: true,
      quantity: 1,
    });
    const later = makeItem({ id: "c", expiringDate: new Date("2026-10-01"), quantity: 5 });
    const result = sortItems([later, soonUnopened, soonOpened]);
    expect(result.map((i) => i.id)).toEqual(["b", "a", "c"]);
  });
});

describe("getExpiryWarningColor", () => {
  const now = new Date("2026-08-17T12:00:00Z");

  it("returns red for already-expired items", () => {
    const item = makeItem({ expiringDate: new Date("2026-08-01") });
    expect(getExpiryWarningColor(item, now)).toBe("red");
  });

  it("returns yellow for items expiring within 3 days", () => {
    const item = makeItem({ expiringDate: new Date("2026-08-19") });
    expect(getExpiryWarningColor(item, now)).toBe("yellow");
  });

  it("returns white for items expiring beyond 3 days", () => {
    const item = makeItem({ expiringDate: new Date("2026-09-01") });
    expect(getExpiryWarningColor(item, now)).toBe("white");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
npx vitest run src/features/pantry-items/sortItems.test.ts
```

Expected: FAIL — module `./sortItems` doesn't exist.

- [ ] **Step 3: Implement `sortItems` and `getExpiryWarningColor`**

`src/features/pantry-items/sortItems.ts`:

```typescript
import type { PantryItem } from "./schema";

export function sortItems(items: PantryItem[]): PantryItem[] {
  return [...items].sort((a, b) => {
    const dateDiff = a.expiringDate.getTime() - b.expiringDate.getTime();
    if (dateDiff !== 0) return dateDiff;
    if (a.opened !== b.opened) return a.opened ? -1 : 1;
    return b.quantity - a.quantity;
  });
}

const YELLOW_THRESHOLD_DAYS = 3;

export function getExpiryWarningColor(item: PantryItem, now: Date): "red" | "yellow" | "white" {
  const daysUntilExpiry = (item.expiringDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (daysUntilExpiry < 0) return "red";
  if (daysUntilExpiry <= YELLOW_THRESHOLD_DAYS) return "yellow";
  return "white";
}
```

- [ ] **Step 4: Run it, verify it passes**

```bash
npx vitest run src/features/pantry-items/sortItems.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: Write a failing test for `usePantryItems`**

`src/features/pantry-items/usePantryItems.test.tsx`:

```typescript
import { renderHook, waitFor } from "@testing-library/react";
import { addDoc, collection, Timestamp } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { usePantryItems } from "./usePantryItems";

const uid = "test-user-2";

afterEach(() => clearFirestoreEmulator("demo-expiring-products"));

describe("usePantryItems", () => {
  it("only returns items for the requested category", async () => {
    const itemsRef = collection(db, "users", uid, "items");
    await addDoc(itemsRef, {
      name: "Milk",
      category: "foods",
      quantity: 1,
      expiring_date: Timestamp.fromDate(new Date("2026-09-01")),
      duration: 7,
      date_opened: null,
      opened: false,
      recurring: false,
      barcode: null,
      source: "manual",
    });
    await addDoc(itemsRef, {
      name: "Aspirin",
      category: "medicines",
      quantity: 1,
      expiring_date: Timestamp.fromDate(new Date("2027-01-01")),
      duration: null,
      date_opened: null,
      opened: false,
      recurring: false,
      barcode: null,
      source: "manual",
    });

    const { result } = renderHook(() => usePantryItems(uid, "foods"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].name).toBe("Milk");
  });
});
```

- [ ] **Step 6: Run it, verify it fails**

```bash
npm test -- src/features/pantry-items/usePantryItems.test.tsx
```

Expected: FAIL — no exported member `usePantryItems`.

- [ ] **Step 7: Implement `usePantryItems`**

`src/features/pantry-items/usePantryItems.ts`:

```typescript
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { parseItemDoc, type PantryItem } from "./schema";

export function usePantryItems(
  uid: string,
  categoryKey: string,
): { items: PantryItem[]; loading: boolean } {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const itemsQuery = query(
      collection(db, "users", uid, "items"),
      where("category", "==", categoryKey),
    );
    const unsubscribe = onSnapshot(itemsQuery, (snapshot) => {
      setItems(snapshot.docs.map((d) => parseItemDoc(d.id, d.data())));
      setLoading(false);
    });
    return unsubscribe;
  }, [uid, categoryKey]);

  return { items, loading };
}
```

- [ ] **Step 8: Run it, verify it passes**

```bash
npm test -- src/features/pantry-items/usePantryItems.test.tsx
```

Expected: PASS (1 test).

- [ ] **Step 9: Build `ItemListItem` and `ItemList`**

`src/features/pantry-items/ItemListItem.tsx`:

```tsx
import { List, Tag, Typography } from "antd";
import { useTranslation } from "react-i18next";
import { getExpiryWarningColor } from "./sortItems";
import type { PantryItem } from "./schema";

const COLOR_STYLES: Record<"red" | "yellow" | "white", { background: string }> = {
  red: { background: "#fff1f0" },
  yellow: { background: "#fffbe6" },
  white: { background: "transparent" },
};

export function ItemListItem({ item, onClick }: { item: PantryItem; onClick: () => void }) {
  const { t } = useTranslation();
  const color = getExpiryWarningColor(item, new Date());

  return (
    <List.Item onClick={onClick} style={{ cursor: "pointer", ...COLOR_STYLES[color] }}>
      <List.Item.Meta
        title={<Typography.Text strong>{item.name}</Typography.Text>}
        description={t("items.expiresOn", { date: item.expiringDate.toLocaleDateString() })}
      />
      <Tag color="blue">{item.quantity}</Tag>
    </List.Item>
  );
}
```

`src/features/pantry-items/ItemList.tsx`:

```tsx
import { Empty, FloatButton, List } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Category } from "../categories/schema";
import { AddItemModal } from "./AddItemModal";
import { EditItemModal } from "./EditItemModal";
import { sortItems } from "./sortItems";
import { ItemListItem } from "./ItemListItem";
import { usePantryItems } from "./usePantryItems";
import type { PantryItem } from "./schema";

export function ItemList({ uid, category }: { uid: string; category: Category }) {
  const { t } = useTranslation();
  const { items, loading } = usePantryItems(uid, category.key);
  const [addOpen, setAddOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);

  if (loading) return null;

  const sorted = sortItems(items);

  return (
    <>
      {sorted.length === 0 ? (
        <Empty description={t("items.empty")} />
      ) : (
        <List
          dataSource={sorted}
          renderItem={(item) => (
            <ItemListItem key={item.id} item={item} onClick={() => setEditingItem(item)} />
          )}
        />
      )}
      <FloatButton icon={<PlusOutlined />} onClick={() => setAddOpen(true)} />
      <AddItemModal
        uid={uid}
        category={category}
        open={addOpen}
        onClose={() => setAddOpen(false)}
      />
      {editingItem && (
        <EditItemModal uid={uid} item={editingItem} onClose={() => setEditingItem(null)} />
      )}
    </>
  );
}
```

This references `AddItemModal` (Task 8) and `EditItemModal` (Task 9) — not yet built, expected to not compile until those land. This task's tests (`sortItems.test.ts`, `usePantryItems.test.tsx`) are already green and don't depend on those components.

- [ ] **Step 10: Commit**

```bash
git add src/features/pantry-items/usePantryItems.ts src/features/pantry-items/usePantryItems.test.tsx \
  src/features/pantry-items/sortItems.ts src/features/pantry-items/sortItems.test.ts \
  src/features/pantry-items/ItemList.tsx src/features/pantry-items/ItemListItem.tsx
git commit -m "feat: add pantry items read hook, sorting, visual warnings, and list UI"
```

---

### Task 7: Zustand UI-preferences store

**Files:**
- Create: `src/features/pantry-items/store.ts`, `src/features/pantry-items/store.test.ts`
- Modify: `src/features/pantry-items/ItemList.tsx` (wire in sort direction + filter)

**Interfaces:**
- Produces: `useUiPreferencesStore` (Zustand store) with per-category `sortDirection: "asc" | "desc"` and `filter: "all" | "opened" | "unopened"`, plus `setSortDirection(categoryKey, direction)` / `setFilter(categoryKey, filter)`.

- [ ] **Step 1: Write a failing test for the store**

`src/features/pantry-items/store.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { useUiPreferencesStore } from "./store";

describe("useUiPreferencesStore", () => {
  it("defaults to ascending sort and all filter for an unseen category", () => {
    const state = useUiPreferencesStore.getState();
    expect(state.getSortDirection("foods")).toBe("asc");
    expect(state.getFilter("foods")).toBe("all");
  });

  it("stores sort direction and filter per category independently", () => {
    const { setSortDirection, setFilter, getSortDirection, getFilter } =
      useUiPreferencesStore.getState();
    setSortDirection("foods", "desc");
    setFilter("medicines", "opened");
    expect(getSortDirection("foods")).toBe("desc");
    expect(getSortDirection("medicines")).toBe("asc");
    expect(getFilter("medicines")).toBe("opened");
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
npx vitest run src/features/pantry-items/store.test.ts
```

Expected: FAIL — module `./store` doesn't exist.

- [ ] **Step 3: Implement the store**

`src/features/pantry-items/store.ts`:

```typescript
import { create } from "zustand";

type SortDirection = "asc" | "desc";
type Filter = "all" | "opened" | "unopened";

interface UiPreferencesState {
  sortDirectionByCategory: Record<string, SortDirection>;
  filterByCategory: Record<string, Filter>;
  getSortDirection: (categoryKey: string) => SortDirection;
  getFilter: (categoryKey: string) => Filter;
  setSortDirection: (categoryKey: string, direction: SortDirection) => void;
  setFilter: (categoryKey: string, filter: Filter) => void;
}

export const useUiPreferencesStore = create<UiPreferencesState>((set, get) => ({
  sortDirectionByCategory: {},
  filterByCategory: {},
  getSortDirection: (categoryKey) => get().sortDirectionByCategory[categoryKey] ?? "asc",
  getFilter: (categoryKey) => get().filterByCategory[categoryKey] ?? "all",
  setSortDirection: (categoryKey, direction) =>
    set((state) => ({
      sortDirectionByCategory: { ...state.sortDirectionByCategory, [categoryKey]: direction },
    })),
  setFilter: (categoryKey, filter) =>
    set((state) => ({ filterByCategory: { ...state.filterByCategory, [categoryKey]: filter } })),
}));
```

- [ ] **Step 4: Run it, verify it passes**

```bash
npx vitest run src/features/pantry-items/store.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Apply filter + direction in `ItemList`**

In `src/features/pantry-items/ItemList.tsx`, replace `const sorted = sortItems(items);` with:

```tsx
  const { getSortDirection, getFilter } = useUiPreferencesStore();
  const direction = getSortDirection(category.key);
  const filter = getFilter(category.key);

  const filtered = items.filter((item) => {
    if (filter === "opened") return item.opened;
    if (filter === "unopened") return !item.opened;
    return true;
  });
  const sorted = sortItems(filtered);
  if (direction === "desc") sorted.reverse();
```

Add the import: `import { useUiPreferencesStore } from "./store";`.

- [ ] **Step 6: Commit**

```bash
git add src/features/pantry-items/store.ts src/features/pantry-items/store.test.ts \
  src/features/pantry-items/ItemList.tsx
git commit -m "feat: add Zustand UI-preferences store for per-category sort/filter"
```

---

### Task 8: Add Item

**Files:**
- Create: `src/features/pantry-items/firestoreWrites.ts`, `src/features/pantry-items/firestoreWrites.test.ts`, `src/features/pantry-items/AddItemModal.tsx`

**Interfaces:**
- Consumes: `db` (Task 2), `toItemDoc` (Task 3).
- Produces: `addItem(uid: string, item: Omit<PantryItem, "id">): Promise<void>` — writes to `items` and upserts `item_history`. Task 9's edit/consume/discard flow adds to the same file.

- [ ] **Step 1: Write a failing test for `addItem`**

`src/features/pantry-items/firestoreWrites.test.ts`:

```typescript
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { addItem } from "./firestoreWrites";

const uid = "test-user-3";

afterEach(() => clearFirestoreEmulator("demo-expiring-products"));

describe("addItem", () => {
  it("writes the item and upserts item_history with the same name/category/duration", async () => {
    await addItem(uid, {
      name: "Whole Milk",
      category: "foods",
      quantity: 2,
      expiringDate: new Date("2026-09-01"),
      duration: 7,
      dateOpened: null,
      opened: false,
      recurring: true,
      barcode: null,
      source: "manual",
    });

    const itemsSnapshot = await getDocs(collection(db, "users", uid, "items"));
    expect(itemsSnapshot.size).toBe(1);
    expect(itemsSnapshot.docs[0].data().name).toBe("Whole Milk");

    const historyDoc = await getDoc(doc(db, "users", uid, "item_history", "foods_Whole Milk"));
    expect(historyDoc.exists()).toBe(true);
    expect(historyDoc.data()?.duration).toBe("7");
    expect(historyDoc.data()?.recurring).toBe(true);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
npm test -- src/features/pantry-items/firestoreWrites.test.ts
```

Expected: FAIL — module `./firestoreWrites` doesn't exist.

- [ ] **Step 3: Implement `addItem`**

`src/features/pantry-items/firestoreWrites.ts`:

```typescript
import { addDoc, collection, doc, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { toItemDoc, type PantryItem } from "./schema";

export async function addItem(uid: string, item: Omit<PantryItem, "id">): Promise<void> {
  await addDoc(collection(db, "users", uid, "items"), toItemDoc(item));

  const historyId = `${item.category}_${item.name}`;
  await setDoc(doc(db, "users", uid, "item_history", historyId), {
    name: item.name,
    category: item.category,
    duration: item.duration !== null ? String(item.duration) : "",
    recurring: item.recurring,
  });
}
```

- [ ] **Step 4: Run it, verify it passes**

```bash
npm test -- src/features/pantry-items/firestoreWrites.test.ts
```

Expected: PASS (1 test).

- [ ] **Step 5: Build `AddItemModal`**

`src/features/pantry-items/AddItemModal.tsx`:

```tsx
import { DatePicker, Form, Input, InputNumber, Modal, Switch } from "antd";
import type { Dayjs } from "dayjs";
import { useTranslation } from "react-i18next";
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
}: {
  uid: string;
  category: Category;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm<AddItemFormValues>();

  const handleOk = async () => {
    const values = await form.validateFields();
    await addItem(uid, {
      name: values.name.trim(),
      category: category.key,
      quantity: values.quantity,
      expiringDate: values.expiringDate.toDate(),
      duration: values.duration ?? null,
      dateOpened: null,
      opened: false,
      recurring: values.recurring,
      barcode: null,
      source: "manual",
    });
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      title={t("items.addTitle")}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={{ quantity: 1, recurring: false }}>
        <Form.Item name="name" label={t("items.name")} rules={[{ required: true }]}>
          <Input />
        </Form.Item>
        <Form.Item name="quantity" label={t("items.quantity")} rules={[{ required: true }]}>
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
        <Form.Item name="recurring" label={t("items.recurring")} valuePropName="checked">
          <Switch />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/features/pantry-items/firestoreWrites.ts src/features/pantry-items/firestoreWrites.test.ts \
  src/features/pantry-items/AddItemModal.tsx
git commit -m "feat: add item creation with item_history upsert and Add Item modal"
```

---

### Task 9: Edit / Consume / Discard

**Files:**
- Modify: `src/features/pantry-items/firestoreWrites.ts`
- Create: `src/features/pantry-items/firestoreWrites.consume.test.ts`, `src/features/pantry-items/EditItemModal.tsx`

**Interfaces:**
- Consumes: `db`, `toItemDoc`/`parseItemDoc` (Task 3).
- Produces: `updateItemQuantities(uid: string, itemId: string, changes: { opened: number; consumed: number; discarded: number }): Promise<void>`.

Matches v1's documented behavior (`USER_GUIDE.md`): opening splits off a new item with a recalculated expiry date when `duration` is set; consuming/discarding reduce quantity and remove the item at zero; combining is allowed as long as the total doesn't exceed current quantity.

- [ ] **Step 1: Write a failing test for the split-on-open case**

`src/features/pantry-items/firestoreWrites.consume.test.ts`:

```typescript
import { addDoc, collection, getDocs, Timestamp } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { updateItemQuantities } from "./firestoreWrites";

const uid = "test-user-4";

afterEach(() => clearFirestoreEmulator("demo-expiring-products"));

describe("updateItemQuantities", () => {
  it("splits off an opened item with a duration-based expiry when quantity > 1 and duration is set", async () => {
    const itemsRef = collection(db, "users", uid, "items");
    const original = await addDoc(itemsRef, {
      name: "Milk",
      category: "foods",
      quantity: 3,
      expiring_date: Timestamp.fromDate(new Date("2026-12-01")),
      duration: 7,
      date_opened: null,
      opened: false,
      recurring: false,
      barcode: null,
      source: "manual",
    });

    await updateItemQuantities(uid, original.id, { opened: 1, consumed: 0, discarded: 0 });

    const snapshot = await getDocs(itemsRef);
    expect(snapshot.size).toBe(2);
    const originalAfter = snapshot.docs.find((d) => d.id === original.id);
    const openedItem = snapshot.docs.find((d) => d.id !== original.id);
    expect(originalAfter?.data().quantity).toBe(2);
    expect(openedItem?.data().quantity).toBe(1);
    expect(openedItem?.data().opened).toBe(true);
  });

  it("removes the item when consumed quantity equals current quantity", async () => {
    const itemsRef = collection(db, "users", uid, "items");
    const original = await addDoc(itemsRef, {
      name: "Aspirin",
      category: "medicines",
      quantity: 1,
      expiring_date: Timestamp.fromDate(new Date("2027-01-01")),
      duration: null,
      date_opened: null,
      opened: false,
      recurring: false,
      barcode: null,
      source: "manual",
    });

    await updateItemQuantities(uid, original.id, { opened: 0, consumed: 1, discarded: 0 });

    const snapshot = await getDocs(itemsRef);
    expect(snapshot.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

```bash
npm test -- src/features/pantry-items/firestoreWrites.consume.test.ts
```

Expected: FAIL — no exported member `updateItemQuantities`.

- [ ] **Step 3: Implement `updateItemQuantities`**

Append to `src/features/pantry-items/firestoreWrites.ts`:

```typescript
import { deleteDoc, doc as docRef, getDoc, runTransaction } from "firebase/firestore";
import { parseItemDoc } from "./schema";

interface QuantityChanges {
  opened: number;
  consumed: number;
  discarded: number;
}

export async function updateItemQuantities(
  uid: string,
  itemId: string,
  changes: QuantityChanges,
): Promise<void> {
  const itemRef = docRef(db, "users", uid, "items", itemId);

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(itemRef);
    if (!snapshot.exists()) throw new Error(`Item ${itemId} not found`);
    const item = parseItemDoc(snapshot.id, snapshot.data());

    const totalHandled = changes.opened + changes.consumed + changes.discarded;
    if (totalHandled > item.quantity) {
      throw new Error("Total opened + consumed + discarded exceeds current quantity");
    }

    const remaining = item.quantity - totalHandled;
    if (remaining > 0) {
      transaction.update(itemRef, { quantity: remaining });
    } else {
      transaction.delete(itemRef);
    }

    if (changes.opened > 0) {
      const now = new Date();
      const alreadyExpired = item.expiringDate.getTime() < now.getTime();
      const newExpiringDate =
        item.duration !== null && !alreadyExpired
          ? new Date(now.getTime() + item.duration * 24 * 60 * 60 * 1000)
          : item.expiringDate;

      const openedItemDocRef = docRef(collection(db, "users", uid, "items"));
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
  });
}
```

Add `collection` to the existing `firebase/firestore` import at the top of the file (already imported for `addItem`).

- [ ] **Step 4: Run it, verify it passes**

```bash
npm test -- src/features/pantry-items/firestoreWrites.consume.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 5: Build `EditItemModal`**

`src/features/pantry-items/EditItemModal.tsx`:

```tsx
import { Form, InputNumber, Modal } from "antd";
import { useTranslation } from "react-i18next";
import { updateItemQuantities } from "./firestoreWrites";
import type { PantryItem } from "./schema";

interface EditFormValues {
  opened: number;
  consumed: number;
  discarded: number;
}

export function EditItemModal({
  uid,
  item,
  onClose,
}: {
  uid: string;
  item: PantryItem;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [form] = Form.useForm<EditFormValues>();

  const handleOk = async () => {
    const values = await form.validateFields();
    await updateItemQuantities(uid, item.id, values);
    onClose();
  };

  return (
    <Modal title={item.name} open onOk={handleOk} onCancel={onClose} destroyOnHidden>
      <Form
        form={form}
        layout="vertical"
        initialValues={{ opened: 0, consumed: 0, discarded: 0 }}
      >
        <Form.Item name="opened" label={t("items.openedItems")}>
          <InputNumber min={0} max={item.quantity} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="consumed" label={t("items.consumedItems")}>
          <InputNumber min={0} max={item.quantity} style={{ width: "100%" }} />
        </Form.Item>
        <Form.Item name="discarded" label={t("items.discardedItems")}>
          <InputNumber min={0} max={item.quantity} style={{ width: "100%" }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add src/features/pantry-items/firestoreWrites.ts src/features/pantry-items/firestoreWrites.consume.test.ts \
  src/features/pantry-items/EditItemModal.tsx
git commit -m "feat: add open/consume/discard transaction logic and Edit Item modal"
```

---

### Task 10: i18n scaffold

**Files:**
- Create: `src/locales/pt-br.json`, `src/locales/en-us.json`, `src/lib/i18n.ts`, `src/lib/i18n.test.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Produces: `i18n` instance (default export) from `src/lib/i18n.ts`, imported once in `main.tsx`. All components in prior tasks already call `useTranslation()` — this task makes those calls resolve to real strings instead of raw keys.

- [ ] **Step 1: Write the locale resource files**

`src/locales/pt-br.json`:

```json
{
  "auth": { "title": "Expiring Products", "signIn": "Entrar", "signUp": "Cadastrar", "email": "E-mail", "password": "Senha" },
  "items": {
    "empty": "Nenhum item aqui.",
    "addTitle": "Adicionar item",
    "name": "Nome",
    "quantity": "Quantidade",
    "expiringDate": "Data de validade",
    "duration": "Duração após aberto (dias)",
    "recurring": "Compra recorrente",
    "expiresOn": "vence em {{date}}",
    "openedItems": "Itens abertos",
    "consumedItems": "Itens consumidos",
    "discardedItems": "Itens descartados"
  }
}
```

`src/locales/en-us.json`:

```json
{
  "auth": { "title": "Expiring Products", "signIn": "Sign In", "signUp": "Sign Up", "email": "Email", "password": "Password" },
  "items": {
    "empty": "No items here.",
    "addTitle": "Add Item",
    "name": "Name",
    "quantity": "Quantity",
    "expiringDate": "Expiring Date",
    "duration": "Duration after opened (days)",
    "recurring": "Recurring purchase",
    "expiresOn": "expires on {{date}}",
    "openedItems": "Opened items",
    "consumedItems": "Consumed items",
    "discardedItems": "Discarded items"
  }
}
```

- [ ] **Step 2: Write a failing test asserting pt-br is the fallback**

`src/lib/i18n.test.tsx`:

```typescript
import { describe, expect, it } from "vitest";
import i18n from "./i18n";

describe("i18n", () => {
  it("falls back to pt-br and resolves a known key", async () => {
    await i18n.changeLanguage("xx-not-a-real-locale");
    expect(i18n.t("items.empty")).toBe("Nenhum item aqui.");
  });

  it("resolves the same key in en-us when selected", async () => {
    await i18n.changeLanguage("en-us");
    expect(i18n.t("items.empty")).toBe("No items here.");
  });
});
```

- [ ] **Step 3: Run it, verify it fails**

```bash
npx vitest run src/lib/i18n.test.tsx
```

Expected: FAIL — module `./i18n` doesn't exist.

- [ ] **Step 4: Implement the i18n instance**

`src/lib/i18n.ts`:

```typescript
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import enUs from "../locales/en-us.json";
import ptBr from "../locales/pt-br.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      "pt-br": { translation: ptBr },
      "en-us": { translation: enUs },
    },
    fallbackLng: "pt-br",
    interpolation: { escapeValue: false },
  });

export default i18n;
```

- [ ] **Step 5: Run it, verify it passes**

```bash
npx vitest run src/lib/i18n.test.tsx
```

Expected: PASS (2 tests).

- [ ] **Step 6: Wire it into the app entry point**

`src/main.tsx`:

```tsx
import "./lib/i18n";
import { ConfigProvider } from "antd";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConfigProvider>
      <App />
    </ConfigProvider>
  </StrictMode>,
);
```

- [ ] **Step 7: Commit**

```bash
git add src/locales src/lib/i18n.ts src/lib/i18n.test.tsx src/main.tsx
git commit -m "feat: add react-i18next scaffold with pt-br/en-us resources"
```

---

### Task 11: End-to-end smoke test, project docs

**Files:**
- Create: `playwright.config.ts`, `e2e/core-loop.spec.ts`

**Interfaces:**
- Consumes: the full app built in Tasks 1–10.
- Produces: a passing e2e run proving the vertical slice actually works end to end in a browser, not just in unit/hook tests.

- [ ] **Step 1: Write `playwright.config.ts`**

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
  },
  use: { baseURL: "http://localhost:5173" },
});
```

- [ ] **Step 2: Write the e2e test**

`e2e/core-loop.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";

test("sign up, add an item, see it sorted and colored correctly", async ({ page }) => {
  await page.goto("/");

  await page.getByText("Cadastrar").click();
  await page.getByLabel("E-mail").fill(`e2e-${Date.now()}@example.com`);
  await page.getByLabel("Senha").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Cadastrar" }).click();

  await page.getByRole("tab", { name: /Foods/ }).click();
  await page.getByRole("button").filter({ hasText: "" }).last().click(); // FloatButton add

  await page.getByLabel("Nome").fill("Whole Milk");
  await page.getByLabel("Quantidade").fill("2");
  await page.getByLabel("Data de validade").click();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "OK" }).click();

  await expect(page.getByText("Whole Milk")).toBeVisible();
});
```

Note: this test runs against the real Firebase project's Auth/Firestore in emulator mode is not applicable here (Playwright drives the built dev server, which reads `.env` as configured in Task 2). Before running in CI, point `VITE_USE_FIREBASE_EMULATORS=true` and start the emulator suite alongside `npm run dev`, exactly as the `npm test` unit tests do — wire this into a `test:e2e` CI step during Phase 7 (Cutover), not required to pass against production data during this task.

- [ ] **Step 3: Run it against the emulator locally**

```bash
npx firebase emulators:exec --only auth,firestore "VITE_USE_FIREBASE_EMULATORS=true npm run test:e2e"
```

Expected: PASS (1 test).

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts e2e/core-loop.spec.ts
git commit -m "test: add e2e smoke test for signup, add item, and sorted display"
```

- [ ] **Step 5: Generate project docs with the `init` skill**

Invoke the `init` skill against this repository now that a real, working codebase exists to document (mirroring v1's `AGENTS.md`/`ARCHITECTURE.md`/`DEVELOPMENT.md`, which were genuinely useful reference material during this project's design phase). This is a manual step for whoever executes this plan — run `/init` (or invoke the `init` skill) in this repo after Step 4's commit, review the generated docs, and commit them separately.

---

## Self-Review Notes

- **Spec coverage:** core CRUD loop ✓ (Tasks 5–9), sorting/visual warnings ✓ (Task 6), i18n scaffold ✓ (Task 10), testing setup ✓ (Tasks 1, 2, throughout). Shopping mode, backup/export, settings doc, PWA shell, barcode scanning, and push notifications are explicitly out of scope for this phase — they're Phases 2–6 per the phase breakdown agreed with the user, not gaps in this plan.
- **Type consistency:** `PantryItem`/`Category` defined once in `schema.ts` files (Task 3) and reused verbatim by every later task — no redefinition. `addItem`/`updateItemQuantities` signatures introduced in Tasks 8–9 are the exact signatures `AddItemModal`/`EditItemModal` call.
- **Placeholder scan:** no TBD/TODO markers; the one deliberately deferred item (wiring `test:e2e` into CI with emulators) is called out explicitly as Phase 7 scope, not left vague.
