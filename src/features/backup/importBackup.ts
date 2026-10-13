import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	getDocs,
	setDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { toClassDoc } from "../classes/schema";
import { toItemDoc } from "../pantry-items/schema";
import type { Backup } from "./schema";

// Two-phase (delete everything, then write everything), not a single atomic
// transaction — see the Phase 3 design spec's Approach section for why this
// project accepts the resulting partial-failure risk rather than adding
// transaction/rollback complexity for a rarely-used, self-serve action.
export async function importBackup(uid: string, backup: Backup): Promise<void> {
	const [existingCategories, existingItems, existingHistory, existingClasses] =
		await Promise.all([
			getDocs(collection(db, "users", uid, "categories")),
			getDocs(collection(db, "users", uid, "items")),
			getDocs(collection(db, "users", uid, "item_history")),
			getDocs(collection(db, "users", uid, "classes")),
		]);

	await Promise.all([
		...existingCategories.docs.map((d) => deleteDoc(d.ref)),
		...existingItems.docs.map((d) => deleteDoc(d.ref)),
		...existingHistory.docs.map((d) => deleteDoc(d.ref)),
		...existingClasses.docs.map((d) => deleteDoc(d.ref)),
	]);

	await Promise.all([
		setDoc(doc(db, "users", uid), backup.settings),
		...backup.categories.map((category) =>
			setDoc(doc(db, "users", uid, "categories", category.key), category),
		),
		// A class's key is its doc id (see createClass), so restoring to that
		// exact id keeps items' and history's classKey references valid.
		...backup.classes.map((cls) =>
			setDoc(doc(db, "users", uid, "classes", cls.key), toClassDoc(cls)),
		),
		...backup.items.map((item) =>
			addDoc(
				collection(db, "users", uid, "items"),
				toItemDoc({
					...item,
					expiringDate: item.expiringDate ? new Date(item.expiringDate) : null,
					dateOpened: item.dateOpened ? new Date(item.dateOpened) : null,
					classKey: item.classKey ?? null,
				}),
			),
		),
		...backup.itemHistory.map((entry) =>
			setDoc(
				doc(
					db,
					"users",
					uid,
					"item_history",
					encodeURIComponent(`${entry.category}_${entry.name}`),
				),
				{
					name: entry.name,
					category: entry.category,
					duration: entry.duration,
					recurring: entry.recurring,
					...(entry.classKey ? { class_key: entry.classKey } : {}),
				},
			),
		),
	]);
}
