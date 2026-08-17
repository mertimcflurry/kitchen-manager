<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Snackbar from '$lib/components/Snackbar.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** Kurze Bestätigung an der Zeile, weil es keinen Sichern-Knopf gibt. */
	let savedId = $state<number | null>(null);
	let error = $state('');
	let flash: ReturnType<typeof setTimeout> | undefined;

	function markSaved(id: number) {
		savedId = id;
		clearTimeout(flash);
		flash = setTimeout(() => (savedId = null), 1600);
	}

	/**
	 * Speichert beim Verlassen des Feldes.
	 *
	 * `change` statt `input`: bei jedem Zeichen zu speichern hieße, dass „14"
	 * unterwegs einmal als „1" in der Datenbank landet.
	 */
	function saveOnChange(event: Event) {
		(event.currentTarget as HTMLElement).closest('form')?.requestSubmit();
	}
</script>

<PageHeader title="Einstellungen" subtitle="Wie lange hält was" />

<p class="mb-5 text-sm text-zinc-500 dark:text-zinc-400">
	Diese Werte schätzen das Haltbarkeitsdatum, wenn du etwas <strong class="font-medium"
		>neu einlagerst</strong
	>. Schon Eingelagertes behält sein Datum — das änderst du an der Zeile im Bestand.
</p>

<ul class="space-y-3">
	<li>
		<!--
			Wechseln ist ein Link, kein Formular: /nutzer stellt die Auswahl selbst,
			`next` bringt danach hierher zurück. `?next=` statt Zielrelativität, weil
			resolve() für /nutzer keine Query-Parameter kennt.
		-->
		<a
			href="{resolve('/nutzer')}?next={encodeURIComponent(resolve('/einstellungen'))}"
			class="flex min-h-16 items-center gap-4 rounded-2xl border border-zinc-200 bg-white px-4
				py-3 transition active:scale-[0.99] dark:border-zinc-800 dark:bg-zinc-900"
		>
			<span
				aria-hidden="true"
				class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-100
					text-lg font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
			>
				{(data.currentUser?.name.trim()[0] ?? '?').toUpperCase()}
			</span>
			<span class="min-w-0 flex-1">
				<span class="block text-xs text-zinc-500 dark:text-zinc-400">Angemeldet als</span>
				<span class="block truncate text-lg font-medium">
					{data.currentUser?.name ?? 'Unbekannt'}
				</span>
			</span>
			<span aria-hidden="true" class="shrink-0 text-sm text-zinc-400 dark:text-zinc-500">
				Wechseln
			</span>
		</a>
	</li>

	{#each data.categories as category (category.id)}
		<li
			class="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
		>
			<div class="mb-3 flex items-center gap-2">
				<span aria-hidden="true">{category.emoji}</span>
				<h2 class="min-w-0 flex-1 truncate font-medium">{category.name}</h2>
				{#if savedId === category.id}
					<span class="text-xs text-emerald-600 dark:text-emerald-500">gespeichert</span>
				{/if}
			</div>

			<!-- Hier ist die Tastatur richtig: man sitzt, macht es selten, und „14"
			     zu tippen schlägt vierzehnmal auf ein Plus zu drücken. -->
			<form
				method="POST"
				action="?/update"
				use:enhance={({ formElement }) => {
					return async ({ result }) => {
						if (result.type === 'success') {
							markSaved(category.id);
						} else {
							error = 'Nicht gespeichert — bitte ganze Tage eintragen.';
							await invalidateAll();
							// `invalidateAll` allein reicht nicht: Svelte überspringt eine
							// erneute `value`-Zuweisung, wenn sich der serverseitige Wert
							// durch den Fehlschlag gar nicht geändert hat (set_value-Cache).
							// Das Feld direkt zurückschreiben, statt auf Reaktivität zu bauen.
							const defaultInput = formElement.elements.namedItem(
								'defaultShelfLifeDays'
							) as HTMLInputElement | null;
							const openedInput = formElement.elements.namedItem(
								'openedShelfLifeDays'
							) as HTMLInputElement | null;
							if (defaultInput) defaultInput.value = String(category.defaultShelfLifeDays);
							if (openedInput) {
								openedInput.value =
									category.openedShelfLifeDays === null ? '' : String(category.openedShelfLifeDays);
							}
						}
					};
				}}
				class="grid grid-cols-2 gap-3"
			>
				<input type="hidden" name="id" value={category.id} />

				<div>
					<label
						for="default-{category.id}"
						class="mb-1 block text-xs text-zinc-500 dark:text-zinc-400"
					>
						hält Tage
					</label>
					<input
						id="default-{category.id}"
						name="defaultShelfLifeDays"
						type="text"
						inputmode="numeric"
						value={category.defaultShelfLifeDays}
						onchange={saveOnChange}
						class="min-h-12 w-full rounded-xl border-zinc-300 bg-white text-center tabular-nums
							dark:border-zinc-700 dark:bg-zinc-800"
					/>
				</div>

				<div>
					<label
						for="opened-{category.id}"
						class="mb-1 block text-xs text-zinc-500 dark:text-zinc-400"
					>
						offen noch Tage
					</label>
					<input
						id="opened-{category.id}"
						name="openedShelfLifeDays"
						type="text"
						inputmode="numeric"
						value={category.openedShelfLifeDays ?? ''}
						placeholder="—"
						onchange={saveOnChange}
						class="min-h-12 w-full rounded-xl border-zinc-300 bg-white text-center tabular-nums
							dark:border-zinc-700 dark:bg-zinc-800"
					/>
				</div>
			</form>
		</li>
	{/each}
</ul>

<p class="mt-4 text-xs text-zinc-400">
	Rechtes Feld leer heißt: Öffnen ändert am Datum nichts — richtig für Tiefkühl und Trockenvorrat.
</p>

<div class="mt-8 text-center">
	<a href={resolve('/')} class="text-sm text-zinc-500 underline dark:text-zinc-400">
		Zurück zum Bestand
	</a>
</div>

{#if error}
	<Snackbar message={error} onDismiss={() => (error = '')} timeout={3500} />
{/if}
