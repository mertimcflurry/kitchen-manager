<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import BottomNav from '$lib/components/BottomNav.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
	<main class="pb-nav mx-auto max-w-lg px-4 pt-4">
		{@render children()}
	</main>
	<BottomNav />
</div>
