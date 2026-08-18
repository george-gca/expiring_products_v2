import type { User } from "firebase/auth";
import { CategoryTabs } from "../features/categories/CategoryTabs";
import { useCategories } from "../features/categories/useCategories";
import { ItemList } from "../features/pantry-items/ItemList";

export function AppRoute({ user }: { user: User }) {
	const { categories, loading } = useCategories(user.uid);

	if (loading) return null;

	return (
		<CategoryTabs
			categories={categories}
			renderPane={(category) => <ItemList uid={user.uid} category={category} />}
			settingsPane={<div>Settings — Phase 4</div>}
		/>
	);
}
