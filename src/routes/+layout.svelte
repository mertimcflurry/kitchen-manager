<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import BottomNav from '$lib/components/BottomNav.svelte';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';

	let { children, data }: { children: Snippet; data: LayoutData } = $props();

	// /nutzer hat genau eine Aufgabe und lädt oft ohne gewählten Nutzer — eine
	// Nav zu Bestand/Ablauf/etc. wäre dort ein Ziel, das noch niemandem gehört.
	const showNav = $derived(page.url.pathname !== '/nutzer');
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
	<main class="mx-auto max-w-lg px-4 pt-4 {showNav ? 'pb-nav' : 'pb-4'}">
		{@render children()}
	</main>
	{#if showNav}
		<BottomNav urgentCount={data.urgentCount} />
	{/if}
</div>
