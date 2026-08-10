<script lang="ts">
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ItemSheet from '$lib/components/ItemSheet.svelte';
	import LocationTabs from '$lib/components/LocationTabs.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Snackbar from '$lib/components/Snackbar.svelte';
	import StockRow from '$lib/components/StockRow.svelte';
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

	let sheetItem = $state<Row | null>(null);
	let undoState = $state<{ id: number; quantity: number; fillLevel: number | null } | null>(null);
	let undoLabel = $state('');

	/** Ruft eine Form Action auf, ohne dass ein sichtbares Formular nötig ist. */
	async function post(action: string, fields: Record<string, string>) {
		const body = new FormData();
		for (const [key, value] of Object.entries(fields)) body.append(key, value);

		const response = await fetch(`?/${action}`, { method: 'POST', body });
		const result = deserialize(await response.text());
		if (result.type === 'success' || result.type === 'failure') await invalidateAll();
		return result;
	}

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
		sheetItem = null;
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

<PageHeader title="Bestand" subtitle="Was zuerst weg muss, steht oben" />

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
	<ul class="space-y-2">
		{#each items as item (item.id)}
			<StockRow {item} onAdjust={adjust} onConsume={consume} onOpen={(i) => (sheetItem = i)} />
		{/each}
	</ul>
{/if}

<!-- Im Daumenbereich, direkt über der Navigation. -->
<div
	class="fixed inset-x-0 z-30 flex justify-center px-4"
	style="bottom: calc(5.25rem + env(safe-area-inset-bottom, 0px))"
>
	<a
		href={resolve('/hinzufuegen')}
		class="flex min-h-12 w-full max-w-md items-center justify-center gap-2 rounded-full
			bg-zinc-900 font-medium text-white shadow-lg transition active:scale-95
			dark:bg-zinc-100 dark:text-zinc-900"
	>
		<span class="text-lg leading-none">+</span> Artikel hinzufügen
	</a>
</div>

{#if sheetItem}
	<ItemSheet item={sheetItem} onClose={() => (sheetItem = null)} onConsume={consume} />
{/if}

{#if undoState}
	<Snackbar
		message={undoLabel}
		actionLabel="Rückgängig"
		onAction={undo}
		onDismiss={() => (undoState = null)}
	/>
{/if}
