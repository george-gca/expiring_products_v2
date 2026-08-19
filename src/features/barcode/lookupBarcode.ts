import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { upsertBarcodeProduct } from "./firestoreWrites";
import { parseBarcodeProductDoc } from "./schema";

export interface BarcodeLookupResult {
	name: string;
	suggestedDuration: number | null;
}

export async function lookupBarcode(
	uid: string,
	barcode: string,
	category: string,
): Promise<BarcodeLookupResult | null> {
	try {
		const cached = await getDoc(
			doc(db, "users", uid, "barcode_products", barcode),
		);
		if (cached.exists()) {
			const product = parseBarcodeProductDoc(cached.data());
			return {
				name: product.name,
				suggestedDuration: product.suggestedDuration,
			};
		}
	} catch {
		// Fall through to Open Food Facts — a Firestore lookup failure is
		// treated the same as a cache miss, never blocks adding the item.
	}

	try {
		const response = await fetch(
			`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name`,
		);
		if (!response.ok) return null;
		const data = await response.json();
		const name = data?.product?.product_name;
		if (typeof name !== "string" || name.length === 0) return null;

		await upsertBarcodeProduct(uid, barcode, {
			name,
			category,
			suggestedDuration: null,
			source: "openfoodfacts",
		});

		return { name, suggestedDuration: null };
	} catch {
		return null;
	}
}
