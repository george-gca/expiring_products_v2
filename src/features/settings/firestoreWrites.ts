import { doc, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";

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
