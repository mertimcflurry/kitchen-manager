<script lang="ts">
	type Props = { title: string; subtitle?: string };
	let { title, subtitle }: Props = $props();
</script>

<header class="pt-safe mb-4">
	<h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
	{#if subtitle}
		<p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>
	{/if}
</header>
