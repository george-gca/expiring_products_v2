import type { ReactNode } from "react";
import { Spin } from "antd";
import { useAuth } from "../features/auth/useAuth";
import { LoginPage } from "../features/auth/LoginPage";

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
