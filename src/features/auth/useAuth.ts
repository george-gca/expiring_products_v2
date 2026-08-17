import {
	createUserWithEmailAndPassword,
	signOut as firebaseSignOut,
	onAuthStateChanged,
	signInWithEmailAndPassword,
	type User,
} from "firebase/auth";
import { useEffect, useState } from "react";
import { auth } from "../../lib/firebase";

interface UseAuthResult {
	user: User | null;
	loading: boolean;
	signIn: (email: string, password: string) => Promise<void>;
	signUp: (email: string, password: string) => Promise<void>;
	signOut: () => Promise<void>;
}

export function useAuth(): UseAuthResult {
	const [user, setUser] = useState<User | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		return onAuthStateChanged(auth, (nextUser) => {
			setUser(nextUser);
			setLoading(false);
		});
	}, []);

	return {
		user,
		loading,
		signIn: async (email, password) => {
			await signInWithEmailAndPassword(auth, email, password);
		},
		signUp: async (email, password) => {
			await createUserWithEmailAndPassword(auth, email, password);
		},
		signOut: async () => {
			await firebaseSignOut(auth);
		},
	};
}
