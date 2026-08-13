/**
 * Erzeugt die PWA-Icons als reine PNGs, ohne Bildbibliothek — auf dem Pi ist
 * weder ImageMagick noch sharp installiert, und für ein einmaliges,
 * geometrisches Icon reicht das eingebaute `zlib` (inklusive `zlib.crc32`,
 * seit Node 21 dabei).
 *
 * Motiv: ein simpler Kühlschrank-Umriss in Weiß auf Emerald — passend zum
 * `theme-color` aus `app.html` und zum Küchenthema der App.
 *
 * Erneut ausführen mit: node scripts/generate-icons.mjs
 */
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BG = [0x05, 0x96, 0x69]; // #059669, dasselbe Emerald wie theme-color
const FG = [0xff, 0xff, 0xff];

function crc(buf) {
	return crc32(buf) >>> 0;
}

function chunk(type, data) {
	const typeBuf = Buffer.from(type, 'ascii');
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const crcBuf = Buffer.alloc(4);
	crcBuf.writeUInt32BE(crc(Buffer.concat([typeBuf, data])));
	return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
	const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

	const ihdrData = Buffer.alloc(13);
	ihdrData.writeUInt32BE(width, 0);
	ihdrData.writeUInt32BE(height, 4);
	ihdrData[8] = 8; // bit depth
	ihdrData[9] = 6; // color type: RGBA
	ihdrData[10] = 0;
	ihdrData[11] = 0;
	ihdrData[12] = 0;
	const ihdr = chunk('IHDR', ihdrData);

	// Jede Scanline mit Filterbyte 0 (kein Filter) — bei einem flachen,
	// großflächigen Motiv gewinnt man mit Filtern hier nichts.
	const raw = Buffer.alloc((width * 4 + 1) * height);
	for (let y = 0; y < height; y++) {
		const rowStart = y * (width * 4 + 1);
		raw[rowStart] = 0;
		rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
	}
	const idat = chunk('IDAT', deflateSync(raw));
	const iend = chunk('IEND', Buffer.alloc(0));

	return Buffer.concat([signature, ihdr, idat, iend]);
}

/** Canvas als RGBA-Puffer, mit Hintergrundfarbe vorbelegt. */
function createCanvas(size, bg) {
	const px = Buffer.alloc(size * size * 4);
	for (let i = 0; i < size * size; i++) {
		px[i * 4] = bg[0];
		px[i * 4 + 1] = bg[1];
		px[i * 4 + 2] = bg[2];
		px[i * 4 + 3] = 255;
	}
	return px;
}

function setPixel(px, size, x, y, color) {
	if (x < 0 || y < 0 || x >= size || y >= size) return;
	const i = (y * size + x) * 4;
	px[i] = color[0];
	px[i + 1] = color[1];
	px[i + 2] = color[2];
	px[i + 3] = 255;
}

/** Gefülltes Rechteck mit abgerundeten Ecken, per Abstandstest je Pixel. */
function fillRoundedRect(px, size, x0, y0, x1, y1, radius, color) {
	for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
		for (let x = Math.floor(x0); x < Math.ceil(x1); x++) {
			const cx = x < x0 + radius ? x0 + radius : x > x1 - radius ? x1 - radius : null;
			const cy = y < y0 + radius ? y0 + radius : y > y1 - radius ? y1 - radius : null;
			if (cx !== null && cy !== null) {
				const dx = x + 0.5 - cx;
				const dy = y + 0.5 - cy;
				if (dx * dx + dy * dy > radius * radius) continue;
			}
			setPixel(px, size, x, y, color);
		}
	}
}

/** Der eigentliche Kühlschrank: Umriss als Ring (großes Rechteck minus kleinerem), Trennlinie, zwei Griffe. */
function drawFridgeIcon(size) {
	const px = createCanvas(size, BG);

	const bodyX0 = size * 0.28;
	const bodyX1 = size * 0.72;
	const bodyY0 = size * 0.13;
	const bodyY1 = size * 0.87;
	const stroke = size * 0.045;
	const radius = size * 0.05;

	fillRoundedRect(px, size, bodyX0, bodyY0, bodyX1, bodyY1, radius, FG);
	fillRoundedRect(
		px,
		size,
		bodyX0 + stroke,
		bodyY0 + stroke,
		bodyX1 - stroke,
		bodyY1 - stroke,
		Math.max(radius - stroke, 0),
		BG
	);

	// Trennlinie zwischen Gefrier- und Kühlteil.
	const dividerY0 = size * 0.34;
	const dividerY1 = dividerY0 + stroke;
	fillRoundedRect(
		px,
		size,
		bodyX0 + stroke * 0.5,
		dividerY0,
		bodyX1 - stroke * 0.5,
		dividerY1,
		0,
		FG
	);

	// Zwei Türgriffe, rechts an jedem Fach.
	const handleX0 = bodyX1 - stroke * 2.2;
	const handleX1 = handleX0 + stroke * 0.9;
	fillRoundedRect(
		px,
		size,
		handleX0,
		bodyY0 + stroke * 1.6,
		handleX1,
		dividerY0 - stroke * 1.2,
		stroke * 0.4,
		FG
	);
	fillRoundedRect(
		px,
		size,
		handleX0,
		dividerY1 + stroke * 1.2,
		handleX1,
		bodyY1 - stroke * 1.6,
		stroke * 0.4,
		FG
	);

	return px;
}

const outDir = join(import.meta.dirname, '..', 'static');

for (const size of [192, 512]) {
	const png = encodePng(size, size, drawFridgeIcon(size));
	writeFileSync(join(outDir, `icon-${size}.png`), png);
	console.log(`geschrieben: static/icon-${size}.png`);
}

// Eigenes Maskable-Icon mit größerem Sicherheitsabstand — Android/Chrome
// beschneiden das Motiv sonst beim Zuschnitt auf Kreis/Squircle/Rechteck.
function drawMaskableIcon(size) {
	const px = createCanvas(size, BG);
	const inner = drawFridgeIcon(Math.round(size * 0.6));
	const offset = Math.round(size * 0.2);
	const innerSize = Math.round(size * 0.6);
	for (let y = 0; y < innerSize; y++) {
		for (let x = 0; x < innerSize; x++) {
			const si = (y * innerSize + x) * 4;
			setPixel(px, size, x + offset, y + offset, [inner[si], inner[si + 1], inner[si + 2]]);
		}
	}
	return px;
}
writeFileSync(join(outDir, 'icon-maskable-512.png'), encodePng(512, 512, drawMaskableIcon(512)));
console.log('geschrieben: static/icon-maskable-512.png');

// Apple Touch Icon: iOS rundet selbst ab, volle Kante bis zum Rand, 180x180
// ist die von Apple dokumentierte Standardgröße.
writeFileSync(join(outDir, 'apple-touch-icon.png'), encodePng(180, 180, drawFridgeIcon(180)));
console.log('geschrieben: static/apple-touch-icon.png');
