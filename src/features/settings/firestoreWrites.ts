import { doc, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import type { Settings } from "./schema";

export async function updateLowStockThreshold(
	uid: string,
	value: number,
): Promise<void> {
	await setDoc(
		doc(db, "users", uid),
		{ lowStockThreshold: value },
		{ merge: true },
	);
}

export async function updateLanguage(
	uid: string,
	language: Settings["language"],
): Promise<void> {
	await setDoc(doc(db, "users", uid), { language }, { merge: true });
}

export async function updateHideDistantThresholdMonths(
	uid: string,
	value: number,
): Promise<void> {
	await setDoc(
		doc(db, "users", uid),
		{ hideDistantThresholdMonths: value },
		{ merge: true },
	);
}

export async function updateNotificationsEnabled(
	uid: string,
	value: boolean,
): Promise<void> {
	await setDoc(
		doc(db, "users", uid),
		{ notificationsEnabled: value },
		{ merge: true },
	);
}

export async function updateNotifyDaysBeforeExpiry(
	uid: string,
	value: number,
): Promise<void> {
	await setDoc(
		doc(db, "users", uid),
		{ notifyDaysBeforeExpiry: value },
		{ merge: true },
	);
}

export async function updateNotifyHourLocal(
	uid: string,
	hour: number,
	timezone: string,
): Promise<void> {
	await setDoc(
		doc(db, "users", uid),
		{ notifyHourLocal: hour, notifyTimezone: timezone },
		{ merge: true },
	);
}
