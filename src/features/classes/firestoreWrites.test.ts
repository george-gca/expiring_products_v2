import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import { archiveClass, createClass, renameClass } from "./firestoreWrites";

const uid = "test-user-class-writes-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("createClass", () => {
	it("writes a new class doc whose key equals its own doc id", async () => {
		const classId = await createClass(uid, "cleaning", "Soap");

		const all = await getDocs(collection(db, "users", uid, "classes"));
		expect(all.docs).toHaveLength(1);
		const created = all.docs[0];
		expect(created.id).toBe(classId);
		expect(created.data()).toEqual({
			key: created.id,
			category: "cleaning",
			name: "Soap",
			archived: false,
		});
	});

	// Review Focus: nothing enforces unique class names within a category —
	// two classes with the same name must both be creatable, each with its
	// own distinct key.
	it("allows creating two classes with the same name in the same category", async () => {
		const firstId = await createClass(uid, "cleaning", "Soap");
		const secondId = await createClass(uid, "cleaning", "Soap");

		expect(firstId).not.toBe(secondId);
		const all = await getDocs(collection(db, "users", uid, "classes"));
		expect(all.docs).toHaveLength(2);
		expect(all.docs.map((d) => d.data().name)).toEqual(["Soap", "Soap"]);
	});
});

describe("renameClass", () => {
	it("updates only name, leaving key/category/archived untouched", async () => {
		await setDoc(doc(db, "users", uid, "classes", "class1"), {
			key: "class1",
			category: "cleaning",
			name: "Soap",
			archived: false,
		});

		await renameClass(uid, "class1", "Bar Soap");

		const snapshot = await getDoc(doc(db, "users", uid, "classes", "class1"));
		expect(snapshot.data()).toEqual({
			key: "class1",
			category: "cleaning",
			name: "Bar Soap",
			archived: false,
		});
	});
});

describe("archiveClass", () => {
	it("sets archived to true without touching other fields", async () => {
		await setDoc(doc(db, "users", uid, "classes", "class1"), {
			key: "class1",
			category: "cleaning",
			name: "Soap",
			archived: false,
		});

		await archiveClass(uid, "class1");

		const snapshot = await getDoc(doc(db, "users", uid, "classes", "class1"));
		expect(snapshot.data()?.archived).toBe(true);
		expect(snapshot.data()?.name).toBe("Soap");
	});
});
