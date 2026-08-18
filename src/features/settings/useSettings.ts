import { message } from "antd";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { parseSettingsDoc, type Settings } from "./schema";

async function ensureSettingsDoc(uid: string) {
	const userDoc = doc(db, "users", uid);
	const existing = await getDoc(userDoc);
	if (!existing.exists()) {
		await setDoc(userDoc, { lowStockThreshold: 3 });
	}
}

export function useSettings(uid: string): {
	settings: Settings;
	loading: boolean;
} {
	const [settings, setSettings] = useState<Settings>({
		lowStockThreshold: 3,
	});
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let unsubscribe = () => {};
		ensureSettingsDoc(uid)
			.then(() => {
				const userDoc = doc(db, "users", uid);
				unsubscribe = onSnapshot(
					userDoc,
					(snapshot) => {
						if (snapshot.exists()) {
							setSettings(parseSettingsDoc(snapshot.data()));
						}
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

	return { settings, loading };
}
