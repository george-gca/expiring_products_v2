import { Timestamp } from "firebase/firestore";
import { z } from "zod";

const timestampSchema = z.custom<Timestamp>((val) => val instanceof Timestamp, {
	message: "Expected a Firestore Timestamp",
});

export const fcmTokenDocSchema = z.object({
	token: z.string().min(1),
	updatedAt: timestampSchema,
});

export interface FcmToken {
	token: string;
	updatedAt: Date;
}

export function parseFcmTokenDoc(data: unknown): FcmToken {
	const parsed = fcmTokenDocSchema.parse(data);
	return { token: parsed.token, updatedAt: parsed.updatedAt.toDate() };
}

export function toFcmTokenDoc(fcmToken: Omit<FcmToken, "updatedAt">) {
	return { token: fcmToken.token, updatedAt: Timestamp.now() };
}
