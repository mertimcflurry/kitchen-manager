<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Snackbar from '$lib/components/Snackbar.svelte';
	import { formatDaysUntil } from '$lib/date';
	import { formatQuantity, remainingQuantity } from '$lib/domain';
	import { post } from '$lib/forms';
	import { scaleRecipe } from '$lib/recipe-scale';
	import type { ParsedRecipe } from '$lib/server/ai/recipe-parse';
	import type { CookedSnapshot } from '$lib/server/db/cooking';
	import type { PageData, SubmitFunction } from './$types';

	let { data }: { data: PageData } = $props();

	// Ziele als Literale, damit resolve() sie prüfen kann — wie bei den Ort-Tabs.
	const portionTabs = [
		{ value: 1, route: '/kochen?portionen=1' },
		{ value: 2, route: '/kochen?portionen=2' },
		{ value: 4, route: '/kochen?portionen=4' }
	] as const satisfies ReadonlyArray<{ value: number; route: string }>;

	let recipe = $state<ParsedRecipe | null>(null);
	let busy = $state(false);
	let error = $state('');

	/**
	 * Gesperrt, sobald abgebucht wurde.
	 *
	 * Der Knopf sitzt fest im Daumenbereich und bleibt dort stehen, während man
	 * kocht — ein zweiter Tap darf den Bestand nicht ein zweites Mal senken.
	 * Zurück kommt er über „Rückgängig".
	 */
	let cooked = $state(false);
	/** Gesetzt, wenn „Gekocht" nichts zum Abbuchen fand (nur Grundzutaten/Fehlt-noch). */
	let nothingToBook = $state(false);
	let undoSnapshots = $state<CookedSnapshot[] | null>(null);
	let undoRound = $state(0);

	/** Namen, die schon auf der Einkaufsliste stehen — der Chip antwortet sofort. */
	let listed = $state<string[]>([]);

	/** Tendenz für den nächsten Vorschlag — Chip, kein Muss. */
	let mood = $state<'herzhaft' | 'süß' | null>(null);
	/** Freitext-Wunsch, z. B. „Lasagne" oder „keine Nudeln". */
	let direction = $state('');
	/**
	 * Anders als `mood`: kein Wunsch, sondern ein Ausschluss — deshalb im
	 * Prompt eine harte Vorgabe statt einer Präferenz (siehe `recipe-parse.ts`).
	 * `vegan` schließt `vegetarisch` schon ein, daher eine eigene, unabhängige
	 * Reihe statt einer dritten Option in der Herzhaft/Süß-Zeile.
	 */
	let diet = $state<'vegetarisch' | 'vegan' | null>(null);

	let formEl: HTMLFormElement | undefined = $state();

	/**
	 * Direkteinstieg von „Bald schlecht": `?los=1` löst den ersten Vorschlag
	 * sofort aus, ohne dass man hier noch einmal auf den Knopf tippen muss.
	 * `autoTriggered` verhindert eine Endlosschleife, falls die Anfrage
	 * fehlschlägt — `busy` und `recipe` werden dann wieder frei, das Formular
	 * darf sich beim nächsten Effect-Lauf aber nicht selbst noch einmal abschicken.
	 */
	let autoTriggered = $state(false);
	$effect(() => {
		if (
			!autoTriggered &&
			page.url.searchParams.get('los') === '1' &&
			!recipe &&
			data.urgent.length > 0
		) {
			autoTriggered = true;
			formEl?.requestSubmit();
		}
	});

	const stockIngredients = $derived(
		(recipe?.ingredients ?? [])
			.filter((row) => row.source === 'stock')
			.map((row) => ({ stockItemId: row.stockItemId, amountBase: row.amountBase }))
	);

	/**
	 * Drei Blöcke statt einer Liste mit Beipackzettel.
	 *
	 * Vor dem offenen Kühlschrank ist die Frage nicht „welche Zutat hat welchen
	 * Zustand", sondern „muss ich noch los". Die Überschrift beantwortet das in
	 * einem Blick; ein Symbol je Zeile müsste man erst lernen.
	 */
	const groups = $derived.by(() => {
		const rows = recipe?.ingredients ?? [];
		return [
			{ key: 'stock', title: 'Aus dem Bestand', rows: rows.filter((r) => r.source === 'stock') },
			{ key: 'staple', title: 'Grundzutaten', rows: rows.filter((r) => r.source === 'staple') },
			{ key: 'missing', title: 'Fehlt noch', rows: rows.filter((r) => r.source === 'missing') }
		].filter((group) => group.rows.length > 0);
	});

	function receive(result: unknown): void {
		const next = (result as { recipe?: ParsedRecipe } | undefined)?.recipe;
		if (!next) {
			error = 'Es kam kein Rezept zurück.';
			return;
		}
		recipe = next;
		cooked = false;
		nothingToBook = false;
		listed = [];
		window.scrollTo({ top: 0 });
	}

	/**
	 * Ein Portionswechsel navigiert nur per Link, `recipe` bliebe sonst stehen
	 * und zeigte Mengen, die nicht mehr zur URL passen — deshalb hier auf die
	 * neue Portionenzahl hochgerechnet statt verworfen. Kein neuer KI-Aufruf:
	 * „für 2" ist für 1 mal 2, kein anderes Gericht.
	 */
	$effect(() => {
		if (recipe && recipe.portions !== data.portions) recipe = scaleRecipe(recipe, data.portions);
	});

	const suggest: SubmitFunction = () => {
		busy = true;
		error = '';
		return async ({ result }) => {
			busy = false;
			if (result.type === 'success') receive(result.data);
			else if (result.type === 'failure')
				error = String(result.data?.message ?? 'Das hat nicht geklappt.');
			else error = 'Keine Verbindung zum Server.';
		};
	};

	async function cook() {
		if (!recipe || cooked) return;
		// Optimistisch: der Knopf quittiert sofort, das Abbuchen ist ein
		// SQLite-Schreibvorgang und dauert Millisekunden.
		cooked = true;
		nothingToBook = false;

		const result = await post('gekocht', { ingredients: JSON.stringify(stockIngredients) });
		const snapshots = result.type === 'success' ? result.data?.undo : null;
		if (Array.isArray(snapshots)) {
			if (snapshots.length > 0) {
				undoSnapshots = snapshots as CookedSnapshot[];
				undoRound += 1;
			} else {
				// Nur Grundzutaten/Fehlt-noch — es gab nichts abzubuchen.
				nothingToBook = true;
			}
		} else {
			cooked = false;
			error = 'Das Abbuchen hat nicht geklappt.';
		}
	}

	async function undoCook() {
		const snapshots = undoSnapshots;
		if (!snapshots || snapshots.length === 0) return;

		const result = await post('undo', { snapshots: JSON.stringify(snapshots) });
		if (result.type === 'success') {
			undoSnapshots = null;
			cooked = false;
			nothingToBook = false;
		} else {
			error = 'Rückgängig hat nicht geklappt.';
		}
	}

	async function addToShoppingList(name: string) {
		if (listed.includes(name)) return;
		// Die Einkaufsliste kann Freitext schon (M7) und fängt Doppelte selbst ab —
		// hier braucht es keine zweite Action.
		const result = await post('/einkauf?/addText', { text: name });
		if (result.type === 'success') {
			listed = [...listed, name];
		} else {
			error = 'Konnte nicht zur Einkaufsliste hinzugefügt werden.';
		}
	}
</script>

<PageHeader
	title="Was koche ich?"
	subtitle={recipe ? 'Ein Vorschlag aus dem, was da ist' : 'Portionen wählen, dann fragen'}
/>

<!-- Segmentierte Leiste wie die Ort-Tabs: ein Tap, kein Regler, keine Tastatur.
     Die Wahl steht in der URL und überlebt damit Neuladen und Zurück-Knopf. -->
<nav aria-label="Portionen" class="mb-4 flex gap-1">
	{#each portionTabs as tab (tab.value)}
		{@const isActive = data.portions === tab.value}
		<a
			href={resolve(tab.route)}
			aria-current={isActive ? 'page' : undefined}
			data-sveltekit-noscroll
			class="flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-full text-sm
				font-medium transition-colors {isActive
				? 'bg-emerald-600 text-white dark:bg-emerald-500'
				: 'bg-white text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800'}"
		>
			<span class="tabular-nums">{tab.value}</span>
			<span class={isActive ? '' : 'text-zinc-400'}>
				{tab.value === 1 ? 'Portion' : 'Portionen'}
			</span>
		</a>
	{/each}
</nav>

<!-- Tendenz und Wunsch: beeinflussen den nächsten Vorschlag, ändern aber
     nichts am schon angezeigten Rezept — deshalb keine URL, nur lokaler
     Zustand, den die versteckten Felder im Formular unten mitschicken. -->
<div class="mb-2 flex gap-1">
	{#each ['herzhaft', 'süß'] as const as option (option)}
		{@const isActive = mood === option}
		<button
			type="button"
			onclick={() => (mood = isActive ? null : option)}
			aria-pressed={isActive}
			class="flex min-h-11 flex-1 items-center justify-center rounded-full text-sm font-medium
				transition-colors {isActive
				? 'bg-emerald-600 text-white dark:bg-emerald-500'
				: 'bg-white text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800'}"
		>
			{option === 'herzhaft' ? 'Herzhaft' : 'Süß'}
		</button>
	{/each}
</div>

<!-- Eigene Reihe statt einer dritten Chip-Farbe in der Herzhaft/Süß-Zeile:
     eine Diät ist kein Gegenstück zu einer Tendenz, sondern unabhängig davon
     wählbar. Single-select, weil „vegan" „vegetarisch" schon einschließt. -->
<div class="mb-2 flex gap-1">
	{#each ['vegetarisch', 'vegan'] as const as option (option)}
		{@const isActive = diet === option}
		<button
			type="button"
			onclick={() => (diet = isActive ? null : option)}
			aria-pressed={isActive}
			class="flex min-h-11 flex-1 items-center justify-center rounded-full text-sm font-medium
				transition-colors {isActive
				? 'bg-emerald-600 text-white dark:bg-emerald-500'
				: 'bg-white text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800'}"
		>
			{option === 'vegetarisch' ? 'Vegetarisch' : 'Vegan'}
		</button>
	{/each}
</div>

<input
	type="text"
	bind:value={direction}
	maxlength="80"
	placeholder="Wunsch, z. B. Lasagne oder keine Nudeln"
	class="mb-4 min-h-11 w-full rounded-full border border-zinc-200 bg-white px-4 text-sm text-zinc-900
		placeholder:text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100
		dark:placeholder:text-zinc-500"
/>

{#if error}
	<p
		class="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800
			dark:border-red-800 dark:bg-red-950 dark:text-red-200"
		role="alert"
	>
		{error}
	</p>
{/if}

<!-- pb-40: der Inhalt scrollt unter der festen Leiste durch, die in der
     `--lane-fab`-Spur sitzt (siehe layout.css). Ohne den Abstand läge die
     letzte Zeile darunter. -->
<div class="pb-40">
	{#if recipe}
		<article class="transition-opacity {busy ? 'opacity-40' : ''}">
			<h2 class="text-xl leading-tight font-semibold">{recipe.title}</h2>
			<p class="mt-1 text-sm text-zinc-500 tabular-nums dark:text-zinc-400">
				{recipe.minutes} Min · {recipe.portions}
				{recipe.portions === 1 ? 'Portion' : 'Portionen'}
			</p>

			{#each groups as group (group.key)}
				<section class="mt-5">
					<h3 class="mb-2 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
						{group.title}
					</h3>
					<ul class="space-y-2">
						{#each group.rows as row, index (index)}
							<li
								class="flex min-h-12 items-center gap-3 rounded-xl border border-zinc-200 bg-white
									px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900"
							>
								<span class="min-w-0 flex-1 truncate">{row.name}</span>
								{#if row.amountText}
									<span class="shrink-0 text-sm text-zinc-500 tabular-nums dark:text-zinc-400">
										{row.amountText}
									</span>
								{/if}
								{#if group.key === 'missing'}
									{@const alreadyListed = listed.includes(row.name)}
									<!-- Ein Tap, kein Dialog: höchstens zwei fehlende Zutaten, und der
									     Chip sagt danach selbst, dass es geklappt hat. -->
									<button
										type="button"
										onclick={() => addToShoppingList(row.name)}
										disabled={alreadyListed}
										class="flex min-h-11 shrink-0 items-center gap-1 rounded-full px-3 text-sm
											font-medium transition active:scale-95 {alreadyListed
											? 'text-emerald-700 dark:text-emerald-400'
											: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'}"
									>
										{#if alreadyListed}
											✓ auf der Liste
										{:else}
											+ Einkauf
										{/if}
									</button>
								{/if}
							</li>
						{/each}
					</ul>
				</section>
			{/each}

			<section class="mt-6">
				<h3 class="mb-2 text-sm font-semibold text-zinc-500 dark:text-zinc-400">Zubereitung</h3>
				<ol class="space-y-3">
					{#each recipe.steps as step, index (index)}
						<li class="flex gap-3">
							<span
								class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full
									bg-zinc-200 text-sm font-semibold tabular-nums dark:bg-zinc-800"
								aria-hidden="true"
							>
								{index + 1}
							</span>
							<span class="leading-relaxed">{step}</span>
						</li>
					{/each}
				</ol>
			</section>
		</article>
	{:else if data.urgent.length === 0}
		<div
			class="rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700"
		>
			<p class="text-zinc-500 dark:text-zinc-400">Der Bestand ist leer.</p>
			<p class="mt-1 text-sm text-zinc-400">
				Ohne Zutaten kein Vorschlag — <a href={resolve('/')} class="underline">zum Bestand</a>.
			</p>
		</div>
	{:else}
		<!-- Die Wartezeit trägt Inhalt statt eines Spinners: was ohnehin bald weg
		     muss, kennt die Seite ohne Modell — und genau damit soll gekocht
		     werden. Vor dem Tippen ist dieselbe Liste die Begründung, überhaupt
		     zu fragen. -->
		<section aria-live="polite">
			<h2 class="mb-2 text-sm font-semibold text-zinc-500 dark:text-zinc-400">
				{busy ? 'Sucht ein Gericht — bevorzugt mit:' : 'Sollte bald weg'}
			</h2>
			<ul class="space-y-2">
				{#each data.urgent as item (item.id)}
					<li
						class="flex min-h-12 items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4
							py-2 dark:border-zinc-800 dark:bg-zinc-900 {busy ? 'animate-pulse' : ''}"
					>
						<span class="min-w-0 flex-1 truncate">
							<span aria-hidden="true">{item.emoji}</span>
							{item.name}
						</span>
						<span class="shrink-0 text-sm text-zinc-500 tabular-nums dark:text-zinc-400">
							{formatQuantity(
								remainingQuantity(item.quantity, item.unit, item.fillLevel),
								item.unit
							)}
						</span>
						{#if item.bestBefore}
							<span class="shrink-0 text-sm text-amber-600 dark:text-amber-500">
								{formatDaysUntil(item.bestBefore)}
							</span>
						{/if}
					</li>
				{/each}
			</ul>
			{#if busy}
				<p class="mt-3 text-center text-xs text-zinc-400">
					Dauert 10 bis 20 Sekunden. Das Modell denkt nach, statt zu raten.
				</p>
			{/if}
		</section>
	{/if}
</div>

<!--
	Feste Leiste in der `--lane-fab`-Spur (layout.css): über der Bottom-Nav und
	dem hochstehenden Bon-Knopf, unter der Undo-Leiste bei `--lane-snackbar`.
	Nicht geschätzt — die Spuren sind genau dafür da.
-->
<form
	method="POST"
	action="?/vorschlag"
	use:enhance={suggest}
	bind:this={formEl}
	class="fixed inset-x-0 z-30 mx-auto flex max-w-lg gap-2 px-4"
	style="bottom: var(--lane-fab)"
>
	<input type="hidden" name="portions" value={data.portions} />
	<!-- „Anderer Vorschlag" ist derselbe Aufruf, nur mit einer Zeile mehr im
	     Prompt: der abgelehnte Titel als „nicht schon wieder". -->
	<input type="hidden" name="rejectedTitle" value={recipe?.title ?? ''} />
	<!-- Tendenz und Wunsch sitzen oben als sichtbare Chips/Feld, außerhalb
	     dieses Formulars — hier nur der aktuelle Stand fürs Absenden. -->
	<input type="hidden" name="mood" value={mood ?? ''} />
	<input type="hidden" name="direction" value={direction} />
	<input type="hidden" name="diet" value={diet ?? ''} />

	{#if recipe}
		<button
			type="button"
			onclick={cook}
			disabled={busy || cooked}
			class="flex min-h-14 flex-1 items-center justify-center rounded-2xl bg-emerald-600 text-base
				font-medium text-white shadow-lg transition active:scale-[0.99] disabled:opacity-60
				dark:bg-emerald-500"
		>
			{cooked ? (nothingToBook ? 'Gekocht ✓' : 'Abgebucht ✓') : 'Gekocht'}
		</button>
		<button
			type="submit"
			disabled={busy}
			aria-label="Anderer Vorschlag"
			class="flex min-h-14 shrink-0 items-center justify-center rounded-2xl bg-white px-5 text-base
				font-medium text-zinc-700 shadow-lg ring-1 ring-zinc-200 transition active:scale-[0.99]
				disabled:opacity-60 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-zinc-700"
		>
			{#if busy}
				<span
					class="h-5 w-5 animate-spin rounded-full border-2 border-zinc-400/40 border-t-zinc-500"
					aria-hidden="true"
				></span>
			{:else}
				Anderer
			{/if}
		</button>
	{:else}
		<button
			type="submit"
			disabled={busy || data.urgent.length === 0}
			class="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600
				text-base font-medium text-white shadow-lg transition active:scale-[0.99]
				disabled:opacity-60 dark:bg-emerald-500"
		>
			{#if busy}
				<span
					class="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white"
					aria-hidden="true"
				></span>
				Sucht ein Gericht…
			{:else}
				Rezept vorschlagen
			{/if}
		</button>
	{/if}
</form>

{#if undoSnapshots}
	<!-- {#key}: ein zweites Abbuchen kurz nach dem ersten soll den Timer neu
	     starten, nicht die Restzeit der ersten Leiste erben. Bleibt auch stehen,
	     wenn inzwischen ein neuer Vorschlag geladen wurde — sonst verschwindet
	     das Undo für die schon abgebuchte Menge kommentarlos. -->
	{#key undoRound}
		<Snackbar
			message={`${undoSnapshots.length} Posten abgebucht`}
			actionLabel="Rückgängig"
			onAction={undoCook}
			onDismiss={() => (undoSnapshots = null)}
		/>
	{/key}
{/if}
