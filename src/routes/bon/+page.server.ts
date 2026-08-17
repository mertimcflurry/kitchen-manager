import { fail } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { db } from '$lib/server/db';
import { analyzeReceipt, ReceiptAiError, type ReceiptImage } from '$lib/server/ai/receipt';
import {
	addReceiptImage,
	categoryNames,
	createPendingReceipt,
	discardReceipt,
	pendingReceipts,
	saveParsedLines
} from '$lib/server/db/receipts';
import type { Actions, PageServerLoad } from './$types';

/** Höchstens so viele Aufnahmen pro Bon — drei decken einen langen Kassenbon ab. */
const MAX_IMAGES = 4;

/** Nach dem Verkleinern im Browser liegt ein Bon-Foto weit darunter. */
const MAX_BYTES = 8 * 1024 * 1024;

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
type AllowedType = (typeof ALLOWED_TYPES)[number];

/**
 * Bilder liegen neben der Datenbank, nicht irgendwo unter static/.
 *
 * `data/` ist der Bind-Mount des Containers — was dort liegt, überlebt einen
 * Neubau des Images, und ein Backup von `data/` hat den Bon mit dabei.
 */
function receiptDir(): string {
	return join(dirname(env.DATABASE_URL ?? 'data/kitchen.db'), 'receipts');
}

export const load: PageServerLoad = ({ locals }) => {
	return { pending: pendingReceipts(db, locals.userId) };
};

export const actions: Actions = {
	/**
	 * Aufnahmen entgegennehmen, auswerten lassen, in den Prüf-Screen schicken.
	 *
	 * Der Bon wird angelegt, **bevor** das Modell gefragt wird: geht der Aufruf
	 * schief, bleiben Fotos und Rohantwort unter `discarded` liegen. Genau die
	 * Fälle braucht man später, um den Prompt zu verbessern.
	 */
	analyze: async ({ request, locals }) => {
		const data = await request.formData();
		const files = data.getAll('images').filter((entry): entry is File => entry instanceof File);

		if (files.length === 0) return fail(400, { message: 'Keine Aufnahme dabei.' });
		if (files.length > MAX_IMAGES) {
			return fail(400, { message: `Höchstens ${MAX_IMAGES} Aufnahmen pro Bon.` });
		}
		for (const file of files) {
			if (!ALLOWED_TYPES.includes(file.type as AllowedType)) {
				return fail(400, { message: 'Nur JPEG, PNG oder WebP.' });
			}
			if (file.size > MAX_BYTES) return fail(400, { message: 'Aufnahme zu groß.' });
			if (file.size === 0) return fail(400, { message: 'Aufnahme ist leer.' });
		}

		const receiptId = createPendingReceipt(db, locals.userId);
		const images: ReceiptImage[] = [];

		// Voller Datenträger oder fehlende Rechte im Container: die Aufnahmen
		// bleiben im Browser liegen, also gehört hier ein Satz hin, mit dem man
		// etwas anfangen kann — keine Fehlerseite, die den Bon wegwirft.
		try {
			const dir = receiptDir();
			await mkdir(dir, { recursive: true });

			for (const [index, file] of files.entries()) {
				const buffer = Buffer.from(await file.arrayBuffer());
				const extension = file.type.split('/')[1];
				const path = join(dir, `${receiptId}-${index + 1}.${extension}`);
				await writeFile(path, buffer);
				addReceiptImage(db, receiptId, path, index);
				images.push({ data: buffer.toString('base64'), mediaType: file.type as AllowedType });
			}
		} catch (cause) {
			console.error('[bon] Aufnahme nicht speicherbar', cause);
			discardReceipt(db, locals.userId, receiptId);
			return fail(500, { message: 'Die Aufnahme ließ sich nicht speichern.' });
		}

		let analysis;
		try {
			analysis = await analyzeReceipt(images, categoryNames(db));
		} catch (error) {
			discardReceipt(db, locals.userId, receiptId);
			const known = error instanceof ReceiptAiError;
			if (!known) console.error('[bon] unerwarteter Fehler', error);
			return fail(known && (error as ReceiptAiError).retryable ? 503 : 502, {
				message: known ? (error as ReceiptAiError).message : 'Beim Auswerten ging etwas schief.'
			});
		}

		if (analysis.receipt.lines.length === 0) {
			// Rohantwort behalten: „nichts gefunden" ist der Fall, an dem sich der
			// Prompt verbessern lässt.
			discardReceipt(db, locals.userId, receiptId, analysis.raw);
			return fail(422, {
				message: 'Keine Bonzeile lesbar. Näher ran, mehr Licht, notfalls in zwei Aufnahmen.'
			});
		}

		saveParsedLines(db, receiptId, analysis.receipt);
		// Kein `redirect`: die Seite navigiert selbst und kann dafür die typisierte
		// Route auflösen, statt einen Pfad aus dem Server zu übernehmen.
		return { id: receiptId };
	}
};
