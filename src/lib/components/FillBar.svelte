<script lang="ts">
	type Props = { level: number; class?: string };
	let { level, class: extra = '' }: Props = $props();

	// Vier Segmente statt eines durchgehenden Balkens: die Stufigkeit ist die
	// ehrliche Darstellung dessen, was eingegeben werden kann.
	const segments = [25, 50, 75, 100];
</script>

<div class="flex gap-0.5 {extra}" aria-hidden="true">
	{#each segments as step (step)}
		<span
			class="h-1.5 w-3 rounded-full {level >= step
				? 'bg-emerald-500'
				: 'bg-zinc-200 dark:bg-zinc-700'}"
		></span>
	{/each}
</div>
