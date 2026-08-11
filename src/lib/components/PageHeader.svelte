<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * `action` ist der Platz für eine seltene Nebenaktion — oben rechts, wo der
	 * Daumen nicht von allein hinkommt. Alles Häufige gehört nach unten.
	 */
	type Props = { title: string; subtitle?: string; action?: Snippet };
	let { title, subtitle, action }: Props = $props();
</script>

<header class="pt-safe mb-4 flex items-start gap-3">
	<div class="min-w-0 flex-1">
		<h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
		{#if subtitle}
			<p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>
		{/if}
	</div>
	{#if action}
		<div class="shrink-0">{@render action()}</div>
	{/if}
</header>
