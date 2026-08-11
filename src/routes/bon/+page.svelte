<script lang="ts">
	import { deserialize } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { shrinkForUpload } from '$lib/receipt-image';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type Shot = { id: number; url: string; blob: Blob };

	const MAX_SHOTS = 4;

	let shots = $state<Shot[]>([]);
	let busy = $state(false);
	let preparing = $state(false);
	let error = $state('');
	let nextId = 0;

	// Zwei getrennte Eingaben statt einer:
	//
	//   „Foto aufnehmen" mit capture="environment" springt direkt in die Kamera.
	//   „Aus der Galerie" ohne capture lässt das System seine Auswahl zeigen.
	//
	// Eine einzige Eingabe ohne capture könnte beides — aber dann schiebt iOS
	// bei JEDER Aufnahme erst ein Auswahlblatt dazwischen. Der häufige Fall
	// (Bon liegt vor mir, jetzt knipsen) soll ein Tap bleiben; der seltene
	// Fall darf zwei kosten.
	let cameraInput = $state<HTMLInputElement | null>(null);
	let galleryInput = $state<HTMLInputElement | null>(null);

	async function addFiles(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		// Zurücksetzen, sonst löst dasselbe Foto zweimal hintereinander nichts aus.
		input.value = '';
		if (files.length === 0) return;

		error = '';
		preparing = true;
		try {
			for (const file of files.slice(0, MAX_SHOTS - shots.length)) {
				const blob = await shrinkForUpload(file);
				shots.push({ id: nextId++, url: URL.createObjectURL(blob), blob });
			}
		} finally {
			preparing = false;
		}
	}

	function remove(shot: Shot) {
		URL.revokeObjectURL(shot.url);
		shots = shots.filter((s) => s.id !== shot.id);
	}

	async function analyze() {
		if (shots.length === 0 || busy) return;
		busy = true;
		error = '';

		try {
			const body = new FormData();
			shots.forEach((shot, index) => body.append('images', shot.blob, `bon-${index + 1}.jpg`));

			const response = await fetch('?/analyze', { method: 'POST', body });
			const result = deserialize(await response.text());

			const id = result.type === 'success' ? Number(result.data?.id) : 0;
			if (Number.isInteger(id) && id > 0) {
				for (const shot of shots) URL.revokeObjectURL(shot.url);
				shots = [];
				await goto(resolve('/bon/[id]', { id: String(id) }));
				return;
			}
			error =
				result.type === 'failure'
					? String(result.data?.message ?? 'Das hat nicht geklappt.')
					: 'Das hat nicht geklappt.';
		} catch {
			error = 'Keine Verbindung zum Server.';
		} finally {
			busy = false;
		}
	}
</script>

<PageHeader title="Kassenbon" subtitle="Fotografieren und übernehmen" />

<input
	bind:this={cameraInput}
	type="file"
	accept="image/*"
	capture="environment"
	class="hidden"
	onchange={addFiles}
/>
<input
	bind:this={galleryInput}
	type="file"
	accept="image/*"
	multiple
	class="hidden"
	onchange={addFiles}
/>

{#if data.pending.length > 0}
	<ul class="mb-5 space-y-2">
		{#each data.pending as item (item.id)}
			<li>
				<a
					href={resolve('/bon/[id]', { id: String(item.id) })}
					class="flex min-h-12 items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4
						text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
				>
					<span class="flex-1">
						{item.store ?? 'Bon'} — {item.lines}
						{item.lines === 1 ? 'Zeile' : 'Zeilen'} warten auf Prüfung
					</span>
					<span aria-hidden="true">›</span>
				</a>
			</li>
		{/each}
	</ul>
{/if}

{#if shots.length > 0}
	<ul class="mb-4 grid grid-cols-3 gap-2">
		{#each shots as shot (shot.id)}
			<li class="relative">
				<img
					src={shot.url}
					alt="Aufnahme des Bons"
					class="aspect-[3/4] w-full rounded-xl object-cover"
				/>
				<button
					type="button"
					onclick={() => remove(shot)}
					disabled={busy}
					aria-label="Aufnahme verwerfen"
					class="absolute -top-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full
						bg-zinc-900/80 text-lg leading-none text-white disabled:opacity-50"
				>
					×
				</button>
			</li>
		{/each}
	</ul>
{/if}

{#if shots.length < MAX_SHOTS}
	<button
		type="button"
		onclick={() => cameraInput?.click()}
		disabled={busy || preparing}
		class="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed
			border-zinc-300 py-8 transition active:scale-[0.99] disabled:opacity-50 dark:border-zinc-700"
	>
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
			class="h-10 w-10 text-zinc-400"
			aria-hidden="true"
		>
			<path
				d="M14.5 4h-5L7.2 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3.2L14.5 4Z"
			/>
			<circle cx="12" cy="13.5" r="3.2" />
		</svg>
		<span class="font-medium">
			{shots.length === 0 ? 'Bon fotografieren' : 'Noch eine Aufnahme'}
		</span>
		{#if shots.length === 0}
			<span class="px-6 text-center text-xs text-zinc-400">
				Langer Bon? Oben, Mitte, unten einzeln aufnehmen — kleine Schrift wird sonst unlesbar.
			</span>
		{/if}
	</button>

	<button
		type="button"
		onclick={() => galleryInput?.click()}
		disabled={busy || preparing}
		class="mt-3 w-full text-sm text-zinc-500 underline disabled:opacity-50 dark:text-zinc-400"
	>
		Aus der Galerie wählen
	</button>
{/if}

{#if preparing}
	<p class="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
		Aufnahme wird vorbereitet…
	</p>
{/if}

{#if error}
	<p
		class="mt-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800
			dark:border-red-800 dark:bg-red-950 dark:text-red-200"
		role="alert"
	>
		{error}
	</p>
{/if}

{#if shots.length > 0}
	<button
		type="button"
		onclick={analyze}
		disabled={busy || preparing}
		class="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600
			text-base font-medium text-white transition active:scale-[0.99] disabled:opacity-60
			dark:bg-emerald-500"
	>
		{#if busy}
			<span
				class="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white"
				aria-hidden="true"
			></span>
			Bon wird gelesen…
		{:else}
			{shots.length}
			{shots.length === 1 ? 'Aufnahme' : 'Aufnahmen'} auswerten
		{/if}
	</button>
	{#if busy}
		<p class="mt-2 text-center text-xs text-zinc-400">
			Dauert ein paar Sekunden. Danach kommt der Prüf-Screen.
		</p>
	{/if}
{/if}
