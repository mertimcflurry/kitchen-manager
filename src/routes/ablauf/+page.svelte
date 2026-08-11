<script lang="ts">
	import { resolve } from '$app/paths';
	import ItemSheet from '$lib/components/ItemSheet.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Snackbar from '$lib/components/Snackbar.svelte';
	import StockRow from '$lib/components/StockRow.svelte';
	import { freshness } from '$lib/date';
	import { post } from '$lib/forms';
	import type { StockRow as Row } from '$lib/server/db/queries';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** Schreibbares $derived: lokal vorgreifen, Server gewinnt beim nächsten Laden. */
	let items = $derived(data.items.map((i) => ({ ...i })));

	let sheetId = $state<number | null>(null);
	const sheetItem = $derived(
		sheetId === null ? null : (items.find((i) => i.id === sheetId) ?? null)
	);
	let undoState = $state<{ id: number; quantity: number; fillLevel: number | null } | null>(null);
	let undoLabel = $state('');

	/**
	 * Drei Blöcke statt einer langen Liste.
	 *
	 * Die Ampelpunkte allein beantworten „was ist noch zu retten" nicht: vier
	 * Rot- und Orangetöne untereinander unterscheiden sich am Handy im
	 * Küchenlicht kaum. Die Überschrift sagt es in Worten, der Punkt bleibt als
	 * schneller Anker in der Zeile.
	 */
	const groups = $derived.by(() => {
		const expired: Row[] = [];
		const now: Row[] = [];
		const week: Row[] = [];

		for (const item of items) {
			if (!item.bestBefore) continue;
			const stage = freshness(item.bestBefore);
			if (stage === 'expired') expired.push(item);
			else if (stage === 'critical') now.push(item);
			else week.push(item);
		}

		return [
			{ key: 'expired', title: 'Abgelaufen', hint: 'Prüfen, dann weg', items: expired },
			{ key: 'now', title: 'Heute und morgen', hint: 'Jetzt einplanen', items: now },
			{ key: 'week', title: 'Diese Woche', hint: '', items: week }
		].filter((g) => g.items.length > 0);
	});

	async function adjust(item: Row, delta: number) {
		const next = Math.max(0, item.quantity + delta);

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

<PageHeader title="Bald schlecht" subtitle="Nach rechts wischen heißt aufgebraucht" />

{#if items.length === 0}
	<div
		class="rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700"
	>
		<p class="text-zinc-500 dark:text-zinc-400">
			Nichts läuft in den nächsten {data.horizonDays} Tagen ab.
		</p>
		{#if data.laterCount > 0}
			<p class="mt-2 text-sm text-zinc-400">
				{data.laterCount}
				{data.laterCount === 1 ? 'Artikel hält' : 'Artikel halten'} länger.
			</p>
		{/if}
	</div>
{:else}
	{#each groups as group (group.key)}
		<section class="mb-5">
			<h2 class="mb-2 flex items-baseline gap-2">
				<span class="text-sm font-semibold">{group.title}</span>
				<span class="text-sm text-zinc-400 tabular-nums">{group.items.length}</span>
				{#if group.hint}
					<span class="ml-auto text-xs text-zinc-400">{group.hint}</span>
				{/if}
			</h2>
			<ul class="space-y-2">
				{#each group.items as item (item.id)}
					<StockRow
						{item}
						showLocation
						onAdjust={adjust}
						onConsume={consume}
						onOpen={(i) => (sheetId = i.id)}
					/>
				{/each}
			</ul>
		</section>
	{/each}

	<!-- Kein Hinzufügen-Knopf auf diesem Screen: hier wird geleert, nicht
	     gefüllt. Der Weg zurück in den vollen Bestand bleibt trotzdem sichtbar. -->
	<p class="mt-6 text-center text-sm text-zinc-400">
		{#if data.laterCount > 0}
			{data.laterCount}
			{data.laterCount === 1 ? 'weiterer Artikel hält' : 'weitere Artikel halten'} länger —
		{/if}
		<a href={resolve('/')} class="underline">zum Bestand</a>
	</p>
{/if}

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
