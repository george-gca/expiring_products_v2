import { RootRoute } from "./routes/root-route";
import { AppRoute } from "./routes/app-route";

export function App() {
  return (
    <RootRoute>
      <AppRoute />
    </RootRoute>
  );
}
