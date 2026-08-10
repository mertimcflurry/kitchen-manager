<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Location } from '$lib/domain';

	type Props = { active: Location | null; counts: Record<Location, number> };
	let { active, counts }: Props = $props();

	// Ziele als Literale, damit resolve() sie im Template prüfen kann.
	// Zusammengesetzte Strings kämen an Typprüfung und Lint-Regel vorbei.
	const tabs = [
		{ value: null, label: 'Alle', route: '/' },
		{ value: 'fridge', label: 'Kühlschrank', route: '/?ort=fridge' },
		{ value: 'freezer', label: 'Gefrier', route: '/?ort=freezer' },
		{ value: 'pantry', label: 'Vorrat', route: '/?ort=pantry' }
	] as const satisfies ReadonlyArray<{ value: Location | null; label: string; route: string }>;

	const total = $derived(counts.fridge + counts.freezer + counts.pantry);

	function badge(value: Location | null): number {
		return value ? counts[value] : total;
	}
</script>

<!-- Segmentierte Leiste statt Dropdown: ein Tap statt zwei, und man sieht
     sofort, wo etwas liegt. -->
<nav aria-label="Ort filtern" class="mb-3 flex gap-1 overflow-x-auto pb-1">
	{#each tabs as tab (tab.label)}
		{@const isActive = active === tab.value}
		<a
			href={resolve(tab.route)}
			aria-current={isActive ? 'page' : undefined}
			data-sveltekit-noscroll
			class="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium
				transition-colors {isActive
				? 'bg-emerald-600 text-white dark:bg-emerald-500'
				: 'bg-white text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800'}"
		>
			{tab.label}
			<span class="text-xs tabular-nums opacity-70">{badge(tab.value)}</span>
		</a>
	{/each}
</nav>
