/**
 * Bon-Fotos verkleinern, bevor sie den Pi verlassen.
 *
 * Läuft im Browser, nicht auf dem Server: ein Handyfoto hat 12 MP und 4 MB,
 * über Tailscale sind das mehrere Sekunden Warten pro Aufnahme — bei drei
 * Aufnahmen der längste Teil des ganzen Vorgangs. Verkleinert wird auf die
 * Kantenlänge, die das Modell ohnehin maximal verarbeitet; alles darüber
 * würde die API selbst wegwerfen.
 */

/**
 * Maximale Kantenlänge, die Sonnet 5 verarbeitet. Genau deshalb ist es nicht
 * Haiku: bei kleiner Bonschrift entscheidet diese Zahl, ob eine Zeile lesbar
 * ist (siehe CLAUDE.md).
 */
export const MAX_EDGE = 2576;

/** Genug für gedruckte Bonschrift, halbiert aber die Dateigröße gegenüber 1.0. */
const JPEG_QUALITY = 0.85;

/**
 * Verkleinert ein Foto auf `MAX_EDGE` und gibt es als JPEG zurück.
 *
 * Geht dabei etwas schief — altes WebView, kein Canvas, ungewöhnliches
 * Format —, wird die Originaldatei zurückgegeben. Ein größeres Bild ist
 * langsam, ein fehlendes Bild ist ein abgebrochener Einkauf.
 */
export async function shrinkForUpload(file: File): Promise<Blob> {
	if (!file.type.startsWith('image/')) return file;

	try {
		// `from-image` dreht nach EXIF: sonst liegt ein Hochkant-Foto quer im
		// Canvas und das Modell liest gedrehte Schrift.
		const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
		const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
		if (scale === 1 && file.type === 'image/jpeg') {
			bitmap.close();
			return file;
		}

		const canvas = document.createElement('canvas');
		canvas.width = Math.round(bitmap.width * scale);
		canvas.height = Math.round(bitmap.height * scale);

		const context = canvas.getContext('2d');
		if (!context) {
			bitmap.close();
			return file;
		}
		context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		bitmap.close();

		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
		);
		return blob ?? file;
	} catch {
		return file;
	}
}
