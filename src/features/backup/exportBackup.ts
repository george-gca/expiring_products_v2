import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { parseCategoryDoc } from "../categories/schema";
import { parseItemDoc, safeParseItemHistoryDoc } from "../pantry-items/schema";
import { parseSettingsDoc } from "../settings/schema";
import type { Backup } from "./schema";

export async function buildBackup(uid: string): Promise<Backup> {
	const [settingsSnap, categoriesSnap, itemsSnap, itemHistorySnap] =
		await Promise.all([
			getDoc(doc(db, "users", uid)),
			getDocs(collection(db, "users", uid, "categories")),
			getDocs(collection(db, "users", uid, "items")),
			getDocs(collection(db, "users", uid, "item_history")),
		]);

	// `parseSettingsDoc({})` deliberately reuses that function's own
	// `.catch(3)` default (see settings/schema.ts) rather than duplicating
	// the literal default value 3 here.
	const settings = parseSettingsDoc(
		settingsSnap.exists() ? settingsSnap.data() : {},
	);

	const categories = categoriesSnap.docs
		.map((d) => parseCategoryDoc(d.id, d.data()))
		.map(({ key, name, emoji, order }) => ({ key, name, emoji, order }));

	const items = itemsSnap.docs
		.map((d) => parseItemDoc(d.id, d.data()))
		.map((item) => ({
			name: item.name,
			category: item.category,
			quantity: item.quantity,
			expiringDate: item.expiringDate.toISOString(),
			duration: item.duration,
			dateOpened: item.dateOpened ? item.dateOpened.toISOString() : null,
			opened: item.opened,
			recurring: item.recurring,
			barcode: item.barcode,
			source: item.source,
		}));

	const itemHistory = itemHistorySnap.docs
		.map((d) => safeParseItemHistoryDoc(d.data()))
		.filter((entry): entry is NonNullable<typeof entry> => entry !== null);

	return {
		version: 1,
		exportedAt: new Date().toISOString(),
		settings,
		categories,
		items,
		itemHistory,
	};
}
