<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	type IconName = 'stock' | 'clock' | 'cart' | 'pot';
	// Route-IDs statt freier Strings: resolve() prueft sie gegen die echten Routen.
	type NavRoute = '/' | '/ablauf' | '/einkauf' | '/kochen';
	type NavItem = { route: NavRoute; label: string; icon: IconName };

	// Zwei Eintraege links, zwei rechts — dazwischen sitzt der Bon-Button.
	const left: NavItem[] = [
		{ route: '/', label: 'Bestand', icon: 'stock' },
		{ route: '/ablauf', label: 'Ablauf', icon: 'clock' }
	];
	const right: NavItem[] = [
		{ route: '/einkauf', label: 'Einkauf', icon: 'cart' },
		{ route: '/kochen', label: 'Kochen', icon: 'pot' }
	];

	function isActive(route: NavRoute): boolean {
		const path = resolve(route);
		// Der Bestand ist nur aktiv, wenn er es exakt ist — sonst leuchtet er ueberall.
		return route === '/' ? page.url.pathname === path : page.url.pathname.startsWith(path);
	}
</script>

{#snippet icon(name: IconName)}
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.75"
		stroke-linecap="round"
		stroke-linejoin="round"
		class="h-6 w-6"
		aria-hidden="true"
	>
		{#if name === 'stock'}
			<path
				d="M21 8v8a2 2 0 0 1-1 1.73l-7 4a2 2 0 0 1-2 0l-7-4A2 2 0 0 1 3 16V8a2 2 0 0 1 1-1.73l7-4a2 2 0 0 1 2 0l7 4A2 2 0 0 1 21 8Z"
			/>
			<path d="m3.3 7 8.7 5 8.7-5" />
			<path d="M12 22V12" />
		{:else if name === 'clock'}
			<circle cx="12" cy="12" r="9" />
			<path d="M12 7v5l3.5 2" />
		{:else if name === 'cart'}
			<circle cx="9" cy="20" r="1.4" />
			<circle cx="18" cy="20" r="1.4" />
			<path d="M2.5 3h2.2l2.6 12.1a1.8 1.8 0 0 0 1.8 1.4h8.7a1.8 1.8 0 0 0 1.8-1.4L21 7.5H6" />
		{:else if name === 'pot'}
			<path d="M2.5 11h19" />
			<path d="M20 11v7.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V11" />
			<path d="m5 7.5 14-3.5" />
		{/if}
	</svg>
{/snippet}

{#snippet navLink(item: NavItem)}
	{@const active = isActive(item.route)}
	<a
		href={resolve(item.route)}
		aria-current={active ? 'page' : undefined}
		class="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.6875rem]
			font-medium transition-colors active:bg-zinc-100 dark:active:bg-zinc-800
			{active ? 'text-emerald-700 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400'}"
	>
		{@render icon(item.icon)}
		<span>{item.label}</span>
	</a>
{/snippet}

<nav
	aria-label="Hauptnavigation"
	class="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/90
		backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/90"
>
	<div class="mx-auto grid max-w-lg grid-cols-5 items-center px-1">
		{#each left as item (item.route)}
			{@render navLink(item)}
		{/each}

		<!-- Bon fotografieren: die eine Aktion, die haeufig genug ist, um Platz zu verdienen. -->
		<div class="flex justify-center">
			<a
				href={resolve('/bon')}
				aria-label="Kassenbon fotografieren"
				class="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600
					text-white shadow-lg shadow-emerald-600/30 transition-transform active:scale-95
					dark:bg-emerald-500 dark:shadow-emerald-500/20"
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.75"
					stroke-linecap="round"
					stroke-linejoin="round"
					class="h-7 w-7"
					aria-hidden="true"
				>
					<path
						d="M14.5 4h-5L7.2 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.2L14.5 4Z"
					/>
					<circle cx="12" cy="13.5" r="3.2" />
				</svg>
			</a>
		</div>

		{#each right as item (item.route)}
			{@render navLink(item)}
		{/each}
	</div>
</nav>
