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

interface RecurringEntry {
	name: string;
	classKey: string | null;
}

export function useShoppingList(
	uid: string,
	categoryKey: string,
	pantryItems: PantryItem[],
	threshold: number,
	classes: ItemClass[],
): { shoppingList: ShoppingListEntry[]; loading: boolean } {
	const [recurringEntries, setRecurringEntries] = useState<RecurringEntry[]>(
		[],
	);
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
				const entries: RecurringEntry[] = [];
				for (const d of snapshot.docs) {
					const parsed = safeParseItemHistoryDoc(d.data());
					if (parsed) {
						entries.push({ name: parsed.name, classKey: parsed.classKey });
					} else {
						console.warn(
							`useShoppingList: skipping malformed item_history doc ${d.id}`,
						);
					}
				}
				setRecurringEntries(entries);
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
	const liveClassOf = (classKey: string | null | undefined) =>
		classKey && liveClassKeys.has(classKey) ? classKey : null;

	// A recurring name's class comes from item_history, which survives the
	// name's item docs being fully consumed. The live-item fallback only
	// covers names classed before item_history carried class_key.
	const classOfRecurringName = new Map<string, string | null>();
	for (const entry of recurringEntries) {
		const fromLiveItem = pantryItems.find(
			(item) => item.name === entry.name && liveClassOf(item.classKey),
		);
		classOfRecurringName.set(
			entry.name,
			liveClassOf(entry.classKey) ?? liveClassOf(fromLiveItem?.classKey),
		);
	}

	// A live item's own class tag wins, so a non-recurring member brand (not
	// in the recurring-only history query) still counts toward its class's
	// stock; otherwise it inherits its name's durable class.
	const classOfItem = (item: PantryItem) =>
		liveClassOf(item.classKey) ?? classOfRecurringName.get(item.name) ?? null;

	const shoppingList: ShoppingListEntry[] = [];
	const emittedClasses = new Set<string>();

	for (const [name, classKey] of classOfRecurringName) {
		if (classKey) {
			if (emittedClasses.has(classKey)) continue;
			emittedClasses.add(classKey);
			const quantity = pantryItems
				.filter((item) => classOfItem(item) === classKey)
				.reduce((sum, item) => sum + item.quantity, 0);
			if (quantity > threshold) continue;
			shoppingList.push({
				key: classKey,
				label: classNameByKey.get(classKey) ?? "",
				quantity,
				name: null,
				classKey,
			});
		} else {
			const quantity = pantryItems
				.filter((item) => item.name === name && classOfItem(item) === null)
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
	}

	return { shoppingList, loading };
}
