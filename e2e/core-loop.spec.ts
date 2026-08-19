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
