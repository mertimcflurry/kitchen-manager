<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import {
		defaultLocationFor,
		isCountable,
		LOCATIONS,
		LOCATION_LABELS,
		UNIT_LABELS,
		type Location
	} from '$lib/domain';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * Der Prüfstand lebt im Browser, bis „Alle übernehmen" gedrückt wird.
	 *
	 * Absicht: Korrigieren ist hier die Ausnahme, und jede einzelne Korrektur
	 * sofort zum Pi zu schicken hieße zwanzig Roundtrips für einen Einkauf.
	 * Ein Bon ist ein Vorgang — er wird am Stück bestätigt oder gar nicht.
	 *
	 * `untrack`, weil hier ausdrücklich der Startwert gemeint ist: die Zeilen
	 * gehören ab jetzt dem Bildschirm. Ein `$derived` würde jede Korrektur
	 * verwerfen, sobald irgendetwas die Seitendaten neu lädt.
	 */
	let lines = $state(
		untrack(() =>
			data.receipt.lines.map((line) => ({
				// Der Ort kommt aus der Kategorie, die das Modell ohnehin schon
				// gewählt hat: Tiefkühl in die Truhe, Nudeln in den Vorrat. Ohne
				// das läge ein ganzer Einkauf erst einmal im Kühlschrank und man
				// tippte die Handvoll Ausnahmen einzeln um.
				...line,
				location: defaultLocationFor(line.category),
				keep: true
			}))
		)
	);
	let busy = $state(false);

	const emojiFor = (category: string) =>
		data.categories.find((c) => c.name === category)?.emoji ?? '📦';

	const keeping = $derived(lines.filter((line) => line.keep).length);

	/** Zählbares in Einerschritten, loses in Fünfzigern — sonst tippt man ewig. */
	const stepFor = (unit: string) => (isCountable(unit as 'piece') ? 1 : 50);

	function adjust(index: number, direction: number) {
		const line = lines[index];
		const step = stepFor(line.unit);
		line.quantity = Math.max(step, Math.round(line.quantity + direction * step));
	}

	/**
	 * Ort durchtippen statt auswählen.
	 *
	 * Drei Orte, ein Tap pro Schritt: das ist billiger als ein Auswahlmenü und
	 * verlangt keinen zweiten Bildschirm. Das meiste vom Bon geht ohnehin in den
	 * Kühlschrank — korrigiert wird die Handvoll Tiefkühl- und Vorratssachen.
	 */
	function cycleLocation(index: number) {
		const line = lines[index];
		const next = (LOCATIONS.indexOf(line.location) + 1) % LOCATIONS.length;
		line.location = LOCATIONS[next];
	}

	function setAll(location: Location) {
		for (const line of lines) line.location = location;
	}

	const payload = $derived(
		JSON.stringify(
			lines.map((line) => ({
				id: line.id,
				name: line.name.trim(),
				quantity: line.quantity,
				unit: line.unit,
				location: line.location,
				keep: line.keep
			}))
		)
	);
</script>

<PageHeader
	title="Bon prüfen"
	subtitle={data.receipt.store
		? `${data.receipt.store} · ${lines.length} Zeilen`
		: `${lines.length} Zeilen erkannt`}
/>

<section class="mb-4">
	<h2 class="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Alles nach</h2>
	<div class="flex gap-2">
		{#each LOCATIONS as loc (loc)}
			<button
				type="button"
				onclick={() => setAll(loc)}
				class="min-h-12 flex-1 rounded-xl border border-zinc-300 text-sm transition active:scale-95
					dark:border-zinc-700"
			>
				{LOCATION_LABELS[loc]}
			</button>
		{/each}
	</div>
	<p class="mt-2 text-xs text-zinc-400">Einzeln ändern: auf den Ort in der Zeile tippen.</p>
</section>

<ul class="space-y-2 pb-32">
	{#each lines as line, index (line.id)}
		<li
			class="rounded-2xl border bg-white p-3 dark:bg-zinc-900 {line.keep
				? line.confidence === 'low'
					? 'border-amber-300 dark:border-amber-700'
					: 'border-zinc-200 dark:border-zinc-800'
				: 'border-zinc-200 opacity-50 dark:border-zinc-800'}"
		>
			<div class="flex items-start gap-2">
				<span class="pt-1 text-lg" aria-hidden="true">{emojiFor(line.category)}</span>

				<div class="min-w-0 flex-1">
					<input
						type="text"
						bind:value={line.name}
						disabled={!line.keep}
						aria-label="Name"
						class="w-full border-0 bg-transparent p-0 font-medium focus:ring-0
							{line.keep ? '' : 'line-through'}"
					/>
					<p class="truncate text-xs text-zinc-400">
						{line.rawText}
						{#if line.priceCents}· {(line.priceCents / 100).toFixed(2).replace('.', ',')} €{/if}
					</p>
				</div>

				<button
					type="button"
					onclick={() => (line.keep = !line.keep)}
					aria-label={line.keep ? 'Zeile verwerfen' : 'Zeile doch übernehmen'}
					class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-400
						transition active:bg-zinc-100 dark:active:bg-zinc-800"
				>
					{line.keep ? '×' : '↩'}
				</button>
			</div>

			{#if line.keep}
				<div class="mt-2 flex items-center gap-2">
					<div
						class="flex items-center rounded-xl border border-zinc-200 dark:border-zinc-700"
						role="group"
						aria-label="Menge"
					>
						<button
							type="button"
							onclick={() => adjust(index, -1)}
							aria-label="Weniger"
							class="flex h-11 w-11 items-center justify-center text-lg">−</button
						>
						<span class="min-w-16 text-center text-sm tabular-nums">
							{line.quantity}
							{UNIT_LABELS[line.unit]}
						</span>
						<button
							type="button"
							onclick={() => adjust(index, 1)}
							aria-label="Mehr"
							class="flex h-11 w-11 items-center justify-center text-lg">+</button
						>
					</div>

					<button
						type="button"
						onclick={() => cycleLocation(index)}
						class="min-h-11 rounded-xl border border-zinc-200 px-3 text-sm dark:border-zinc-700"
					>
						{LOCATION_LABELS[line.location]}
					</button>

					{#if line.known}
						<span class="ml-auto text-xs text-emerald-600 dark:text-emerald-500">bekannt</span>
					{:else if line.confidence === 'low'}
						<span class="ml-auto text-xs text-amber-600 dark:text-amber-500">unsicher</span>
					{/if}
				</div>
			{/if}
		</li>
	{/each}
</ul>

<!-- Die eine Hauptaktion, auf der Spur ueber der Bottom-Nav (siehe layout.css). -->
<div class="fixed inset-x-0 z-30 px-4" style="bottom: var(--lane-fab)">
	<div class="mx-auto flex max-w-lg items-center gap-2">
		<form
			method="POST"
			action="?/confirm"
			class="flex-1"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update();
					busy = false;
				};
			}}
		>
			<input type="hidden" name="lines" value={payload} />
			<button
				type="submit"
				disabled={busy || keeping === 0}
				class="flex min-h-14 w-full items-center justify-center rounded-2xl bg-emerald-600
					text-base font-medium text-white shadow-lg transition active:scale-[0.99]
					disabled:opacity-60 dark:bg-emerald-500"
			>
				{keeping === 0 ? 'Nichts ausgewählt' : `${keeping} übernehmen`}
			</button>
		</form>

		<form method="POST" action="?/discard" use:enhance>
			<button
				type="submit"
				disabled={busy}
				aria-label="Bon verwerfen"
				class="flex h-14 w-14 items-center justify-center rounded-2xl border border-zinc-300
					bg-white text-zinc-500 shadow-lg disabled:opacity-60 dark:border-zinc-700
					dark:bg-zinc-900 dark:text-zinc-400"
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.75"
					stroke-linecap="round"
					class="h-5 w-5"
					aria-hidden="true"
				>
					<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
				</svg>
			</button>
		</form>
	</div>
</div>
