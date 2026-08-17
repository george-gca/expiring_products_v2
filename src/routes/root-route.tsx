import { Spin } from "antd";
import type { ReactNode } from "react";
import { LoginPage } from "../features/auth/LoginPage";
import { useAuth } from "../features/auth/useAuth";

export function RootRoute({ children }: { children: ReactNode }) {
	const { user, loading } = useAuth();

	if (loading) {
		return <Spin fullscreen />;
	}
	if (!user) {
		return <LoginPage />;
	}
	return <>{children}</>;
}
