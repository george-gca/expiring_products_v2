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

	const sources: {
		host: string;
		source: "openfoodfacts" | "openproductsfacts" | "openbeautyfacts";
	}[] = [
		{ host: "world.openfoodfacts.org", source: "openfoodfacts" },
		{ host: "world.openproductsfacts.org", source: "openproductsfacts" },
		{ host: "world.openbeautyfacts.org", source: "openbeautyfacts" },
	];

	for (const { host, source } of sources) {
		const name = await fetchProductName(host, barcode);
		if (name === null) continue;

		await upsertBarcodeProduct(uid, barcode, {
			name,
			category,
			suggestedDuration: null,
			source,
		});

		return { name, suggestedDuration: null };
	}

	return null;
}

async function fetchProductName(
	host: string,
	barcode: string,
): Promise<string | null> {
	try {
		const response = await fetch(
			`https://${host}/api/v2/product/${barcode}.json?fields=product_name`,
		);
		if (!response.ok) return null;
		const data = await response.json();
		const name = data?.product?.product_name;
		return typeof name === "string" && name.length > 0 ? name : null;
	} catch {
		return null;
	}
}
