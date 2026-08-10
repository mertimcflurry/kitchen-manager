<script lang="ts">
	import { enhance } from '$app/forms';
	import type { StockRow } from '$lib/server/db/queries';
	import {
		FILL_LABELS,
		FILL_LEVELS,
		INPUT_UNITS,
		INPUT_UNIT_LABELS,
		LOCATIONS,
		LOCATION_LABELS,
		isCountable,
		toInputUnit
	} from '$lib/domain';
	import FillBar from './FillBar.svelte';

	type Props = { item: StockRow; onClose: () => void; onConsume: (item: StockRow) => void };
	let { item, onClose, onConsume }: Props = $props();

	const isOpen = $derived(item.fillLevel !== null);
	/** Mehrere verschlossene Einheiten: eine davon wird abgeteilt, nicht alle markiert. */
	const splitsOnOpen = $derived(isCountable(item.unit) && item.quantity > 1);

	/** Anzeige in der natürlichen Einheit: 1500 g erscheinen als 1,5 kg. */
	const amount = $derived(toInputUnit(item.quantity, item.unit));

	/**
	 * Jede Änderung sichert sich selbst.
	 *
	 * Ein „Sichern"-Knopf kostet bei jeder Korrektur einen zusätzlichen Tap und
	 * lässt einen im Zweifel stehen, ob die Änderung angekommen ist. `change`
	 * statt `input`: erst beim Verlassen des Feldes, nicht bei jedem Zeichen.
	 */
	function saveOnChange(event: Event) {
		(event.currentTarget as HTMLElement).closest('form')?.requestSubmit();
	}

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

	<section class="mb-6">
		{#if isOpen}
			<!-- Füllstand: vier Knöpfe, kein Regler. Im Stehen trifft man Stufen,
			     keine Prozente. -->
			<div class="mb-2 flex items-center justify-between">
				<h3 class="text-sm font-medium text-zinc-500 dark:text-zinc-400">Füllstand</h3>
				<FillBar level={item.fillLevel ?? 0} />
			</div>
			<form method="POST" action="?/fill" use:enhance class="flex gap-2">
				<input type="hidden" name="id" value={item.id} />
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
			<form method="POST" action="?/fill" use:enhance class="mt-2">
				<input type="hidden" name="id" value={item.id} />
				<!-- Rückweg für den Fehlgriff. Das Datum bleibt, wie es ist — was
				     einmal offen war, wird nicht wieder länger haltbar. -->
				<button
					type="submit"
					name="level"
					value=""
					class="text-xs text-zinc-500 underline dark:text-zinc-400"
				>
					doch nicht geöffnet
				</button>
			</form>
		{:else}
			<h3 class="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Angebrochen?</h3>
			<form method="POST" action="?/open" use:enhance>
				<input type="hidden" name="id" value={item.id} />
				<button
					type="submit"
					class="min-h-12 w-full rounded-xl border border-zinc-300 text-sm transition
						active:scale-95 dark:border-zinc-700"
				>
					{splitsOnOpen ? 'Eine öffnen' : 'Öffnen'}
				</button>
			</form>
			<p class="mt-2 text-xs text-zinc-400">
				{#if splitsOnOpen}
					Wird als eigener Posten abgeteilt — die übrigen {item.quantity - 1} bleiben verschlossen.
				{:else}
					Geöffnetes bekommt ein kürzeres Haltbarkeitsdatum.
				{/if}
			</p>
		{/if}
	</section>

	<section class="mb-6">
		<h3 class="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Menge</h3>
		<form method="POST" action="?/update" use:enhance class="flex gap-2">
			<input type="hidden" name="id" value={item.id} />
			<input
				type="text"
				inputmode="decimal"
				name="quantity"
				value={amount.quantity}
				onchange={saveOnChange}
				aria-label="Menge"
				class="min-h-12 flex-1 rounded-xl border-zinc-300 bg-white text-sm tabular-nums
					dark:border-zinc-700 dark:bg-zinc-800"
			/>
			<select
				name="unit"
				value={amount.unit}
				onchange={saveOnChange}
				aria-label="Einheit"
				class="min-h-12 rounded-xl border-zinc-300 bg-white text-sm dark:border-zinc-700
					dark:bg-zinc-800"
			>
				{#each INPUT_UNITS as u (u)}
					<option value={u}>{INPUT_UNIT_LABELS[u]}</option>
				{/each}
			</select>
		</form>
		<p class="mt-2 text-xs text-zinc-400">
			kg und l werden intern in g und ml abgelegt, damit Mengen vergleichbar bleiben.
		</p>
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
		<form method="POST" action="?/update" use:enhance>
			<input type="hidden" name="id" value={item.id} />
			<input
				type="date"
				name="bestBefore"
				value={toDateInput(item.bestBefore)}
				onchange={saveOnChange}
				class="min-h-12 w-full rounded-xl border-zinc-300 bg-white text-sm dark:border-zinc-700
					dark:bg-zinc-800"
			/>
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
			Schließen
		</button>
	</div>
</div>
