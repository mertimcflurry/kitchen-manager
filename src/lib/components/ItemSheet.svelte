<script lang="ts">
	import { enhance } from '$app/forms';
	import type { StockRow } from '$lib/server/db/queries';
	import { FILL_LABELS, FILL_LEVELS, LOCATIONS, LOCATION_LABELS } from '$lib/domain';
	import FillBar from './FillBar.svelte';

	type Props = { item: StockRow; onClose: () => void; onConsume: (item: StockRow) => void };
	let { item, onClose, onConsume }: Props = $props();

	/** <input type="date"> erwartet YYYY-MM-DD in Ortszeit, nicht in UTC. */
	function toDateInput(date: Date | null): string {
		if (!date) return '';
		const pad = (n: number) => String(n).padStart(2, '0');
		return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
	}
</script>

<!-- Abdunkeln. Tippen daneben schließt — kein Abbrechen-Knopf nötig. -->
<div
	class="fixed inset-0 z-40 bg-black/40"
	role="button"
	tabindex="-1"
	aria-label="Schließen"
	onclick={onClose}
	onkeydown={(e) => e.key === 'Escape' && onClose()}
></div>

<div
	class="pb-safe fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-white
		p-5 shadow-2xl dark:bg-zinc-900"
	role="dialog"
	aria-modal="true"
	aria-label="{item.name} bearbeiten"
>
	<div class="mx-auto mb-4 h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700"></div>

	<h2 class="mb-5 text-lg font-semibold">
		<span aria-hidden="true">{item.emoji}</span>
		{item.name}
		<span class="ml-1 text-sm font-normal text-zinc-500 dark:text-zinc-400">
			{item.categoryName}
		</span>
	</h2>

	<!-- Füllstand: vier Knöpfe, kein Regler. Im Stehen trifft man Stufen, keine Prozente. -->
	<section class="mb-6">
		<div class="mb-2 flex items-center justify-between">
			<h3 class="text-sm font-medium text-zinc-500 dark:text-zinc-400">Füllstand</h3>
			{#if item.fillLevel !== null}
				<FillBar level={item.fillLevel} />
			{/if}
		</div>
		<form method="POST" action="?/fill" use:enhance class="flex gap-2">
			<input type="hidden" name="id" value={item.id} />
			<button
				type="submit"
				name="level"
				value=""
				class="min-h-12 flex-1 rounded-xl border text-sm transition active:scale-95 {item.fillLevel ===
				null
					? 'border-emerald-600 bg-emerald-50 font-medium text-emerald-700 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-400'
					: 'border-zinc-300 dark:border-zinc-700'}"
			>
				zu
			</button>
			{#each FILL_LEVELS as level (level)}
				<button
					type="submit"
					name="level"
					value={level}
					class="min-h-12 flex-1 rounded-xl border text-sm transition active:scale-95 {item.fillLevel ===
					level
						? 'border-emerald-600 bg-emerald-50 font-medium text-emerald-700 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-400'
						: 'border-zinc-300 dark:border-zinc-700'}"
				>
					{FILL_LABELS[level]}
				</button>
			{/each}
		</form>
	</section>

	<section class="mb-6">
		<h3 class="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Ort</h3>
		<form method="POST" action="?/update" use:enhance class="flex gap-2">
			<input type="hidden" name="id" value={item.id} />
			{#each LOCATIONS as loc (loc)}
				<button
					type="submit"
					name="location"
					value={loc}
					class="min-h-12 flex-1 rounded-xl border text-sm transition active:scale-95 {item.location ===
					loc
						? 'border-emerald-600 bg-emerald-50 font-medium text-emerald-700 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-400'
						: 'border-zinc-300 dark:border-zinc-700'}"
				>
					{LOCATION_LABELS[loc]}
				</button>
			{/each}
		</form>
	</section>

	<section class="mb-6">
		<h3 class="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
			Mindestens haltbar bis
			{#if item.bestBeforeIsEstimated}
				<span class="font-normal">(geschätzt)</span>
			{/if}
		</h3>
		<!-- Hier ist eine Tastatur richtig: man tippt ein Datum vom Aufdruck ab,
		     im Sitzen, selten. Die Regel gilt dem Kühlschrank-Ablauf. -->
		<form method="POST" action="?/update" use:enhance class="flex gap-2">
			<input type="hidden" name="id" value={item.id} />
			<input
				type="date"
				name="bestBefore"
				value={toDateInput(item.bestBefore)}
				class="min-h-12 flex-1 rounded-xl border-zinc-300 bg-white text-sm dark:border-zinc-700 dark:bg-zinc-800"
			/>
			<button
				type="submit"
				class="min-h-12 rounded-xl bg-zinc-900 px-5 text-sm font-medium text-white transition
					active:scale-95 dark:bg-zinc-100 dark:text-zinc-900"
			>
				Sichern
			</button>
		</form>
	</section>

	<div class="flex gap-2">
		<!-- Der barrierefreie Weg zum Aufbrauchen: eine Wischgeste allein
		     findet nicht jeder, und mit Screenreader gar nicht. -->
		<button
			type="button"
			onclick={() => onConsume(item)}
			class="min-h-12 flex-1 rounded-xl bg-emerald-600 font-medium text-white transition
				active:scale-95 dark:bg-emerald-500"
		>
			Aufgebraucht
		</button>
		<button
			type="button"
			onclick={onClose}
			class="min-h-12 rounded-xl border border-zinc-300 px-6 text-sm transition active:scale-95
				dark:border-zinc-700"
		>
			Fertig
		</button>
	</div>
</div>
