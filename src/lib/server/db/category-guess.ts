/**
 * Rät die Kategorie für ein neu angelegtes Produkt aus dem Namen.
 *
 * Nur für den manuellen Pfad ("Schnell hinzufügen") gedacht: der Bon-Import
 * bekommt die Kategorie schon vom Modell, das das Foto ohnehin liest (M5).
 * Beim manuellen Anlegen gibt es kein Foto und keinen Modellaufruf — ohne
 * diesen Rateversuch landet jedes neue Produkt in „Sonstiges".
 *
 * Bewusst klein und ohne Anspruch auf Vollständigkeit: ein Fehltreffer ist ein
 * Tap im Artikel-Detail entfernt (Kategorie dort änderbar), kein bleibender
 * Fehler. Wieder erweitern, wenn ein bestimmtes Wort immer wieder danebenliegt
 * — nicht vorab auf Vorrat aufblähen, siehe die verworfene große
 * Produktdatenbank in PLAN.md §4b.
 */
const CATEGORY_KEYWORDS: ReadonlyArray<readonly [string, readonly string[]]> = [
	[
		'Obst & Gemüse',
		[
			'apfel',
			'apfelsine',
			'aprikose',
			'aubergine',
			'avocado',
			'banane',
			'birne',
			'blaubeere',
			'blumenkohl',
			'brokkoli',
			'champignon',
			'erdbeere',
			'gurke',
			'himbeere',
			'ingwer',
			'kartoffel',
			'karotte',
			'kirsche',
			'kiwi',
			'knoblauch',
			'kohl',
			'kürbis',
			'lauch',
			'limette',
			'mandarine',
			'mango',
			'melone',
			'möhre',
			'nektarine',
			'orange',
			'paprika',
			'petersilie',
			'pfirsich',
			'pflaume',
			'pilz',
			'porree',
			'radieschen',
			'rosenkohl',
			'salat',
			'sellerie',
			'spinat',
			'tomate',
			'traube',
			'weintraube',
			'zitrone',
			'zucchini',
			'zwiebel'
		]
	],
	['Brot & Backwaren', ['brot', 'brötchen', 'baguette', 'toast', 'brezel', 'croissant']],
	[
		'Milchprodukte',
		['milch', 'joghurt', 'quark', 'sahne', 'buttermilch', 'kefir', 'pudding', 'butter']
	],
	['Käse', ['käse', 'mozzarella', 'feta', 'parmesan', 'gouda', 'camembert']],
	['Eier', ['eier']],
	[
		'Fleisch & Fisch',
		[
			'hackfleisch',
			'hähnchen',
			'huhn',
			'pute',
			'rind',
			'schwein',
			'speck',
			'fisch',
			'lachs',
			'thunfisch',
			'garnelen',
			'schnitzel'
		]
	],
	['Tofu & Fleischersatz', ['tofu', 'seitan', 'tempeh']],
	[
		'Aufschnitt & Aufstriche',
		['wurst', 'schinken', 'salami', 'aufstrich', 'hummus', 'marmelade', 'honig']
	],
	['Süßes & Snacks', ['schokolade', 'keks', 'gummibärchen', 'chips', 'bonbon']],
	['Getränke', ['wasser', 'saft', 'cola', 'limonade', 'bier', 'wein', 'kaffee', 'tee']]
];

/** Plural-Endungen wie „-n"/„-en"/„-s" hängen höchstens zwei Buchstaben an. */
const MAX_PLURAL_SUFFIX_LENGTH = 2;

/**
 * Ein Wort trifft ein Stichwort, wenn es exakt passt oder nur um eine kurze
 * Plural-Endung länger ist („Tomaten" auf „tomate"). Länger als das erlaubt
 * ein Kompositum: „Pfirsichjoghurt" soll nicht an „pfirsich" hängenbleiben,
 * sondern lieber unentschieden bleiben als falsch zu raten.
 */
function matches(word: string, keyword: string): boolean {
	if (word === keyword) return true;
	return word.startsWith(keyword) && word.length - keyword.length <= MAX_PLURAL_SUFFIX_LENGTH;
}

/** Zerlegt den Namen in Wörter und prüft sie gegen die Listen. */
export function guessCategoryName(productName: string): string | undefined {
	const words = productName
		.toLowerCase()
		.split(/[^a-zäöüß]+/)
		.filter((word) => word.length > 0);
	for (const [categoryName, keywords] of CATEGORY_KEYWORDS) {
		if (words.some((word) => keywords.some((keyword) => matches(word, keyword))))
			return categoryName;
	}
	return undefined;
}
