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
