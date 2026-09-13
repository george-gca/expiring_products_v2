#!/usr/bin/env node
// Minimal chromium-cli-alike REPL for driving this app headlessly, for use
// where chromium-cli itself isn't installed. Reads one command per line from
// stdin (pipe a heredoc), prints one result line per command, and writes
// screenshots to ./screenshots/ (relative to cwd when the driver was
// launched). See SKILL.md in this directory for the command list and a
// worked example.
//
// Usage: node .claude/skills/run-expiring-products-v2/driver.mjs <<'EOF'
// nav http://localhost:5173
// wait-for text=Expiring Products
// screenshot login
// EOF

import { mkdir } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { chromium } from "playwright";

const SCREENSHOT_DIR = "screenshots";
await mkdir(SCREENSHOT_DIR, { recursive: true });

// Chromium's own sandbox works fine as this non-root user in this
// container (verified directly) — no --no-sandbox needed. If a different
// environment's launch fails on a sandbox error, add it back there rather
// than defaulting to it here.
const browser = await chromium.launch();
// pt-BR matches this project's e2e suite (playwright.config.ts) and its
// default locale, so selectors written against pt-BR copy behave the same
// way here as they do in CI. No `permissions` granted by default — this
// driver only needs to see what an ordinary signed-out visitor sees; a
// script driving the barcode-scanning flow specifically should request
// `camera` on its own context.
const context = await browser.newContext({ locale: "pt-BR" });
const page = await context.newPage();

const consoleErrors = [];
page.on("console", (msg) => {
	if (msg.type() === "error") consoleErrors.push(msg.text());
});
page.on("pageerror", (err) => consoleErrors.push(String(err)));

let shotCount = 0;

async function run(line) {
	const trimmed = line.trim();
	if (!trimmed || trimmed.startsWith("#")) return;

	const [cmd, ...rest] = trimmed.split(/\s+/);
	const arg = rest.join(" ");

	switch (cmd) {
		case "nav": {
			// http(s) only: this driver points at a local dev server, never at
			// `file://` — nav-then-screenshot to a local file would otherwise
			// let a script exfiltrate arbitrary filesystem contents as a PNG.
			if (!/^https?:\/\//i.test(arg)) {
				console.log(`err nav: only http(s) URLs are allowed, got: ${arg}`);
				return;
			}
			await page.goto(arg, { waitUntil: "domcontentloaded" });
			console.log(`ok nav ${arg}`);
			return;
		}
		case "wait-for": {
			// "text=..." uses Playwright's text engine; anything else is passed
			// straight through as a selector (CSS, or CSS extended with
			// :has-text(), which Playwright supports natively).
			await page.waitForSelector(arg, { timeout: 15000 });
			console.log(`ok wait-for ${arg}`);
			return;
		}
		case "click": {
			await page.click(arg, { timeout: 15000 });
			console.log(`ok click ${arg}`);
			return;
		}
		case "fill": {
			const [selector, ...valueParts] = rest;
			const value = valueParts.join(" ");
			await page.fill(selector, value, { timeout: 15000 });
			console.log(`ok fill ${selector} ${value}`);
			return;
		}
		case "press": {
			await page.keyboard.press(arg);
			console.log(`ok press ${arg}`);
			return;
		}
		case "screenshot": {
			const requested = arg || `shot-${++shotCount}`;
			// Strip anything but a plain filename — no `/`, `..`, or an absolute
			// path — so a screenshot name can't write outside SCREENSHOT_DIR.
			const safeName = path.basename(requested).replace(/^\.+/, "") || "shot";
			const filePath = path.join(SCREENSHOT_DIR, `${safeName}.png`);
			await page.screenshot({ path: filePath });
			console.log(`ok screenshot ${filePath}`);
			return;
		}
		case "console": {
			if (arg === "--errors") {
				console.log(
					consoleErrors.length === 0
						? "ok console --errors (none)"
						: `console errors:\n${consoleErrors.join("\n")}`,
				);
			}
			return;
		}
		case "sleep": {
			await new Promise((resolve) => setTimeout(resolve, Number(arg) || 0));
			console.log(`ok sleep ${arg}`);
			return;
		}
		case "quit": {
			await browser.close();
			process.exit(0);
			return;
		}
		default: {
			console.log(`err unknown command: ${cmd}`);
		}
	}
}

const rl = readline.createInterface({ input: process.stdin });
for await (const line of rl) {
	try {
		await run(line);
	} catch (err) {
		console.log(`err ${err instanceof Error ? err.message : String(err)}`);
	}
}
await browser.close();
