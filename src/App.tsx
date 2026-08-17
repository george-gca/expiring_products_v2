import { AppRoute } from "./routes/app-route";
import { RootRoute } from "./routes/root-route";

export function App() {
	return (
		<RootRoute>
			<AppRoute />
		</RootRoute>
	);
}
