import { message } from "antd";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { type PantryItem, safeParseItemHistoryDoc } from "./schema";

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
				// item_history is legacy v1 data this codebase has never validated
				// before Phase 2 — skip and warn on any doc that fails to parse
				// rather than let one bad doc throw inside the snapshot callback
				// (which would bypass the error callback below and wedge `loading`
				// at `true` forever; see safeParseItemHistoryDoc's doc comment).
				const names: string[] = [];
				for (const d of snapshot.docs) {
					const parsed = safeParseItemHistoryDoc(d.data());
					if (parsed) {
						names.push(parsed.name);
					} else {
						console.warn(
							`useShoppingList: skipping malformed item_history doc ${d.id}`,
						);
					}
				}
				setRecurringNames(names);
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
