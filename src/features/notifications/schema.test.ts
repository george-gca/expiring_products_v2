import { Timestamp } from "firebase/firestore";
import { describe, expect, it } from "vitest";
import { parseFcmTokenDoc, toFcmTokenDoc } from "./schema";

describe("parseFcmTokenDoc", () => {
	it("parses a valid fcm_tokens document", () => {
		const now = Timestamp.now();
		const result = parseFcmTokenDoc({ token: "abc123", updatedAt: now });
		expect(result).toEqual({ token: "abc123", updatedAt: now.toDate() });
	});

	it("rejects a document missing required fields", () => {
		expect(() => parseFcmTokenDoc({})).toThrow();
	});
});

describe("toFcmTokenDoc", () => {
	it("produces a Firestore-shaped payload with a fresh updatedAt Timestamp", () => {
		const result = toFcmTokenDoc({ token: "abc123" });
		expect(result.token).toBe("abc123");
		expect(result.updatedAt).toBeInstanceOf(Timestamp);
	});
});
