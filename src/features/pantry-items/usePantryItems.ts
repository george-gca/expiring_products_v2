import { message } from "antd";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { type PantryItem, parseItemDoc } from "./schema";

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
				setItems(snapshot.docs.map((d) => parseItemDoc(d.id, d.data())));
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
