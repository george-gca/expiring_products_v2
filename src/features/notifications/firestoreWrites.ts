import {
	collection,
	deleteDoc,
	doc,
	getDocs,
	limit,
	query,
	setDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { toFcmTokenDoc } from "./schema";

export async function upsertFcmToken(
	uid: string,
	deviceId: string,
	token: string,
): Promise<void> {
	await setDoc(
		doc(db, "users", uid, "fcm_tokens", deviceId),
		toFcmTokenDoc({ token }),
	);
}

export async function deleteFcmToken(
	uid: string,
	deviceId: string,
): Promise<void> {
	await deleteDoc(doc(db, "users", uid, "fcm_tokens", deviceId));
}

export async function hasAnyFcmToken(uid: string): Promise<boolean> {
	const snapshot = await getDocs(
		query(collection(db, "users", uid, "fcm_tokens"), limit(1)),
	);
	return !snapshot.empty;
}
