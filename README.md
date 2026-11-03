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
- Exact **384 × 352 px**, monochrome label generator shared by direct printing and PNG export.
- Direct MXW01 Web Bluetooth connection, adjustable print intensity, progress reporting, and sequential batch printing.
- PNG/ZIP download and [print.natey.me](https://print.natey.me/) remain available as fallbacks.
- Local SQLite source of truth, fresh Excel workbook and timestamped XLSX backup after each mutation.

## Print directly to an MXW01

Web Bluetooth works from **Chrome or Edge on desktop** and **Chrome on Android**. It is not available in Firefox or Safari/iOS. ElectroCat's `http://127.0.0.1` address is treated as a secure browser context, so no HTTPS setup is needed for local use.

1. Turn on the MXW01 and close its mobile app; only one application can hold the printer connection.
2. Select one or more inventory rows and click **Print stickers**.
3. Click **Connect printer** and choose the device whose name begins with `MXW01`.
4. Start with the default intensity of **93 / 192**. Raise it only if the result is too light; excessive intensity can overheat the head or shorten its life.
5. Click **Print label** or **Print N labels**. Batches are sent sequentially, with progress shown for the current label. **Stop after current label** safely prevents the next label from starting.

The driver sends the existing 384×352 black/white canvas unchanged as 48-byte, LSB-first raster rows. It checks printer status, waits for the print-request acknowledgement, paces BLE writes, flushes the raster, and validates the completion checksum when the firmware supplies it.

If connection or printing fails, **Download PNG** is always available. Multiple labels download as an uncompressed ZIP; each PNG remains exactly 384×352 pixels and can be printed with the external tool's Image Mode.

### Hardware-validation checklist

The protocol and browser path are covered by automated fakes, but this feature still needs confirmation on the target hardware. For the first real test:

- use one label at the default intensity;
- confirm the label is upright and the left/right edges are not mirrored;
- confirm the final footer clears the print head after the small feed;
- try a two-label batch and watch for missing or duplicated raster rows;
- test light and dark settings gradually, stopping if the head or paper becomes unusually hot;
- test the missing-paper/cover-open error and reconnect after turning the printer off and on.

The implementation follows the reverse-engineered [MXW01 protocol reference](https://github.com/jeremy46231/MXW01-catprinter/blob/main/PROTOCOL.md) and the measured AF30-advertising/AE30-GATT behavior documented by [print-on-my-desk](https://github.com/eliorpom-cmd/print-on-my-desk/blob/main/docs/09-protocol.md).

## Limitations and priorities

No paid data API is required, but automated parameter extraction is currently best-effort. A new manufacturer or marketplace part with insufficient source metadata gets blank, editable fields rather than fabricated specifications. Direct MXW01 printing is based on a reverse-engineered, undocumented protocol and is not yet validated on the owner's physical unit; keep the PNG path available during testing. Chrome does not expose its address-bar context menu to extensions; the toolbar handles URL capture.

## Privacy

The server binds to **127.0.0.1** only. Inventory data and backup files are stored under **Documents/ElectroCat** by default. The optional AI feature sends product names and listing excerpts to the configured provider when enabled; keys are read from environment variables.

## Development

Run both test suites (Node.js is used only for developer tests; the app itself has no JavaScript build step or package dependency):

```powershell
python -m unittest discover -s tests -v
node tests/mxw01_protocol.cjs
```

The optional `node tests/browser_smoke.cjs` test requires Playwright. The protocol suite covers command framing and CRC, 384-pixel 1-bit raster packing, Web Bluetooth discovery, the status/acknowledgement/data/flush/completion sequence, checksum handling, and disconnect behavior with a fake printer. The browser smoke test also completes a mocked direct print through the actual UI and verifies that PNG and ZIP fallback downloads still work.

## Keeping the local and GitHub versions together

Do not merge by copying one project folder over another. Git already knows how to combine the histories while preserving a recovery point.

Before starting new work:

```powershell
git status
git switch main
git pull --ff-only origin main
git switch -c my-feature-name
```

Commit and publish a feature branch, then open a pull request:

```powershell
git add README.md README.txt web tests
git commit -m "Add direct MXW01 Web Bluetooth printing"
git push -u origin my-feature-name
```

After the pull request is merged on GitHub, update the local main branch:

```powershell
git switch main
git pull --ff-only origin main
git branch -d my-feature-name
```

If `git status` shows uncommitted local edits, commit them on a temporary branch before pulling. If Git reports that local and remote `main` have diverged, create a backup branch (`git branch backup-before-sync`) and inspect `git log --graph --oneline --all`; do not force-push or reset until the commits on both sides are understood.

Licensed under MIT; see `LICENSE`.
