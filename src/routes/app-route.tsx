import type { User } from "firebase/auth";
import { CategoryTabs } from "../features/categories/CategoryTabs";
import { useCategories } from "../features/categories/useCategories";
import { ItemList } from "../features/pantry-items/ItemList";
import { SettingsPane } from "../features/settings/SettingsPane";
import { useSettings } from "../features/settings/useSettings";

export function AppRoute({ user }: { user: User }) {
	const { categories, loading: categoriesLoading } = useCategories(user.uid);
	const { settings, loading: settingsLoading } = useSettings(user.uid);

	if (categoriesLoading || settingsLoading) return null;

	return (
		<CategoryTabs
			categories={categories}
			renderPane={(category) => <ItemList uid={user.uid} category={category} />}
			settingsPane={<SettingsPane uid={user.uid} settings={settings} />}
		/>
	);
}
