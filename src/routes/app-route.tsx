import type { User } from "firebase/auth";
import { useEffect } from "react";
import { CategoryTabs } from "../features/categories/CategoryTabs";
import { useCategories } from "../features/categories/useCategories";
import { ItemList } from "../features/pantry-items/ItemList";
import { SettingsPane } from "../features/settings/SettingsPane";
import { useSettings } from "../features/settings/useSettings";
import i18n from "../lib/i18n";

export function AppRoute({ user }: { user: User }) {
	const { categories, loading: categoriesLoading } = useCategories(user.uid);
	const { settings, loading: settingsLoading } = useSettings(user.uid);

	// Propagates a language change that arrived via onSnapshot from another
	// device to this one. The `!settingsLoading` guard matters: useSettings
	// seeds settings.language with the default "pt-br" before Firestore
	// resolves, so calling changeLanguage unconditionally on every render
	// would briefly stomp a correctly browser-detected pre-login guess (e.g.
	// "en-us") with the default the instant AppRoute mounts, before the real
	// synced value arrives.
	useEffect(() => {
		if (!settingsLoading) {
			i18n.changeLanguage(settings.language);
		}
	}, [settings.language, settingsLoading]);

	if (categoriesLoading || settingsLoading) return null;

	return (
		<CategoryTabs
			categories={categories}
			renderPane={(category) => (
				<ItemList
					uid={user.uid}
					category={category}
					lowStockThreshold={settings.lowStockThreshold}
					hideDistantThresholdMonths={settings.hideDistantThresholdMonths}
				/>
			)}
			settingsPane={<SettingsPane uid={user.uid} settings={settings} />}
		/>
	);
}
