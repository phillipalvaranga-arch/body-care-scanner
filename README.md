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
