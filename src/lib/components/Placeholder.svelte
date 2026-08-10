<script lang="ts">
	type Props = { milestone: string; children?: import('svelte').Snippet };
	let { milestone, children }: Props = $props();
</script>

<div class="rounded-2xl border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
	<p class="text-sm text-zinc-600 dark:text-zinc-400">
		{#if children}{@render children()}{/if}
	</p>
	<p class="mt-3 text-xs font-medium tracking-wide text-zinc-400 uppercase dark:text-zinc-500">
		Kommt in {milestone}
	</p>
</div>
