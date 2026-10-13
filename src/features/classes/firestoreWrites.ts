import { collection, doc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { toClassDoc } from "./schema";

export async function createClass(
	uid: string,
	category: string,
	name: string,
): Promise<string> {
	const classesRef = collection(db, "users", uid, "classes");
	const newDocRef = doc(classesRef);
	await setDoc(
		newDocRef,
		toClassDoc({ key: newDocRef.id, category, name, archived: false }),
	);
	return newDocRef.id;
}

export async function renameClass(
	uid: string,
	classId: string,
	name: string,
): Promise<void> {
	await updateDoc(doc(db, "users", uid, "classes", classId), { name });
}

export async function archiveClass(
	uid: string,
	classId: string,
): Promise<void> {
	await updateDoc(doc(db, "users", uid, "classes", classId), {
		archived: true,
	});
}
