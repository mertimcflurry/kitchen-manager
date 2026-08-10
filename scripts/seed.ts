/**
 * Seed-Runner. Ausserhalb von SvelteKit, deshalb eigene DB-Verbindung.
 *
 *   npm run db:seed          nur Kategorien (idempotent, auch produktiv sicher)
 *   npm run db:seed:dev      zusaetzlich Testprodukte und Bestand
 *   npm run db:seed:dev -- --reset   Nutzdaten vorher loeschen
 */
import { createDb } from '../src/lib/server/db/client';
import { resetData, seedCategories, seedDevData } from '../src/lib/server/db/seed';

const url = process.env.DATABASE_URL;
if (!url) {
	console.error('DATABASE_URL ist nicht gesetzt. Liegt eine .env vor? Siehe .env.example.');
	process.exit(1);
}

const withDev = process.argv.includes('--dev');
const withReset = process.argv.includes('--reset');

const db = createDb(url);

if (withReset) {
	if (!withDev) {
		console.error('--reset nur zusammen mit --dev. Das loescht echte Bestandsdaten.');
		process.exit(1);
	}
	resetData(db);
	console.log('Nutzdaten geloescht (Kategorien behalten).');
}

const added = seedCategories(db);
console.log(`Kategorien: ${added} neu angelegt.`);

if (withDev) {
	const { products, stock } = seedDevData(db);
	if (products === 0 && stock === 0) {
		console.log('Testdaten uebersprungen — es existiert bereits Bestand.');
	} else {
		console.log(`Testdaten: ${products} Produkte, ${stock} Bestandsposten.`);
	}
}
