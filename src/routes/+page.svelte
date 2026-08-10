<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';

	// Attrappe ohne Datenbank. Steht hier, damit sich die Touch-Ziele und die
	// Mengenaenderung schon am Handy anfuehlen lassen — die echte Liste kommt
	// mit M3 aus SQLite.
	type DemoItem = { id: number; name: string; unit: string; quantity: number };

	let items = $state<DemoItem[]>([
		{ id: 1, name: 'Tofu natur', unit: 'Pck', quantity: 2 },
		{ id: 2, name: 'Haferdrink', unit: 'l', quantity: 1 },
		{ id: 3, name: 'Kichererbsen', unit: 'Dose', quantity: 4 }
	]);

	function step(item: DemoItem, by: number) {
		item.quantity = Math.max(0, item.quantity + by);
	}
</script>

<PageHeader title="Bestand" subtitle="Attrappe für den Layout-Test" />

<ul class="space-y-2">
	{#each items as item (item.id)}
		<li
			class="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3
				dark:border-zinc-800 dark:bg-zinc-900"
		>
			<div class="min-w-0 flex-1">
				<p class="truncate font-medium">{item.name}</p>
				<p class="text-sm text-zinc-500 dark:text-zinc-400">
					{item.quantity}
					{item.unit}
				</p>
			</div>

			<!-- 44 px ist das Minimum, unter dem Tippen im Stehen unzuverlaessig wird. -->
			<div class="flex items-center gap-1">
				<button
					type="button"
					onclick={() => step(item, -1)}
					aria-label="{item.name}: eins weniger"
					class="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-300
						text-xl leading-none transition active:scale-95 active:bg-zinc-100
						dark:border-zinc-700 dark:active:bg-zinc-800"
				>
					−
				</button>
				<button
					type="button"
					onclick={() => step(item, 1)}
					aria-label="{item.name}: eins mehr"
					class="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-xl
						leading-none text-white transition active:scale-95 dark:bg-emerald-500"
				>
					+
				</button>
			</div>
		</li>
	{/each}
</ul>

<p class="mt-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
	Echte Liste aus SQLite, Wisch-Geste und Undo kommen mit M3.
</p>
