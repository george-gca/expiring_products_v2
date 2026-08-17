import { addDoc, collection, doc, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { type PantryItem, toItemDoc } from "./schema";

export async function addItem(
	uid: string,
	item: Omit<PantryItem, "id">,
): Promise<void> {
	await addDoc(collection(db, "users", uid, "items"), toItemDoc(item));

	const historyId = `${item.category}_${item.name}`;
	await setDoc(doc(db, "users", uid, "item_history", historyId), {
		name: item.name,
		category: item.category,
		duration: item.duration !== null ? String(item.duration) : "",
		recurring: item.recurring,
	});
}
