import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import { message } from "../../lib/feedback";
import { db } from "../../lib/firebase";
import { type ItemClass, parseClassDoc } from "./schema";

export function useClasses(
	uid: string,
	categoryKey: string,
): { classes: ItemClass[]; loading: boolean } {
	const [classes, setClasses] = useState<ItemClass[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const classesQuery = query(
			collection(db, "users", uid, "classes"),
			where("category", "==", categoryKey),
		);
		const unsubscribe = onSnapshot(
			classesQuery,
			(snapshot) => {
				setClasses(
					snapshot.docs
						.map((d) => parseClassDoc(d.id, d.data()))
						.filter((cls) => !cls.archived),
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

	return { classes, loading };
}
