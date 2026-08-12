<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { post } from '$lib/forms';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * Schreibbares $derived wie im Bestand: die Liste kommt vom Server, darf
	 * aber lokal vorgreifen. Im Laden steht man mit einem Balken Empfang vor dem
	 * Regal — das Häkchen muss sofort kommen, nicht nach dem Roundtrip.
	 */
	let open = $derived(data.open.map((row) => ({ ...row })));
	let done = $derived(data.done.map((row) => ({ ...row })));

	let text = $state('');

	/**
	 * Abhaken heißt hier nicht löschen: der Posten rutscht nach unten und kann
	 * zurückgeholt werden. Das ist das Undo für den Fehlgriff im Laden — ohne
	 * Snackbar, ohne Timer, ohne Dialog. Wer sechs Sekunden später merkt, dass
	 * er das falsche Häkchen gesetzt hat, findet die Zeile noch.
	 */
	async function toggle(id: number, nextDone: boolean) {
		if (nextDone) {
			const row = open.find((r) => r.id === id);
			if (!row) return;
			open = open.filter((r) => r.id !== id);
			done = [...done, { ...row, isDone: true }];
		} else {
			const row = done.find((r) => r.id === id);
			if (!row) return;
			done = done.filter((r) => r.id !== id);
			open = [...open, { ...row, isDone: false }];
		}

		await post('toggle', { id: String(id), done: String(nextDone) });
	}

	async function addProduct(productId: number, name: string, emoji: string) {
		// Optimistisch mit vorläufiger ID: der Server vergibt gleich die echte,
		// `invalidateAll` in post() zieht sie nach.
		open = [...open, { id: -Date.now(), name, emoji, productId, isDone: false }];
		await post('addProduct', { productId: String(productId), source: 'suggested' });
	}

	async function addText() {
		const value = text.trim();
		if (value === '') return;
		text = '';
		open = [...open, { id: -Date.now(), name: value, emoji: '📝', productId: null, isDone: false }];
		await post('addText', { text: value });
	}
</script>

<PageHeader
	title="Einkauf"
	subtitle={open.length === 0 ? 'Nichts offen' : `${open.length} offen`}
/>

{#if open.length === 0 && done.length === 0}
	<div
		class="rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700"
	>
		<p class="text-zinc-500 dark:text-zinc-400">Die Liste ist leer.</p>
		<p class="mt-1 text-sm text-zinc-400">Unten eintippen oder einen Vorschlag antippen.</p>
	</div>
{:else}
	<!-- Die ganze Zeile ist das Ziel, nicht ein Kästchen daneben: im Laden tippt
	     man einhändig und im Gehen. -->
	<ul class="space-y-2">
		{#each open as row (row.id)}
			<li>
				<button
					type="button"
					onclick={() => toggle(row.id, true)}
					class="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-zinc-200
						bg-white px-4 text-left transition active:scale-[0.99] dark:border-zinc-800
						dark:bg-zinc-900"
				>
					<span
						class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2
							border-zinc-300 dark:border-zinc-600"
						aria-hidden="true"
					></span>
					<span class="flex-1 truncate">
						<span aria-hidden="true">{row.emoji}</span>
						{row.name}
					</span>
				</button>
			</li>
		{/each}
	</ul>
{/if}

<section class="mt-6">
	<h2 class="mb-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">Dazu</h2>

	<div class="flex gap-2">
		<input
			type="text"
			bind:value={text}
			onkeydown={(event) => {
				if (event.key === 'Enter') {
					event.preventDefault();
					addText();
				}
			}}
			placeholder="Was fehlt?"
			enterkeyhint="done"
			autocomplete="off"
			aria-label="Auf die Liste setzen"
			class="min-h-12 flex-1 rounded-xl border-zinc-300 bg-white dark:border-zinc-700
				dark:bg-zinc-800"
		/>
		<button
			type="button"
			onclick={addText}
			disabled={text.trim() === ''}
			aria-label="Auf die Liste setzen"
			class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-2xl
				leading-none text-white transition active:scale-95 disabled:opacity-40
				dark:bg-emerald-500"
		>
			<span class="-mt-0.5">+</span>
		</button>
	</div>

	{#if data.suggestions.length > 0}
		<!-- Kein eigener Screen und keine Einstellung: was man mindestens zweimal
		     gekauft hat und gerade nicht dahat, steht als Chip da und ist einen
		     Tap entfernt. -->
		<p class="mt-4 mb-2 text-xs text-zinc-400">Öfter gekauft, gerade nicht da</p>
		<div class="flex flex-wrap gap-2">
			{#each data.suggestions as suggestion (suggestion.productId)}
				<button
					type="button"
					onclick={() => addProduct(suggestion.productId, suggestion.name, suggestion.emoji)}
					class="flex min-h-12 items-center gap-1.5 rounded-full border border-zinc-300 px-4
						text-sm transition active:scale-95 dark:border-zinc-700"
				>
					<span aria-hidden="true">{suggestion.emoji}</span>
					{suggestion.name}
					<span class="text-emerald-600 dark:text-emerald-500">+</span>
				</button>
			{/each}
		</div>
	{/if}
</section>

{#if done.length > 0}
	<section class="mt-8">
		<div class="mb-2 flex items-center justify-between">
			<h2 class="text-sm font-medium text-zinc-500 dark:text-zinc-400">
				Erledigt ({done.length})
			</h2>
			<button
				type="button"
				onclick={() => {
					done = [];
					post('clearDone', {});
				}}
				class="min-h-11 text-sm text-zinc-500 underline dark:text-zinc-400"
			>
				wegräumen
			</button>
		</div>
		<ul class="space-y-2">
			{#each done as row (row.id)}
				<li>
					<button
						type="button"
						onclick={() => toggle(row.id, false)}
						class="flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-left
							text-zinc-400 transition active:scale-[0.99] dark:text-zinc-500"
					>
						<span
							class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600
								text-sm text-white dark:bg-emerald-500"
							aria-hidden="true">✓</span
						>
						<span class="flex-1 truncate line-through">{row.name}</span>
					</button>
				</li>
			{/each}
		</ul>
	</section>
{/if}
