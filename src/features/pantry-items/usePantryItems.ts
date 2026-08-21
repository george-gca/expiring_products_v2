import { message } from "antd";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { type PantryItem, safeParseItemDoc } from "./schema";

export function usePantryItems(
	uid: string,
	categoryKey: string,
): { items: PantryItem[]; loading: boolean } {
	const [items, setItems] = useState<PantryItem[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const itemsQuery = query(
			collection(db, "users", uid, "items"),
			where("category", "==", categoryKey),
		);
		const unsubscribe = onSnapshot(
			itemsQuery,
			(snapshot) => {
				// items is legacy v1 data this codebase has never validated before —
				// skip and warn on any doc that fails to parse rather than let one
				// bad doc throw inside the snapshot callback (which would bypass the
				// error callback below and wedge `loading` at `true` forever; see
				// safeParseItemDoc's doc comment).
				const parsedItems: PantryItem[] = [];
				for (const d of snapshot.docs) {
					const parsed = safeParseItemDoc(d.id, d.data());
					if (parsed) {
						parsedItems.push(parsed);
					} else {
						console.warn(`usePantryItems: skipping malformed item doc ${d.id}`);
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
	}, [uid, categoryKey]);

	return { items, loading };
}
