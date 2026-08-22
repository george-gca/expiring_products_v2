import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "../../lib/firebase";
import { clearFirestoreEmulator } from "../../test/emulator";
import {
	archiveCategory,
	createCategory,
	renameCategory,
	swapCategoryOrder,
} from "./firestoreWrites";

const uid = "test-user-cat-writes-1";

afterEach(() =>
	clearFirestoreEmulator(import.meta.env.VITE_FIREBASE_PROJECT_ID),
);

describe("createCategory", () => {
	it("writes a new category doc whose key equals its own doc id", async () => {
		await createCategory(uid, "Freezer", "🧊", 2);

		// The real doc id is Firestore-auto-generated and unknown ahead of
		// time, so read the whole (otherwise-empty) collection back rather
		// than a specific doc id.
		const all = await getDocs(collection(db, "users", uid, "categories"));
		expect(all.docs).toHaveLength(1);
		const created = all.docs[0];
		expect(created.data()).toEqual({
			key: created.id,
			name: "Freezer",
			emoji: "🧊",
			order: 2,
			archived: false,
		});
	});
});

describe("renameCategory", () => {
	it("updates only name and emoji, leaving key/order/archived untouched", async () => {
		await setDoc(doc(db, "users", uid, "categories", "cat1"), {
			key: "cat1",
			name: "Foods",
			emoji: "🍎",
			order: 0,
			archived: false,
		});

		await renameCategory(uid, "cat1", "Pantry", "🥫");

		const snapshot = await getDoc(doc(db, "users", uid, "categories", "cat1"));
		expect(snapshot.data()).toEqual({
			key: "cat1",
			name: "Pantry",
			emoji: "🥫",
			order: 0,
			archived: false,
		});
	});
});

describe("archiveCategory", () => {
	it("sets archived to true without touching other fields", async () => {
		await setDoc(doc(db, "users", uid, "categories", "cat1"), {
			key: "cat1",
			name: "Foods",
			emoji: "🍎",
			order: 0,
			archived: false,
		});

		await archiveCategory(uid, "cat1");

		const snapshot = await getDoc(doc(db, "users", uid, "categories", "cat1"));
		expect(snapshot.data()?.archived).toBe(true);
		expect(snapshot.data()?.name).toBe("Foods");
	});
});

describe("swapCategoryOrder", () => {
	it("swaps the order field of both categories atomically", async () => {
		await setDoc(doc(db, "users", uid, "categories", "cat1"), {
			key: "cat1",
			name: "Foods",
			emoji: "🍎",
			order: 0,
			archived: false,
		});
		await setDoc(doc(db, "users", uid, "categories", "cat2"), {
			key: "cat2",
			name: "Medicines",
			emoji: "💊",
			order: 1,
			archived: false,
		});

		await swapCategoryOrder(
			uid,
			{ id: "cat1", order: 0 },
			{ id: "cat2", order: 1 },
		);

		const cat1 = await getDoc(doc(db, "users", uid, "categories", "cat1"));
		const cat2 = await getDoc(doc(db, "users", uid, "categories", "cat2"));
		expect(cat1.data()?.order).toBe(1);
		expect(cat2.data()?.order).toBe(0);
	});
});
