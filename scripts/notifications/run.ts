import { fileURLToPath } from "node:url";
import { cert, initializeApp } from "firebase-admin/app";
import { type Firestore, getFirestore } from "firebase-admin/firestore";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import {
	buildDigestBody,
	matchesLocalHour,
	needsNotification,
} from "./logic.js";

const DEDUP_DAYS = 7;

export async function runDailyNotifications(
	db: Firestore,
	messaging: Messaging,
	now: Date = new Date(),
): Promise<void> {
	const usersSnapshot = await db.collection("users").get();

	for (const userDoc of usersSnapshot.docs) {
		const settings = userDoc.data();
		const notificationsEnabled = settings.notificationsEnabled === true;
		if (!notificationsEnabled) {
			console.log(`[${userDoc.id}] notifications disabled, skipping`);
			continue;
		}

		const notifyTimezone =
			typeof settings.notifyTimezone === "string"
				? settings.notifyTimezone
				: "America/Sao_Paulo";
		const notifyHourLocal =
			typeof settings.notifyHourLocal === "number"
				? settings.notifyHourLocal
				: 8;
		if (!matchesLocalHour(now, notifyTimezone, notifyHourLocal)) {
			console.log(
				`[${userDoc.id}] current hour doesn't match notifyHourLocal=${notifyHourLocal} tz=${notifyTimezone}, skipping`,
			);
			continue;
		}

		const notifyDaysBeforeExpiry =
			typeof settings.notifyDaysBeforeExpiry === "number"
				? settings.notifyDaysBeforeExpiry
				: 3;
		const language = settings.language === "en-us" ? "en-us" : "pt-br";

		const uid = userDoc.id;
		const cutoff = new Date(
			now.getTime() + notifyDaysBeforeExpiry * 24 * 60 * 60 * 1000,
		);

		const itemsSnapshot = await db
			.collection("users")
			.doc(uid)
			.collection("items")
			.where("opened", "==", false)
			.where("expiring_date", "<=", cutoff)
			.get();

		const dueItems = itemsSnapshot.docs.filter((itemDoc) => {
			const data = itemDoc.data();
			const lastNotifiedAt = data.last_notified_at
				? (data.last_notified_at as { toDate: () => Date }).toDate()
				: null;
			return needsNotification(lastNotifiedAt, now, DEDUP_DAYS);
		});

		if (dueItems.length === 0) {
			console.log(`[${uid}] no due items, skipping`);
			continue;
		}

		const { title, body } = buildDigestBody(
			dueItems.map((itemDoc) => itemDoc.data().name as string),
			language,
		);

		const tokensSnapshot = await db
			.collection("users")
			.doc(uid)
			.collection("fcm_tokens")
			.get();

		console.log(
			`[${uid}] ${dueItems.length} due item(s), sending to ${tokensSnapshot.docs.length} device(s)`,
		);
		for (const tokenDoc of tokensSnapshot.docs) {
			await messaging.send({
				token: tokenDoc.data().token as string,
				notification: { title, body },
			});
		}

		const batch = db.batch();
		for (const itemDoc of dueItems) {
			batch.update(itemDoc.ref, { last_notified_at: now });
		}
		await batch.commit();
		console.log(`[${uid}] sent and marked last_notified_at`);
	}
}

// Standard ESM "is this the entrypoint" check — runs the real send only when
// this file is executed directly (`tsx scripts/notifications/run.ts`), not
// when imported by the integration test above.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const app = initializeApp({
		credential: cert(
			JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON ?? "{}"),
		),
		projectId: process.env.FIREBASE_PROJECT_ID,
	});
	await runDailyNotifications(getFirestore(app), getMessaging(app));
}
