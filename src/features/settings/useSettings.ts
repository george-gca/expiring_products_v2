import { message } from "antd";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { parseSettingsDoc, type Settings } from "./schema";

const DEFAULT_SETTINGS: Settings = {
	lowStockThreshold: 3,
	language: "pt-br",
	hideDistantThresholdMonths: 3,
	notificationsEnabled: false,
	notifyDaysBeforeExpiry: 3,
	notifyHourLocal: 8,
	notifyTimezone: "America/Sao_Paulo",
};

async function ensureSettingsDoc(uid: string) {
	const userDoc = doc(db, "users", uid);
	const existing = await getDoc(userDoc);
	if (!existing.exists()) {
		await setDoc(userDoc, DEFAULT_SETTINGS);
	}
}

export function useSettings(uid: string): {
	settings: Settings;
	loading: boolean;
} {
	const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
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
