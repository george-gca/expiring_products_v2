import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { getDeviceId } from "./deviceId";

export function useFcmTokenRegistered(uid: string): {
	registered: boolean;
	loading: boolean;
} {
	const [registered, setRegistered] = useState(false);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const unsubscribe = onSnapshot(
			doc(db, "users", uid, "fcm_tokens", getDeviceId()),
			(snapshot) => {
				setRegistered(snapshot.exists());
				setLoading(false);
			},
		);
		return unsubscribe;
	}, [uid]);

	return { registered, loading };
}
