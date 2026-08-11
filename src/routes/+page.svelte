<script lang="ts">
	import { resolve } from '$app/paths';
	import ItemSheet from '$lib/components/ItemSheet.svelte';
	import LocationTabs from '$lib/components/LocationTabs.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Snackbar from '$lib/components/Snackbar.svelte';
	import StockRow from '$lib/components/StockRow.svelte';
	import { post } from '$lib/forms';
	import type { StockRow as Row } from '$lib/server/db/queries';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * Schreibbares $derived: die Liste kommt vom Server, darf aber lokal
	 * vorgreifen. Sobald neue Serverdaten eintreffen, wird die Ableitung neu
	 * berechnet und der Server gewinnt — genau das Verhalten, das optimistische
	 * Updates brauchen, ohne eigenen Abgleich.
	 */
	let items = $derived(data.items.map((i) => ({ ...i })));

	/**
	 * Das Sheet merkt sich nur die ID, nicht den Artikel.
	 *
	 * Hielte es eine Kopie, zeigte es nach dem Speichern weiter den Stand von
	 * dem Moment, in dem es geöffnet wurde — die Liste dahinter aktualisiert
	 * sich, das Formular nicht. Über die ID nachzuschlagen heißt: eine Quelle.
	 */
	let sheetId = $state<number | null>(null);
	const sheetItem = $derived(
		sheetId === null ? null : (items.find((i) => i.id === sheetId) ?? null)
	);
	let undoState = $state<{ id: number; quantity: number; fillLevel: number | null } | null>(null);
	let undoLabel = $state('');

	async function adjust(item: Row, delta: number) {
		const next = Math.max(0, item.quantity + delta);

		// Optimistisch: die Zeile reagiert im selben Frame, nicht erst nach dem
		// Roundtrip zum Pi.
		if (next === 0) {
			items = items.filter((i) => i.id !== item.id);
			undoState = { id: item.id, quantity: item.quantity, fillLevel: item.fillLevel };
			undoLabel = `${item.name} aufgebraucht`;
		} else {
			const target = items.find((i) => i.id === item.id);
			if (target) target.quantity = next;
		}

		await post('adjust', { id: String(item.id), delta: String(delta) });
	}

	async function consume(item: Row) {
		items = items.filter((i) => i.id !== item.id);
		sheetId = null;
		undoLabel = `${item.name} aufgebraucht`;
		undoState = { id: item.id, quantity: item.quantity, fillLevel: item.fillLevel };

		await post('consume', { id: String(item.id) });
	}

	async function undo() {
		const snapshot = undoState;
		undoState = null;
		if (!snapshot) return;

		await post('undo', {
			id: String(snapshot.id),
			quantity: String(snapshot.quantity),
			fillLevel: snapshot.fillLevel === null ? '' : String(snapshot.fillLevel)
		});
	}
</script>

<PageHeader title="Bestand" subtitle="Was zuerst weg muss, steht oben">
	{#snippet action()}
		<!-- Oben rechts ist für den Daumen unbequem — für die Einstellungen genau
		     richtig: man öffnet sie im Sitzen, ein paarmal im Jahr, und ein
		     Fehlgriff daneben wäre ärgerlicher als der eine weite Griff. -->
		<a
			href={resolve('/einstellungen')}
			aria-label="Einstellungen"
			class="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-zinc-500 transition
				active:bg-zinc-200 dark:text-zinc-400 dark:active:bg-zinc-800"
		>
			<svg
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="1.75"
				stroke-linecap="round"
				class="h-6 w-6"
				aria-hidden="true"
			>
				<path d="M3 7h18M3 12h18M3 17h18" />
				<circle cx="9" cy="7" r="2.2" fill="currentColor" stroke="none" />
				<circle cx="16" cy="12" r="2.2" fill="currentColor" stroke="none" />
				<circle cx="7" cy="17" r="2.2" fill="currentColor" stroke="none" />
			</svg>
		</a>
	{/snippet}
</PageHeader>

<LocationTabs active={data.location} counts={data.counts} />

{#if items.length === 0}
	<div
		class="rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700"
	>
		<p class="text-zinc-500 dark:text-zinc-400">
			{data.location ? 'Hier liegt gerade nichts.' : 'Der Bestand ist leer.'}
		</p>
	</div>
{:else}
	<!-- pb-20 zusaetzlich zum pb-nav des Layouts: die letzte Zeile soll nicht
	     unter dem FAB verschwinden, dessen `--lane-fab`-Spur `.pb-nav` (4.5rem)
	     nicht kennt. -->
	<ul class="space-y-2 pb-20">
		{#each items as item (item.id)}
			<StockRow {item} onAdjust={adjust} onConsume={consume} onOpen={(i) => (sheetId = i.id)} />
		{/each}
	</ul>
{/if}

<!-- Kleiner Kreis im Daumenbereich rechts, statt einer Leiste quer ueber die
     Liste: die Aktion ist haeufig genug fuer einen festen Platz, aber nicht
     wichtig genug, um die Haelfte der letzten Zeile zu verdecken.
     `--lane-fab` ist die zweite Spur ueber der Bottom-Nav, siehe layout.css. -->
<a
	href={resolve('/hinzufuegen')}
	aria-label="Artikel hinzufügen"
	class="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-900
		text-3xl leading-none text-white shadow-lg transition active:scale-95 dark:bg-zinc-100
		dark:text-zinc-900"
	style="bottom: var(--lane-fab)"
>
	<span class="-mt-0.5">+</span>
</a>

{#if sheetItem}
	<ItemSheet item={sheetItem} onClose={() => (sheetId = null)} onConsume={consume} />
{/if}

{#if undoState}
	<!-- {#key}: eine zweite "aufgebraucht"-Geste kurz nach der ersten soll den
	     Timer neu starten, nicht die Restzeit der ersten Snackbar erben. Ohne
	     das key bleibt dieselbe Komponenteninstanz gemountet, weil das {#if} durchgehend
	     wahr bleibt. -->
	{#key undoState.id}
		<Snackbar
			message={undoLabel}
			actionLabel="Rückgängig"
			onAction={undo}
			onDismiss={() => (undoState = null)}
		/>
	{/key}
{/if}
