import {
	addDoc,
	collection,
	doc,
	runTransaction,
	setDoc,
	updateDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { type PantryItem, parseItemDoc, toItemDoc } from "./schema";

export async function addItem(
	uid: string,
	item: Omit<PantryItem, "id">,
): Promise<void> {
	await addDoc(collection(db, "users", uid, "items"), toItemDoc(item));

	const historyId = encodeURIComponent(`${item.category}_${item.name}`);
	await setDoc(doc(db, "users", uid, "item_history", historyId), {
		name: item.name,
		category: item.category,
		duration: item.duration !== null ? String(item.duration) : "",
		recurring: item.recurring,
	});
}

interface QuantityChanges {
	opened: number;
	consumed: number;
	discarded: number;
}

export async function updateItemQuantities(
	uid: string,
	itemId: string,
	changes: QuantityChanges,
): Promise<void> {
	const itemRef = doc(db, "users", uid, "items", itemId);

	await runTransaction(db, async (transaction) => {
		const snapshot = await transaction.get(itemRef);
		if (!snapshot.exists()) throw new Error(`Item ${itemId} not found`);
		const item = parseItemDoc(snapshot.id, snapshot.data());

		const totalHandled = changes.opened + changes.consumed + changes.discarded;
		if (totalHandled > item.quantity) {
			throw new Error(
				"Total opened + consumed + discarded exceeds current quantity",
			);
		}

		const remaining = item.quantity - totalHandled;
		if (remaining > 0) {
			transaction.update(itemRef, { quantity: remaining });
		} else {
			transaction.delete(itemRef);
		}

		if (changes.opened > 0) {
			const now = new Date();
			const alreadyExpired = item.expiringDate.getTime() < now.getTime();
			const newExpiringDate =
				item.duration !== null && !alreadyExpired
					? new Date(now.getTime() + item.duration * 24 * 60 * 60 * 1000)
					: item.expiringDate;

			const openedItemDocRef = doc(collection(db, "users", uid, "items"));
			transaction.set(
				openedItemDocRef,
				toItemDoc({
					name: item.name,
					category: item.category,
					quantity: changes.opened,
					expiringDate: newExpiringDate,
					duration: item.duration,
					dateOpened: now,
					opened: true,
					recurring: item.recurring,
					barcode: item.barcode,
					source: item.source,
				}),
			);
		}
	});
}

export async function setItemRecurring(
	uid: string,
	item: PantryItem,
	recurring: boolean,
): Promise<void> {
	const historyId = encodeURIComponent(`${item.category}_${item.name}`);
	await setDoc(doc(db, "users", uid, "item_history", historyId), {
		name: item.name,
		category: item.category,
		duration: item.duration !== null ? String(item.duration) : "",
		recurring,
	});

	await updateDoc(doc(db, "users", uid, "items", item.id), { recurring });
}
