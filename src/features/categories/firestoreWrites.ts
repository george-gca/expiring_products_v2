import {
	collection,
	doc,
	setDoc,
	updateDoc,
	writeBatch,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { toCategoryDoc } from "./schema";

export async function createCategory(
	uid: string,
	name: string,
	emoji: string,
	order: number,
): Promise<void> {
	const categoriesRef = collection(db, "users", uid, "categories");
	const newDocRef = doc(categoriesRef);
	await setDoc(
		newDocRef,
		toCategoryDoc({
			key: newDocRef.id,
			name,
			emoji,
			order,
			archived: false,
		}),
	);
}

export async function renameCategory(
	uid: string,
	categoryId: string,
	name: string,
	emoji: string,
): Promise<void> {
	await updateDoc(doc(db, "users", uid, "categories", categoryId), {
		name,
		emoji,
	});
}

export async function archiveCategory(
	uid: string,
	categoryId: string,
): Promise<void> {
	await updateDoc(doc(db, "users", uid, "categories", categoryId), {
		archived: true,
	});
}

export async function swapCategoryOrder(
	uid: string,
	a: { id: string; order: number },
	b: { id: string; order: number },
): Promise<void> {
	const batch = writeBatch(db);
	batch.update(doc(db, "users", uid, "categories", a.id), { order: b.order });
	batch.update(doc(db, "users", uid, "categories", b.id), { order: a.order });
	await batch.commit();
}
