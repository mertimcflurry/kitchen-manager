<script lang="ts">
	import type { Snippet } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';

	/**
	 * `action` ist der Platz für eine seltene Nebenaktion — oben rechts, wo der
	 * Daumen nicht von allein hinkommt. Alles Häufige gehört nach unten.
	 */
	type Props = { title: string; subtitle?: string; action?: Snippet };
	let { title, subtitle, action }: Props = $props();

	/**
	 * Avatar-Kreis für den Nutzerwechsel, gespiegelt vom Bon-Kreis unten in der
	 * Nav. Fest in `PageHeader` statt pro Route verdrahtet, damit keine Seite
	 * ihn vergisst — bei mehreren Nutzern ohne Login ist die ständig sichtbare
	 * Erinnerung "wer bin ich gerade" der eigentliche Zweck, nicht nur ein
	 * schnellerer Weg zum Wechseln. Auf `/nutzer` selbst verlinkt er auf sich
	 * selbst, deshalb dort ausgeblendet.
	 */
	const currentUser = $derived(page.data.currentUser as { id: number; name: string } | null);
	const showAvatar = $derived(currentUser !== null && page.url.pathname !== '/nutzer');

	function initial(name: string): string {
		return ([...name.trim()][0] ?? '?').toUpperCase();
	}
</script>

<header class="pt-safe mb-4 flex items-start gap-3">
	<div class="min-w-0 flex-1">
		<h1 class="text-2xl font-semibold tracking-tight">{title}</h1>
		{#if subtitle}
			<p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>
		{/if}
	</div>
	{#if action}
		<div class="shrink-0">{@render action()}</div>
	{/if}
	{#if showAvatar}
		<a
			href="{resolve('/nutzer')}?next={encodeURIComponent(page.url.pathname)}"
			aria-label="Nutzer wechseln, angemeldet als {currentUser?.name}"
			class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-sm
				font-semibold text-zinc-500 transition active:scale-95 dark:bg-zinc-800
				dark:text-zinc-400"
		>
			{initial(currentUser?.name ?? '')}
		</a>
	{/if}
</header>
