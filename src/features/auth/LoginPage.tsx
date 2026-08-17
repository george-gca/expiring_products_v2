import { Alert, Button, Card, Flex, Form, Input, Segmented } from "antd";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "./useAuth";

interface LoginFormValues {
	email: string;
	password: string;
}

export function LoginPage() {
	const { t } = useTranslation();
	const { signIn, signUp } = useAuth();
	const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
	const [error, setError] = useState<string | null>(null);

	const handleFinish = async (values: LoginFormValues) => {
		setError(null);
		try {
			if (mode === "signIn") {
				await signIn(values.email, values.password);
			} else {
				await signUp(values.email, values.password);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		}
	};

	return (
		<Flex justify="center" align="center" style={{ minHeight: "100vh" }}>
			<Card style={{ width: 360 }} title={t("auth.title")}>
				<Segmented
					block
					value={mode}
					onChange={(value) => setMode(value as "signIn" | "signUp")}
					options={[
						{ label: t("auth.signIn"), value: "signIn" },
						{ label: t("auth.signUp"), value: "signUp" },
					]}
					style={{ marginBottom: 16 }}
				/>
				{error && (
					<Alert type="error" message={error} style={{ marginBottom: 16 }} />
				)}
				<Form layout="vertical" onFinish={handleFinish}>
					<Form.Item
						name="email"
						label={t("auth.email")}
						rules={[{ required: true, type: "email" }]}
					>
						<Input autoComplete="email" />
					</Form.Item>
					<Form.Item
						name="password"
						label={t("auth.password")}
						rules={[{ required: true, min: 6 }]}
					>
						<Input.Password autoComplete="current-password" />
					</Form.Item>
					<Button type="primary" htmlType="submit" block>
						{mode === "signIn" ? t("auth.signIn") : t("auth.signUp")}
					</Button>
				</Form>
			</Card>
		</Flex>
	);
}
