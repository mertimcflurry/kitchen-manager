<script lang="ts">
	import { formatDaysUntil, freshness, type Freshness } from '$lib/date';
	import { formatQuantity, isCountable, LOCATION_LABELS, remainingQuantity } from '$lib/domain';
	import type { StockRow } from '$lib/server/db/queries';
	import FillBar from './FillBar.svelte';

	type Props = {
		item: StockRow;
		onAdjust: (item: StockRow, delta: number) => void;
		onConsume: (item: StockRow) => void;
		onOpen: (item: StockRow) => void;
		/**
		 * Ortsangabe in der Zeile. Im Bestand überflüssig — dort steht der Ort
		 * schon im aktiven Tab. Auf ortsübergreifenden Listen dagegen die Frage,
		 * die als nächste kommt: welche Tür mache ich auf?
		 */
		showLocation?: boolean;
	};
	let { item, onAdjust, onConsume, onOpen, showLocation = false }: Props = $props();

	/** Ab hier gilt die Wischbewegung als „aufgebraucht", nicht als Verrutschen. */
	const SWIPE_THRESHOLD = 96;

	let dx = $state(0);
	let dragging = $state(false);
	let startX = 0;
	let startY = 0;
	let decided = false;

	const stage: Freshness | null = $derived(item.bestBefore ? freshness(item.bestBefore) : null);
	const countable = $derived(isCountable(item.unit));
	// Angebrochene lose Ware zeigt die verrechnete Restmenge, nicht die
	// gekaufte — sonst stehen „200 g" und „50 %" scheinbar im Widerspruch.
	const displayQuantity = $derived(remainingQuantity(item.quantity, item.unit, item.fillLevel));
	const isApproximate = $derived(!countable && item.fillLevel !== null);

	const dotClass: Record<Freshness, string> = {
		expired: 'bg-red-500',
		critical: 'bg-orange-500',
		soon: 'bg-amber-400',
		fine: 'bg-emerald-500'
	};
	const textClass: Record<Freshness, string> = {
		expired: 'text-red-600 dark:text-red-400 font-medium',
		critical: 'text-orange-600 dark:text-orange-400 font-medium',
		soon: 'text-amber-600 dark:text-amber-500',
		fine: 'text-zinc-500 dark:text-zinc-400'
	};

	function onPointerDown(event: PointerEvent) {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		startX = event.clientX;
		startY = event.clientY;
		decided = false;
		dragging = true;
	}

	function onPointerMove(event: PointerEvent) {
		if (!dragging) return;
		const deltaX = event.clientX - startX;
		const deltaY = event.clientY - startY;

		// Erst entscheiden, ob gewischt oder gescrollt wird. Ohne diese Sperre
		// zappelt die Zeile bei jedem vertikalen Scrollen.
		if (!decided) {
			if (Math.abs(deltaX) < 8 && Math.abs(deltaY) < 8) return;
			if (Math.abs(deltaY) > Math.abs(deltaX)) {
				dragging = false;
				dx = 0;
				return;
			}
			decided = true;
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		}

		// Nur nach rechts. Nach links passiert nichts, damit nicht versehentlich
		// zwei Bedeutungen an einer Geste hängen.
		dx = Math.max(0, deltaX);
	}

	function onPointerUp() {
		if (!dragging) return;
		dragging = false;
		if (dx >= SWIPE_THRESHOLD) {
			onConsume(item);
		}
		dx = 0;
	}
</script>

<!-- Die Gesten hängen am <li>: das trägt die Rolle listitem schon von sich aus,
     statt einer erfundenen Rolle nur zur Beruhigung des Linters. -->
<li
	class="relative touch-pan-y overflow-hidden rounded-2xl"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	onpointercancel={onPointerUp}
>
	<!-- Was unter der Zeile zum Vorschein kommt, während gewischt wird. -->
	<div
		class="absolute inset-0 flex items-center bg-emerald-600 pl-5 text-sm font-medium text-white"
		aria-hidden="true"
	>
		{dx >= SWIPE_THRESHOLD ? 'Loslassen: aufgebraucht' : 'Aufgebraucht'}
	</div>

	<div
		class="relative flex items-center gap-3 border border-zinc-200 bg-white p-3
			dark:border-zinc-800 dark:bg-zinc-900"
		style="transform: translateX({dx}px); transition: {dragging
			? 'none'
			: 'transform 180ms ease-out'}"
	>
		{#if stage}
			<span class="h-2.5 w-2.5 shrink-0 rounded-full {dotClass[stage]}" aria-hidden="true"></span>
		{:else}
			<span class="h-2.5 w-2.5 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600"></span>
		{/if}

		<button
			type="button"
			onclick={() => onOpen(item)}
			class="min-w-0 flex-1 text-left"
			aria-label="{item.name} bearbeiten"
		>
			<p class="truncate font-medium">
				<span aria-hidden="true">{item.emoji}</span>
				{item.name}
			</p>
			<p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
				<span class="text-zinc-500 tabular-nums dark:text-zinc-400">
					{isApproximate ? '≈' : ''}{formatQuantity(displayQuantity, item.unit)}
				</span>
				{#if item.fillLevel !== null}
					<FillBar level={item.fillLevel} />
				{/if}
				{#if showLocation}
					<span
						class="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800
							dark:text-zinc-400"
					>
						{LOCATION_LABELS[item.location]}
					</span>
				{/if}
				{#if item.bestBefore && stage}
					<!-- Kein Marker für Schätzungen: fast jedes Datum ist geschätzt, das
					     Zeichen stünde also in fast jeder Zeile und sagte nichts. Ob ein
					     Datum abgetippt oder geraten ist, steht im Detail-Sheet. -->
					<span class={textClass[stage]}>{formatDaysUntil(item.bestBefore)}</span>
				{/if}
			</p>
		</button>

		{#if countable}
			<div class="flex shrink-0 items-center gap-1">
				<button
					type="button"
					onclick={() => onAdjust(item, -1)}
					aria-label="{item.name}: eins weniger"
					class="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-300
						text-xl leading-none transition active:scale-95 active:bg-zinc-100
						dark:border-zinc-700 dark:active:bg-zinc-800"
				>
					−
				</button>
				<button
					type="button"
					onclick={() => onAdjust(item, 1)}
					aria-label="{item.name}: eins mehr"
					class="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600 text-xl
						leading-none text-white transition active:scale-95 dark:bg-emerald-500"
				>
					+
				</button>
			</div>
		{:else}
			<!-- Gewicht und Volumen laufen über den Füllstand, nicht über Stückzahl. -->
			<button
				type="button"
				onclick={() => onOpen(item)}
				aria-label="{item.name}: Füllstand ändern"
				class="flex h-11 shrink-0 items-center rounded-full border border-zinc-300 px-4 text-sm
					transition active:scale-95 dark:border-zinc-700"
			>
				{item.fillLevel === null ? 'öffnen' : `${item.fillLevel}%`}
			</button>
		{/if}
	</div>
</li>
