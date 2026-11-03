# ElectroCat ⚡🐈

**A local-first electronic components catalog with smart entry suggestions, Excel backups, a browser extension, and pixel-perfect Cat Printer labels.**

ElectroCat is a lightweight Python application that opens a web dashboard in your normal browser. It stores inventory in SQLite and creates an Excel-compatible workbook after every edit. A Chrome/Edge extension adds selected product names or page URLs to your inventory; unknown specifications stay flagged for review.

## Quick start (Windows)

1. Install Python 3.10 or newer.
2. Download/unzip ElectroCat and double-click **start_electrocat.bat**.
3. Open **http://127.0.0.1:8765** if your browser does not open automatically.
4. You'll see **AO3400A** as the example entry. Edit it, or add another part.
5. Read **README.txt** for full instructions, installing the browser extension, backups, printing, and GitHub.

No third-party Python packages are needed.

## What works

- Searchable newest-first inventory, filters, editable component records.
- Variable parameter lists for MOSFETs, capacitors, modules, sensors, ICs and more.
- Optional quantity, supplier, purchase link and storage location.
- Curated AO3400A specifications from the [AOS manufacturer datasheet](https://www.aosmd.com/res/data_sheets/AO3400A.pdf).
- Free extraction of product-page metadata and JSON-LD; optional AI enrichment when an API key is configured.
- Chrome Manifest V3 context menu and toolbar capture; new captures open in a review editor.
- Exact **384 × 352 px**, monochrome label PNG generator and ZIP batch export.
- Link to [print.natey.me](https://print.natey.me/) for MXW01 printing.
- Local SQLite source of truth, fresh Excel workbook and timestamped XLSX backup after each mutation.

## Limitations and priorities

No paid data API is required, but automated parameter extraction is currently best-effort. A new manufacturer or marketplace part with insufficient source metadata gets blank, editable fields rather than fabricated specifications. Direct MXW01 Web Bluetooth transmission is **not included** in this release: it has not been hardware-tested, so PNG import through the existing printer website is the supported path. Chrome does not expose its address-bar context menu to extensions; the toolbar handles the URL capture.

## Privacy

The server binds to **127.0.0.1** only. Inventory data and backup files are stored under **Documents/ElectroCat** by default. The optional AI feature sends product names and listing excerpts to the configured provider when enabled; keys are read from environment variables.

## Development

Run `python -m unittest discover -s tests -v` for local unit/API tests. No bundler or frontend dependencies are needed. Licensed under MIT; see `LICENSE`.
