import {
	addDoc,
	collection,
	doc,
	runTransaction,
	setDoc,
	Timestamp,
	updateDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { type PantryItem, parseItemDoc, toItemDoc } from "./schema";

// Shared `item_history/{category_name}` doc shape used by both addItem and
// setItemRecurring. `recurring` is optional here on purpose: addItem passes
// `undefined` when the form's recurring value is false so that field is
// omitted from the write entirely (see addItem below for why), while
// setItemRecurring always passes an explicit true/false for its deliberate
// full overwrite.
function toItemHistoryDoc(
	item: { name: string; category: string; duration: number | null },
	recurring?: boolean,
) {
	return {
		name: item.name,
		category: item.category,
		duration: item.duration !== null ? String(item.duration) : "",
		...(recurring !== undefined ? { recurring } : {}),
	};
}

export async function addItem(
	uid: string,
	item: Omit<PantryItem, "id">,
): Promise<void> {
	await addDoc(collection(db, "users", uid, "items"), toItemDoc(item));

	const historyId = encodeURIComponent(`${item.category}_${item.name}`);
	// Merge, and only include `recurring: true` when the form actually says
	// so — never write `recurring: false` here. item_history.recurring is the
	// authoritative "is this item type recurring" flag (read by
	// useShoppingList), keyed by name+category rather than per purchase. A
	// non-merge write, or one that always includes `recurring: item.recurring`
	// (which defaults to false, including when pre-filled from the shopping
	// list's cart-icon flow), would silently un-mark an existing recurring
	// item every time it's bought again. Unmarking recurring stays the
	// deliberate job of setItemRecurring (EditItemModal's switch) below.
	await setDoc(
		doc(db, "users", uid, "item_history", historyId),
		toItemHistoryDoc(item, item.recurring ? true : undefined),
		{ merge: true },
	);
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

		const now = new Date();
		const wasExpired = item.expiringDate.getTime() < now.getTime();

		const remaining = item.quantity - totalHandled;
		if (remaining > 0) {
			transaction.update(itemRef, { quantity: remaining });
		} else {
			transaction.delete(itemRef);
		}

		if (changes.opened > 0) {
			const newExpiringDate =
				item.duration !== null && !wasExpired
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

		if (changes.consumed > 0 || changes.discarded > 0) {
			const wasteEventDocRef = doc(
				collection(db, "users", uid, "waste_events"),
			);
			transaction.set(wasteEventDocRef, {
				category: item.category,
				was_opened: item.opened,
				was_expired: wasExpired,
				consumed: changes.consumed,
				discarded: changes.discarded,
				occurred_at: Timestamp.now(),
			});
		}
	});
}

export async function setItemRecurring(
	uid: string,
	item: PantryItem,
	recurring: boolean,
): Promise<void> {
	const historyId = encodeURIComponent(`${item.category}_${item.name}`);
	await setDoc(
		doc(db, "users", uid, "item_history", historyId),
		toItemHistoryDoc(item, recurring),
	);

	await updateDoc(doc(db, "users", uid, "items", item.id), { recurring });
}
