<script lang="ts">
	import { deserialize } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Snackbar from '$lib/components/Snackbar.svelte';
	import {
		INPUT_UNITS,
		INPUT_UNIT_LABELS,
		LOCATIONS,
		LOCATION_LABELS,
		type InputUnit,
		type Location
	} from '$lib/domain';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let location = $state<Location>('fridge');

	/**
	 * Menge bleibt leer, solange nichts anderes gesagt wird.
	 *
	 * Leer heißt „wie beim letzten Mal" — die App kennt aus dem letzten Kauf,
	 * dass Gouda 400 g sind. Nur wer davon abweicht, tippt etwas ein; der
	 * schnelle Weg über die Chips bleibt ein einziger Tap.
	 */
	let amount = $state('');
	let amountUnit = $state<InputUnit>('piece');
	let showAmount = $state(false);
	let search = $state('');
	let toast = $state('');
	let busy = $state(false);

	const query = $derived(search.trim().toLowerCase());

	const matches = $derived(
		query === '' ? [] : data.all.filter((p) => p.name.toLowerCase().includes(query)).slice(0, 8)
	);

	/** Nur anbieten, wenn wirklich nichts exakt passt. */
	const canCreate = $derived(query !== '' && !data.all.some((p) => p.name.toLowerCase() === query));

	async function post(action: string, fields: Record<string, string>) {
		busy = true;
		try {
			const body = new FormData();
			for (const [key, value] of Object.entries(fields)) body.append(key, value);
			// Nur mitschicken, wenn ausdrücklich etwas eingetragen wurde.
			if (showAmount && amount.trim() !== '') {
				body.append('quantity', amount.trim());
				body.append('unit', amountUnit);
			}

			const response = await fetch(`?/${action}`, { method: 'POST', body });
			const result = deserialize(await response.text());
			if (result.type === 'success') {
				// Die Rückmeldung nennt die tatsächliche Menge — bei leerem Feld
				// sieht man so, worauf der letzte Kauf hinauslief.
				const added = result.data?.amount ? `${result.data.amount} ` : '';
				toast = `${added}${fields.name} eingelagert`;
				search = '';
				await invalidateAll();
			}
		} finally {
			busy = false;
		}
	}

	const addKnown = (id: number, name: string) =>
		post('add', { productId: String(id), name, location });

	const createNew = () => post('create', { name: search.trim(), location });
</script>

<PageHeader title="Hinzufügen" subtitle="Ein Tap pro Artikel" />

<!-- Der Ort gilt für alles, was danach angetippt wird. Einmal setzen statt
     bei jedem Artikel neu auswählen. -->
<section class="mb-5">
	<h2 class="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Wohin</h2>
	<div class="flex gap-2">
		{#each LOCATIONS as loc (loc)}
			<button
				type="button"
				onclick={() => (location = loc)}
				aria-pressed={location === loc}
				class="min-h-12 flex-1 rounded-xl border text-sm transition active:scale-95 {location ===
				loc
					? 'border-emerald-600 bg-emerald-50 font-medium text-emerald-700 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-400'
					: 'border-zinc-300 dark:border-zinc-700'}"
			>
				{LOCATION_LABELS[loc]}
			</button>
		{/each}
	</div>
</section>

<section class="mb-5">
	<div class="mb-2 flex items-center justify-between">
		<h2 class="text-sm font-medium text-zinc-500 dark:text-zinc-400">Menge</h2>
		<button
			type="button"
			onclick={() => (showAmount = !showAmount)}
			aria-expanded={showAmount}
			class="text-xs text-zinc-500 underline dark:text-zinc-400"
		>
			{showAmount ? 'wie beim letzten Mal' : 'Menge angeben'}
		</button>
	</div>
	{#if showAmount}
		<div class="flex gap-2">
			<input
				type="text"
				inputmode="decimal"
				bind:value={amount}
				placeholder="z. B. 400"
				aria-label="Menge"
				class="min-h-12 flex-1 rounded-xl border-zinc-300 bg-white text-sm tabular-nums
					dark:border-zinc-700 dark:bg-zinc-800"
			/>
			<select
				bind:value={amountUnit}
				aria-label="Einheit"
				class="min-h-12 rounded-xl border-zinc-300 bg-white text-sm dark:border-zinc-700
					dark:bg-zinc-800"
			>
				{#each INPUT_UNITS as u (u)}
					<option value={u}>{INPUT_UNIT_LABELS[u]}</option>
				{/each}
			</select>
		</div>
		<p class="mt-2 text-xs text-zinc-400">Gilt für alles, was du danach antippst.</p>
	{:else}
		<p class="text-xs text-zinc-400">
			Übernimmt Menge und Einheit vom letzten Kauf dieses Produkts.
		</p>
	{/if}
</section>

<section class="mb-5">
	<h2 class="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Häufig</h2>
	{#if data.frequent.length === 0}
		<p class="text-sm text-zinc-400">Noch nichts gekauft — nutze die Suche.</p>
	{:else}
		<div class="flex flex-wrap gap-2">
			{#each data.frequent as p (p.id)}
				<button
					type="button"
					disabled={busy}
					onclick={() => addKnown(p.id, p.name)}
					class="flex min-h-12 items-center gap-1.5 rounded-full border border-zinc-300 px-4
						text-sm transition active:scale-95 disabled:opacity-50 dark:border-zinc-700"
				>
					<span aria-hidden="true">{p.emoji}</span>
					{p.name}
				</button>
			{/each}
		</div>
	{/if}
</section>

<section>
	<h2 class="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Suchen oder neu anlegen</h2>
	<input
		type="search"
		bind:value={search}
		placeholder="Name eingeben…"
		autocomplete="off"
		class="min-h-12 w-full rounded-xl border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-800"
	/>

	{#if matches.length > 0}
		<ul class="mt-3 space-y-2">
			{#each matches as p (p.id)}
				<li>
					<button
						type="button"
						disabled={busy}
						onclick={() => addKnown(p.id, p.name)}
						class="flex min-h-12 w-full items-center gap-2 rounded-xl border border-zinc-200
							bg-white px-4 text-left transition active:scale-[0.99] disabled:opacity-50
							dark:border-zinc-800 dark:bg-zinc-900"
					>
						<span aria-hidden="true">{p.emoji}</span>
						<span class="flex-1 truncate">{p.name}</span>
						<span class="text-lg text-emerald-600 dark:text-emerald-500">+</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if canCreate}
		<button
			type="button"
			disabled={busy}
			onclick={createNew}
			class="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600
				font-medium text-white transition active:scale-95 disabled:opacity-50 dark:bg-emerald-500"
		>
			„{search.trim()}" neu anlegen
		</button>
		<p class="mt-2 text-xs text-zinc-400">
			Landet in „Sonstiges" — Kategorie und Haltbarkeit lassen sich später ändern.
		</p>
	{/if}
</section>

<div class="mt-8 text-center">
	<a href={resolve('/')} class="text-sm text-zinc-500 underline dark:text-zinc-400">
		Zurück zum Bestand
	</a>
</div>

{#if toast}
	<Snackbar message={toast} onDismiss={() => (toast = '')} timeout={2500} />
{/if}
