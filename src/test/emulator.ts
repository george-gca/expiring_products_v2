export async function clearFirestoreEmulator(projectId: string): Promise<void> {
	const response = await fetch(
		`http://127.0.0.1:8080/emulator/v1/projects/${projectId}/databases/(default)/documents`,
		{ method: "DELETE" },
	);
	if (!response.ok) {
		throw new Error(`Failed to clear Firestore emulator: ${response.status}`);
	}
}
