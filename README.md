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


## Add a product (v5)

If a barcode is not in the app, you can add it yourself: name, brand, type, optional size and front photo, and the ingredient list (typed, pasted, or read from a photo on the device). The live preview shows the GOOD / OK / BAD rating before you save. Products are stored only on this device (IndexedDB, with compressed photos), are checked first on future scans, and appear in name search and best-rated lists with an “Added by you” tag. Edit, delete, and export or import a backup JSON file from the My products tab. Sharing to Open Beauty Facts is optional and opens their add-product page — the app never uploads for you.

## v6: scanning that never fails silently

- **Misreads stopped.** A blurry webcam could read a barcode as a different number that still passes the check digit, so you landed on "not found". Every live read is now double-checked on a sharpened, enlarged copy of the same picture; if that copy cannot be read, three matching reads are needed.
- **Any camera works.** The app only *prefers* the back camera. PCs with just a front webcam fall back to any camera, and finally to a camera picked from the device list.
- **Windows Edge and Chrome** have no built-in barcode reader, so the ZXing scanner starts at once. Its "try harder" mode is on, the read area is bigger, and a once-a-second booster reads an enhanced copy of the picture.
- **Visible fallbacks.** If nothing is read in 8 seconds, or the camera cannot start, a big **Type the barcode number** box and a **Take a photo of the barcode** button appear. The home page also has **Use a photo of the barcode instead**. Photos are read with several cleaned-up copies (whole, sharpened, middle enlarged, turned sideways).
- **Clear messages.** There are separate messages for blocked permission (with Edge/Chrome and Windows privacy steps), no camera, a camera in use by another app, and pages shown inside another page.
- **No silent "no result".** The lookup screen shows **Scanned: number**. Every result shows the barcode and where it was found. The not-found page shows the number with a box to fix it, and lists every place checked: your products, the US library, Open Beauty Facts, Open Products Facts and Open Food Facts. Each one shows found, not there, or did not answer.
- **Updates arrive.** The service worker is `bodycare-v6` and always asks the server for fresh files, bypassing the 10-minute browser cache. Files are versioned (`?v=6`). An open tab shows **Update available - tap to refresh** when a newer version is ready. The home page shows the app version and US library size.
- **The on-device database can't hang a lookup.** It times out after 3 seconds and uses the backup copy.
