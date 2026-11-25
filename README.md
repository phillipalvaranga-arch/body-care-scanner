# Body Care Scanner

Installable phone/PC web app that scans a toothpaste, mouthwash, shampoo, conditioner, soap, body wash, deodorant or lotion barcode and explains every ingredient in plain English.

- **Big label:** each product is rated **GOOD** (green), **OK** (yellow) or **BAD** (red), with a 0–100 score.
- **Each ingredient:** **Good for you**, **OK** or **Bad for you**, with a plain-English reason, what it does, and sources.
- **Hormone-disruptor flags:** parabens, phthalates (and fragrance that may hide them), triclosan/triclocarban, oxybenzone, homosalate, octinoxate, BHA, resorcinol — with honest evidence-strength notes (EU SCCS, FDA, NIH/NIEHS). Filter on the Hormones tab, in History/Favorites and in the best-rated lists.
- **Data:** products and ingredient lists come from [Open Beauty Facts](https://world.openbeautyfacts.org). Nothing is invented; if a product or its ingredients are missing the app says so and lets you paste/type the list or read it from a photo (on-device Tesseract.js OCR, loaded on demand).
- **Cleaner picks:** suggested only from real Open Beauty Facts products in the same category with a better computed score and no extra hormone flags.
- History and favorites stay on the device (`localStorage`). No accounts, no API keys, no personal data collected.

Live: https://phillipalvaranga-arch.github.io/body-care-scanner/

Informational only; not medical advice. Ratings summarize what regulators and scientific bodies say, many are dose-dependent or debated, and Open Beauty Facts can be incomplete or wrong.

## Scanning and lookup (v3)

- Scanner: the browser's built-in BarcodeDetector first; if it reads nothing for 4 seconds the app switches to the bundled ZXing scanner. Rear camera, continuous focus, Light and Zoom buttons when the phone supports them. The scanned number is shown on screen and rejected if its check digit is wrong (misread).
- Lookup: Open Beauty Facts, then Open Products Facts and Open Food Facts, trying UPC-A (12 digits), EAN-13 (leading 0) and UPC-E expansions.
- If the barcode is known but has no ingredients, or is unknown: search by name in Open Beauty Facts (clearly labelled "similar product, not your barcode"), paste or photograph the ingredient list, or open a DuckDuckGo/Google search for "<name> ingredients". The app never invents ingredients.
- UPCitemdb and similar UPC-to-name services are not used: they block browser requests (CORS) or need an API key.

## Built-in US product library (v4)

`data/us-products.json` holds 2,278 US drugstore products (UPC + full ingredient list), checked Nov 25, 2026:

- **Maker SmartLabel pages** (1,959 products): Procter & Gamble (smartlabel.pg.com: Crest, Scope, Pantene, Head & Shoulders, Herbal Essences, Aussie, Old Spice, Secret, Gillette, Olay, Ivory, Safeguard) and Colgate-Palmolive (colgatepalmolive.com/en-us/smartlabel: Colgate, Irish Spring, Softsoap, Speed Stick, Tom's of Maine). Each page is keyed by the product's UPC and lists its ingredients.
- **FDA drug labels** (the rest): over-the-counter products such as Listerine, fluoride toothpastes and rinses, antiperspirants, dandruff shampoos and antibacterial soaps, from openFDA / DailyMed. The UPC and the active and inactive ingredients come from the label the maker submitted to the FDA.

Each row keeps its source URL and the date the source says it was last updated. Scanned barcodes are checked against this library first (12- and 13-digit forms), then Open Beauty Facts, Open Products Facts and Open Food Facts. Name search and the best-rated lists include it. Build scripts are in `tools/us-library/`. Nothing is invented: a product is included only when its source gives both the UPC and the ingredient list.

The "US products only" switch (on by default) limits Open Beauty Facts searches, best-rated lists and suggestions to products sold in the US (using us.openbeautyfacts.org and the countries field).
