<script lang="ts">
	type Props = {
		message: string;
		actionLabel?: string;
		onAction?: () => void;
		onDismiss: () => void;
		/** Millisekunden bis zum automatischen Ausblenden. */
		timeout?: number;
	};
	let { message, actionLabel, onAction, onDismiss, timeout = 6000 }: Props = $props();

	// Sechs Sekunden sind lang genug, um „huch" zu denken und zu tippen, und
	// kurz genug, dass die Leiste nicht im Weg steht.
	$effect(() => {
		const handle = setTimeout(onDismiss, timeout);
		return () => clearTimeout(handle);
	});
</script>

<!-- Eigene Spur oberhalb des Hinzufuegen-Knopfes (siehe layout.css). Die Leiste
     ist breit und liegt oben auf — teilte sie sich die Spur mit dem Knopf,
     deckte sie ihn sechs Sekunden lang zu. Lieber immer derselbe Platz als
     einer, der davon abhaengt, welcher Screen gerade offen ist. -->
<div
	role="status"
	aria-live="polite"
	class="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
	style="bottom: var(--lane-snackbar)"
>
	<div
		class="pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl bg-zinc-900 px-4
			py-3 text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
	>
		<span class="min-w-0 flex-1 truncate text-sm">{message}</span>
		{#if actionLabel && onAction}
			<button
				type="button"
				onclick={onAction}
				class="-my-1 shrink-0 rounded-full px-3 py-2 text-sm font-semibold text-emerald-400
					active:bg-white/10 dark:text-emerald-600 dark:active:bg-black/10"
			>
				{actionLabel}
			</button>
		{/if}
	</div>
</div>
