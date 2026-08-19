import { doc, setDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { type BarcodeProduct, toBarcodeProductDoc } from "./schema";

export async function upsertBarcodeProduct(
	uid: string,
	barcode: string,
	product: Omit<BarcodeProduct, "updatedAt">,
): Promise<void> {
	await setDoc(
		doc(db, "users", uid, "barcode_products", barcode),
		toBarcodeProductDoc(product),
	);
}
