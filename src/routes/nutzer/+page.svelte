<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * Anlegen ist beim allerersten Start die einzige sinnvolle Aktion — dann steht
	 * das Feld offen und hat den Fokus. Gibt es schon Nutzer, ist Wählen der
	 * Normalfall: dann bleibt es hinter einer Zeile, damit unter der letzten
	 * Kachel kein Textfeld liegt, dessen Fehlgriff die Tastatur aufzieht.
	 */
	let creating = $state(data.users.length === 0);
	let newName = $state('');
	let submitting = $state(false);
	let nameInput = $state<HTMLInputElement | null>(null);

	// Wer „Neuer Nutzer" antippt, will tippen. Der Tap aufs Feld danach wäre der
	// zweite für dieselbe Absicht — damit kostet Aufklappen unterm Strich nichts.
	$effect(() => {
		if (creating) nameInput?.focus();
	});

	/** Erster Buchstabe als Anker fürs Auge — schneller erkannt als gelesen. */
	function initial(name: string): string {
		return ([...name.trim()][0] ?? '?').toUpperCase();
	}
</script>

<!--
	Die Kacheln sitzen unten im Daumenbereich, nicht direkt unter der
	Überschrift: dieser Screen hat genau eine Aufgabe, und auf einem großen Gerät
	ist die obere Bildschirmhälfte einhändig nicht zu erreichen. Der untere
	Streifen ist hier frei — die Bottom-Nav ist auf `/nutzer` ausgeblendet
	(siehe `+layout.svelte`), einen FAB oder eine Undo-Leiste gibt es nicht.
-->
<div class="flex min-h-[calc(100dvh-8rem)] flex-col">
	<PageHeader title="Wer bist du?" subtitle="Jeder hat seinen eigenen Bestand." />

	<div class="flex-1"></div>

	{#if data.users.length > 0}
		<ul class="space-y-3">
			{#each data.users as user (user.id)}
				{@const isCurrent = user.id === data.currentUserId}
				<li>
					<!--
						Ein Tap wählt und navigiert weiter — kein „Sichern", keine Rückfrage.
						Absichtlich ohne `use:enhance`: das ist der erste Screen überhaupt,
						und ein nativer POST mit Redirect funktioniert auch, bevor Svelte
						hydriert hat.
					-->
					<form method="POST" action="?/waehlen">
						<input type="hidden" name="userId" value={user.id} />
						<input type="hidden" name="next" value={data.next} />
						<button
							type="submit"
							class="flex min-h-16 w-full items-center gap-4 rounded-2xl border bg-white px-4 py-3
								text-left transition active:scale-[0.99] dark:bg-zinc-900
								{isCurrent ? 'border-emerald-500 dark:border-emerald-600' : 'border-zinc-200 dark:border-zinc-800'}"
						>
							<span
								aria-hidden="true"
								class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg
									font-semibold
									{isCurrent
									? 'bg-emerald-600 text-white dark:bg-emerald-500'
									: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'}"
							>
								{initial(user.name)}
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-lg font-medium">{user.name}</span>
								{#if isCurrent}
									<!-- Zugleich der Weg zurück: wer nur nachsehen wollte, tippt sich
									     selbst an und landet wieder da, wo er herkam. -->
									<span class="block text-xs text-emerald-600 dark:text-emerald-500">
										das bist du gerade
									</span>
								{/if}
							</span>
						</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}

	{#if creating}
		<form
			method="POST"
			action="?/anlegen"
			class="mt-3 flex gap-2"
			onsubmit={() => (submitting = true)}
		>
			<input type="hidden" name="next" value={data.next} />
			<!-- Tastatur ist hier richtig: ein Name lässt sich nicht ertippen wie eine
			     Menge, und angelegt wird ein Nutzer einmal. `enterkeyhint` macht die
			     Eingabetaste zum Abschicken, damit der Weg zum Knopf entfallen kann. -->
			<input
				bind:this={nameInput}
				bind:value={newName}
				type="text"
				name="name"
				placeholder="Name"
				autocomplete="off"
				autocapitalize="words"
				enterkeyhint="go"
				maxlength="40"
				class="min-h-14 flex-1 rounded-2xl border-zinc-300 bg-white text-lg
					dark:border-zinc-700 dark:bg-zinc-800"
			/>
			<button
				type="submit"
				disabled={newName.trim() === '' || submitting}
				class="min-h-14 shrink-0 rounded-2xl bg-emerald-600 px-5 font-medium text-white
					transition active:scale-[0.98] disabled:opacity-40 dark:bg-emerald-500"
			>
				Anlegen
			</button>
		</form>
	{:else}
		<button
			type="button"
			onclick={() => (creating = true)}
			class="mt-3 flex min-h-14 w-full items-center gap-4 rounded-2xl border border-dashed
				border-zinc-300 px-4 text-left text-zinc-500 transition active:bg-zinc-100
				dark:border-zinc-700 dark:text-zinc-400 dark:active:bg-zinc-800"
		>
			<span aria-hidden="true" class="w-11 shrink-0 text-center text-2xl leading-none">+</span>
			<span>Neuer Nutzer</span>
		</button>
	{/if}
</div>
