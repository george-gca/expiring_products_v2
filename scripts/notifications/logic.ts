export function matchesLocalHour(
	nowUtc: Date,
	timezone: string,
	hourLocal: number,
): boolean {
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone: timezone,
		hour: "numeric",
		hourCycle: "h23",
	});
	const localHour = Number(formatter.format(nowUtc));
	return localHour === hourLocal;
}

export function needsNotification(
	lastNotifiedAt: Date | null,
	now: Date,
	dedupDays: number,
): boolean {
	if (lastNotifiedAt === null) return true;
	const elapsedMs = now.getTime() - lastNotifiedAt.getTime();
	return elapsedMs > dedupDays * 24 * 60 * 60 * 1000;
}

export function buildDigestBody(
	itemNames: string[],
	language: "pt-br" | "en-us",
): { title: string; body: string } {
	const title =
		language === "en-us"
			? `${itemNames.length} item(s) expiring soon`
			: `${itemNames.length} item(ns) vencendo em breve`;
	return { title, body: itemNames.join(", ") };
}
