import { ConfigProvider, theme } from "antd";
import { App } from "./App";
import { useColorScheme } from "./lib/useColorScheme";

export function Root() {
	const isDark = useColorScheme();

	return (
		<ConfigProvider
			theme={{
				algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
			}}
		>
			<App />
		</ConfigProvider>
	);
}
