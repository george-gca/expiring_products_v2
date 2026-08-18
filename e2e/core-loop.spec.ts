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
