import { useAuth } from "../features/auth/useAuth";
import { CategoryTabs } from "../features/categories/CategoryTabs";
import { useCategories } from "../features/categories/useCategories";
import { ItemList } from "../features/pantry-items/ItemList";

export function AppRoute() {
	const { user } = useAuth();
	const { categories, loading } = useCategories(user?.uid ?? "");

	if (!user || loading) return null;

	return (
		<CategoryTabs
			categories={categories}
			renderPane={(category) => <ItemList uid={user.uid} category={category} />}
			settingsPane={<div>Settings — Phase 4</div>}
		/>
	);
}
