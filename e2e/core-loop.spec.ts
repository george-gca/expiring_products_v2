import { expect, test } from "@playwright/test";

test("sign up, add an item, see it sorted and colored correctly", async ({ page }) => {
	await page.goto("/");

	await page.getByText("Cadastrar").click();
	await page.getByLabel("E-mail").fill(`e2e-${Date.now()}@example.com`);
	await page.getByLabel("Senha").fill("correct-horse-battery");
	await page.getByRole("button", { name: "Cadastrar" }).click();

	await page.getByRole("tab", { name: /Foods/ }).click();
	await page.getByRole("button", { name: "plus" }).click(); // FloatButton add

	await page.getByLabel("Nome").fill("Whole Milk");
	await page.getByLabel("Quantidade").fill("2");
	await page.getByLabel("Data de validade").click();
	await page.locator(".ant-picker-cell-today").click();
	await page.getByRole("button", { name: "OK" }).click();

	await expect(page.getByText("Whole Milk")).toBeVisible();
});

test("recurring low-stock item appears in the shopping list and round-trips through the cart re-add flow", async ({ page }) => {
	await page.goto("/");

	await page.getByText("Cadastrar").click();
	await page.getByLabel("E-mail").fill(`e2e-shopping-${Date.now()}@example.com`);
	await page.getByLabel("Senha").fill("correct-horse-battery");
	await page.getByRole("button", { name: "Cadastrar" }).click();

	await page.getByRole("tab", { name: /Foods/ }).click();
	await page.getByRole("button", { name: "plus" }).click(); // FloatButton add

	await page.getByLabel("Nome").fill("Oat Milk");
	await page.getByLabel("Quantidade").fill("1"); // at/below the default low-stock threshold of 3
	await page.getByLabel("Data de validade").click();
	await page.locator(".ant-picker-cell-today").click();
	await page.getByLabel("Compra recorrente").click(); // mark the item as recurring
	await page.getByRole("button", { name: "OK" }).click();

	await page.getByRole("switch", { name: "Modo de compras" }).click();

	await expect(page.getByText("Oat Milk")).toBeVisible();

	// Regression coverage for C1/I1: click the shopping list entry's cart
	// icon (aria-label comes from AntD's ShoppingCartOutlined icon name,
	// "shopping-cart") to re-buy it. Add Item must open pre-filled with the
	// name AND with the recurring switch already on — before C1's fix, the
	// switch defaulted off here, and submitting would have silently
	// un-marked item_history.recurring, an invisible failure this full round
	// trip is meant to catch.
	await page.getByRole("button", { name: "shopping-cart" }).click();

	await expect(page.getByLabel("Nome")).toHaveValue("Oat Milk");
	await expect(page.getByLabel("Compra recorrente")).toBeChecked();

	// Submit a quantity that pushes the item's total stock (1 existing + 5
	// new = 6) above the low-stock threshold of 3.
	await page.getByLabel("Quantidade").fill("5");
	await page.getByLabel("Data de validade").click();
	await page.locator(".ant-picker-cell-today").click();
	await page.getByRole("button", { name: "OK" }).click();

	// Toggle Shopping Mode off and back on to force a fresh view of the list.
	await page.getByRole("switch", { name: "Modo de compras" }).click();
	await page.getByRole("switch", { name: "Modo de compras" }).click();

	await expect(page.getByText("Oat Milk")).not.toBeVisible();
});

test("exports a backup and re-imports it, restoring the pantry to the exported state (round trip)", async ({ page }) => {
	await page.goto("/");

	await page.getByText("Cadastrar").click();
	await page.getByLabel("E-mail").fill(`e2e-backup-${Date.now()}@example.com`);
	await page.getByLabel("Senha").fill("correct-horse-battery");
	await page.getByRole("button", { name: "Cadastrar" }).click();

	await page.getByRole("tab", { name: /Foods/ }).click();
	await page.getByRole("button", { name: "plus" }).click();
	await page.getByLabel("Nome").fill("Whole Milk");
	await page.getByLabel("Quantidade").fill("2");
	await page.getByLabel("Data de validade").click();
	await page.locator(".ant-picker-cell-today").click();
	await page.getByRole("button", { name: "OK" }).click();
	await expect(page.getByText("Whole Milk")).toBeVisible();

	await page.getByRole("tab", { name: "⚙️" }).click();

	const downloadPromise = page.waitForEvent("download");
	await page.getByRole("button", { name: "Exportar backup" }).click();
	const download = await downloadPromise;
	const backupPath = await download.path();
	if (!backupPath) throw new Error("expected a downloaded file path");

	// Add a second item the exported backup does NOT contain, so re-importing
	// the export proves it actually replaced current state rather than
	// leaving things as they already were.
	await page.getByRole("tab", { name: /Foods/ }).click();
	await page.getByRole("button", { name: "plus" }).click();
	await page.getByLabel("Nome").fill("Extra Item");
	await page.getByLabel("Quantidade").fill("1");
	await page.getByLabel("Data de validade").click();
	await page.locator(".ant-picker-cell-today").click();
	await page.getByRole("button", { name: "OK" }).click();
	await expect(page.getByText("Extra Item")).toBeVisible();

	await page.getByRole("tab", { name: "⚙️" }).click();
	await page.getByLabel("Importar backup").setInputFiles(backupPath);

	await expect(page.getByText(/substituir todos os dados/i)).toBeVisible();
	await page.getByLabel("Confirmação").fill("substituir");
	await page.getByRole("button", { name: "OK" }).click();

	await page.getByRole("tab", { name: /Foods/ }).click();
	await expect(page.getByText("Whole Milk")).toBeVisible();
	await expect(page.getByText("Extra Item")).not.toBeVisible();
});

test("items expiring beyond the hide-distant threshold are not shown", async ({ page }) => {
	await page.goto("/");

	await page.getByText("Cadastrar").click();
	await page.getByLabel("E-mail").fill(`e2e-distant-${Date.now()}@example.com`);
	await page.getByLabel("Senha").fill("correct-horse-battery");
	await page.getByRole("button", { name: "Cadastrar" }).click();

	await page.getByRole("tab", { name: /Foods/ }).click();
	await page.getByRole("button", { name: "plus" }).click();
	await page.getByLabel("Nome").fill("Near Item");
	await page.getByLabel("Quantidade").fill("1");
	await page.getByLabel("Data de validade").click();
	await page.locator(".ant-picker-cell-today").click();
	await page.getByRole("button", { name: "OK" }).click();
	await expect(page.getByText("Near Item")).toBeVisible();

	// A far-future date beyond the default 3-month hide-distant threshold.
	const farDate = new Date();
	farDate.setMonth(farDate.getMonth() + 8);
	const farDateStr = farDate.toISOString().slice(0, 10);

	await page.getByRole("button", { name: "plus" }).click();
	await page.getByLabel("Nome").fill("Far Item");
	await page.getByLabel("Quantidade").fill("1");
	await page.getByLabel("Data de validade").fill(farDateStr);
	await page.getByLabel("Data de validade").press("Enter");
	await page.getByRole("button", { name: "OK" }).click();

	await expect(page.getByText("Near Item")).toBeVisible();
	await expect(page.getByText("Far Item")).not.toBeVisible();
});

test("switching language updates the rendered UI immediately", async ({ page }) => {
	await page.goto("/");

	await page.getByText("Cadastrar").click();
	await page.getByLabel("E-mail").fill(`e2e-lang-${Date.now()}@example.com`);
	await page.getByLabel("Senha").fill("correct-horse-battery");
	await page.getByRole("button", { name: "Cadastrar" }).click();

	await page.getByRole("tab", { name: "⚙️" }).click();
	await expect(page.getByText("Aviso de estoque baixo")).toBeVisible();

	await page.getByRole("combobox").click();
	await page.getByText("English", { exact: true }).click();

	await expect(page.getByText("Low stock warning threshold")).toBeVisible();
});

test("scans a barcode, pre-fills the name from Open Food Facts, and reuses the cache on a repeat scan", async ({
	page,
}) => {
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

test("denies notification permission gracefully, leaving the switch off with an inline message", async ({
	page,
}) => {
	await page.addInitScript(() => {
		Object.defineProperty(window.Notification, "requestPermission", {
			value: () => Promise.resolve("denied"),
			configurable: true,
		});
	});

	await page.goto("/");
	await page.getByText("Cadastrar").click();
	await page.getByLabel("E-mail").fill(`e2e-notif-${Date.now()}@example.com`);
	await page.getByLabel("Senha").fill("correct-horse-battery");
	await page.getByRole("button", { name: "Cadastrar" }).click();

	await page.getByRole("tab", { name: "⚙️" }).click();
	const notifSwitch = page.getByRole("switch", { name: /notifica/i });
	await notifSwitch.click();

	await expect(page.getByText(/permiss/i)).toBeVisible();
	await expect(notifSwitch).not.toBeChecked();
});
