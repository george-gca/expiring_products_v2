import { message } from "antd";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { type PantryItem, parseItemHistoryDoc } from "./schema";

export interface ShoppingListEntry {
	name: string;
	quantity: number;
}

export function useShoppingList(
	uid: string,
	categoryKey: string,
	pantryItems: PantryItem[],
	threshold: number,
): { shoppingList: ShoppingListEntry[]; loading: boolean } {
	const [recurringNames, setRecurringNames] = useState<string[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const historyQuery = query(
			collection(db, "users", uid, "item_history"),
			where("category", "==", categoryKey),
			where("recurring", "==", true),
		);
		const unsubscribe = onSnapshot(
			historyQuery,
			(snapshot) => {
				setRecurringNames(
					snapshot.docs.map((d) => parseItemHistoryDoc(d.data()).name),
				);
				setLoading(false);
			},
			() => {
				message.error("Something went wrong, please try again");
				setLoading(false);
			},
		);
		return unsubscribe;
	}, [uid, categoryKey]);

	const shoppingList: ShoppingListEntry[] = recurringNames
		.map((name) => ({
			name,
			quantity: pantryItems
				.filter((item) => item.name === name)
				.reduce((sum, item) => sum + item.quantity, 0),
		}))
		.filter((entry) => entry.quantity <= threshold);

	return { shoppingList, loading };
}
