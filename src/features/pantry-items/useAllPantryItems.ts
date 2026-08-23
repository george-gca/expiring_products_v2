import { message } from "antd";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { type PantryItem, safeParseItemDoc } from "./schema";

export function useAllPantryItems(uid: string): {
	items: PantryItem[];
	loading: boolean;
} {
	const [items, setItems] = useState<PantryItem[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const unsubscribe = onSnapshot(
			collection(db, "users", uid, "items"),
			(snapshot) => {
				// Same malformed-doc handling as usePantryItems — see
				// safeParseItemDoc's doc comment for why the safe variant is
				// required here.
				const parsedItems: PantryItem[] = [];
				for (const d of snapshot.docs) {
					const parsed = safeParseItemDoc(d.id, d.data());
					if (parsed) {
						parsedItems.push(parsed);
					} else {
						console.warn(
							`useAllPantryItems: skipping malformed item doc ${d.id}`,
						);
					}
				}
				setItems(parsedItems);
				setLoading(false);
			},
			() => {
				message.error("Something went wrong, please try again");
				setLoading(false);
			},
		);
		return unsubscribe;
	}, [uid]);

	return { items, loading };
}
