import { message } from "antd";
import { collection, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import {
	safeParseWasteEventDoc,
	type WasteEvent,
} from "../pantry-items/schema";

export function useWasteEvents(uid: string): {
	events: WasteEvent[];
	loading: boolean;
} {
	const [events, setEvents] = useState<WasteEvent[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		const unsubscribe = onSnapshot(
			collection(db, "users", uid, "waste_events"),
			(snapshot) => {
				const parsedEvents: WasteEvent[] = [];
				for (const d of snapshot.docs) {
					const parsed = safeParseWasteEventDoc(d.id, d.data());
					if (parsed) {
						parsedEvents.push(parsed);
					} else {
						console.warn(
							`useWasteEvents: skipping malformed waste_events doc ${d.id}`,
						);
					}
				}
				setEvents(parsedEvents);
				setLoading(false);
			},
			() => {
				message.error("Something went wrong, please try again");
				setLoading(false);
			},
		);
		return unsubscribe;
	}, [uid]);

	return { events, loading };
}
