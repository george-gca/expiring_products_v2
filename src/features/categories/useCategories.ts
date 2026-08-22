import { message } from "antd";
import {
	collection,
	doc,
	getDocs,
	onSnapshot,
	orderBy,
	query,
	setDoc,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { type Category, parseCategoryDoc } from "./schema";

const DEFAULT_CATEGORIES = [
	{ key: "foods", name: "Foods", emoji: "🍎", order: 0 },
	{ key: "medicines", name: "Medicines", emoji: "💊", order: 1 },
];

async function ensureDefaultCategories(uid: string) {
	const categoriesRef = collection(db, "users", uid, "categories");
	const existing = await getDocs(categoriesRef);
	if (!existing.empty) return;
	await Promise.all(
		DEFAULT_CATEGORIES.map((category) =>
			setDoc(doc(categoriesRef, category.key), category),
		),
	);
}

export function useCategories(uid: string): {
	categories: Category[];
	loading: boolean;
} {
	const [categories, setCategories] = useState<Category[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let unsubscribe = () => {};
		ensureDefaultCategories(uid)
			.then(() => {
				const categoriesQuery = query(
					collection(db, "users", uid, "categories"),
					orderBy("order"),
				);
				unsubscribe = onSnapshot(
					categoriesQuery,
					(snapshot) => {
						setCategories(
							snapshot.docs
								.map((d) => parseCategoryDoc(d.id, d.data()))
								.filter((category) => !category.archived),
						);
						setLoading(false);
					},
					() => {
						message.error("Something went wrong, please try again");
						setLoading(false);
					},
				);
			})
			.catch(() => {
				message.error("Something went wrong, please try again");
				setLoading(false);
			});
		return () => unsubscribe();
	}, [uid]);

	return { categories, loading };
}
