import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { message } from "../../lib/feedback";
import { db } from "../../lib/firebase";
import type { ItemClass } from "../classes/schema";
import { type PantryItem, safeParseItemHistoryDoc } from "./schema";

export interface ShoppingListEntry {
	key: string;
	label: string;
	quantity: number;
	name: string | null;
	classKey: string | null;
}

export function useShoppingList(
	uid: string,
	categoryKey: string,
	pantryItems: PantryItem[],
	threshold: number,
	classes: ItemClass[],
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

	const liveClassKeys = new Set(classes.map((cls) => cls.key));
	const classNameByKey = new Map(classes.map((cls) => [cls.key, cls.name]));
	const recurringNameSet = new Set(recurringNames);
	const isLiveClassed = (item: PantryItem) =>
		!!item.classKey && liveClassKeys.has(item.classKey);

	const shoppingList: ShoppingListEntry[] = [];

	const classGroups = new Map<string, PantryItem[]>();
	for (const item of pantryItems) {
		if (isLiveClassed(item)) {
			// isLiveClassed guarantees item.classKey is non-null here.
			const classKey = item.classKey as string;
			const group = classGroups.get(classKey) ?? [];
			group.push(item);
			classGroups.set(classKey, group);
		}
	}
	for (const [classKey, groupItems] of classGroups) {
		const isRecurring = groupItems.some((item) =>
			recurringNameSet.has(item.name),
		);
		if (!isRecurring) continue;
		const quantity = groupItems.reduce((sum, item) => sum + item.quantity, 0);
		if (quantity > threshold) continue;
		shoppingList.push({
			key: classKey,
			label: classNameByKey.get(classKey) ?? "",
			quantity,
			name: null,
			classKey,
		});
	}

	for (const name of recurringNames) {
		const occurrences = pantryItems.filter((item) => item.name === name);
		const fullyClassed =
			occurrences.length > 0 && occurrences.every(isLiveClassed);
		if (fullyClassed) continue;
		const quantity = occurrences
			.filter((item) => !isLiveClassed(item))
			.reduce((sum, item) => sum + item.quantity, 0);
		if (quantity > threshold) continue;
		shoppingList.push({
			key: name,
			label: name,
			quantity,
			name,
			classKey: null,
		});
	}

	return { shoppingList, loading };
}
