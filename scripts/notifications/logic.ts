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

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function buildDigestBody(
	items: { name: string; expiringDate: Date }[],
	now: Date,
	language: "pt-br" | "en-us",
): { title: string; body: string } {
	const today: string[] = [];
	const soon: string[] = [];
	const thisWeek: string[] = [];
	for (const item of items) {
		const daysUntil = Math.floor(
			(item.expiringDate.getTime() - now.getTime()) / MS_PER_DAY,
		);
		if (daysUntil <= 0) today.push(item.name);
		else if (daysUntil <= 2) soon.push(item.name);
		else thisWeek.push(item.name);
	}

	const labels =
		language === "en-us"
			? { today: "Today", soon: "1-2 days", thisWeek: "This week" }
			: { today: "Hoje", soon: "1-2 dias", thisWeek: "Esta semana" };

	const body = [
		today.length > 0 ? `${labels.today}: ${today.join(", ")}` : null,
		soon.length > 0 ? `${labels.soon}: ${soon.join(", ")}` : null,
		thisWeek.length > 0 ? `${labels.thisWeek}: ${thisWeek.join(", ")}` : null,
	]
		.filter((line) => line !== null)
		.join("\n");

	const baseTitle =
		language === "en-us"
			? `${items.length} item(s) expiring soon`
			: `${items.length} item(ns) vencendo em breve`;
	const title =
		today.length > 0
			? `${baseTitle} — ${today.length} ${language === "en-us" ? "today" : "hoje"}!`
			: baseTitle;

	return { title, body };
}
