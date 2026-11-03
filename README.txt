ELECTROCAT 1.0 — WINDOWS SETUP AND USER GUIDE
=============================================

WHAT IS INCLUDED
----------------
ElectroCat is a local electronic parts catalog with a browser interface, an
unpacked Chrome/Edge extension, Excel-compatible backups, and 384 px Cat
Printer labels. It runs on your PC without a cloud account.

REQUIREMENTS
------------
- Windows 10/11, with Chrome or Microsoft Edge.
- Python 3.10 or newer (download from https://www.python.org/downloads/).
  During Python installation, enable "Add Python to PATH" if offered.
- MXW01 Cat Printer (optional, for direct Chrome/Edge Web Bluetooth printing).
- Internet only for product-page lookup, optional AI, and the fallback printing
  website. Direct printer access and PNG generation stay local.
There are NO required pip packages.

STEP 1 — INSTALL AND START
--------------------------
1. Extract the entire ElectroCat.zip archive to a permanent folder, e.g.
   C:\Users\<you>\Documents\ElectroCat-App
2. Double-click start_electrocat.bat.
3. Keep the command window open while you use ElectroCat.
4. Chrome should open http://127.0.0.1:8765 automatically.
   If not, type that exact address into Chrome.
5. The first launch registers AO3400A automatically.

STEP 2 — REGISTER A PART MANUALLY
---------------------------------
1. In ElectroCat, click "+ Add entry".
2. Enter a part number (e.g. AO3400A), optionally paste the purchase URL.
3. Click "Autofill details" and wait. The app checks its verified built-in
   reference, free page metadata, and optional AI enrichment.
4. Check the suggested manufacturer, ratings, package, and top-view pinout.
5. Add any missing parameters. The parameter labels adapt to the part category.
6. Optionally enter quantity, supplier, and drawer/storage location.
7. Click "Save entry". The catalog and Excel backups update immediately.

IMPORTANT: Free extraction is best-effort, not an exhaustive manufacturer
datasheet database. Unknown specifications stay blank and are marked for
review. Never design a safety-critical circuit from an unverified catalog
entry. AO3400A uses official AOS reference specs; your actual seller's
manufacturer remains unverified until you check the marking.

STEP 3 — INSTALL THE CHROME / EDGE EXTENSION
--------------------------------------------
1. Open chrome://extensions (Edge: edge://extensions).
2. Enable "Developer mode".
3. Click "Load unpacked".
4. Select the folder ElectroCat\extension (not the ZIP file).
5. Pin the ElectroCat extension to the browser toolbar if you like.
6. Keep the local ElectroCat command window running.

EXTENSION METHOD A — RIGHT CLICK ON SELECTED TEXT
1. Highlight the part number on any ordinary product web page.
2. Right click and select "Add to my parts list (ElectroCat)".
3. A provisional entry is registered and its editable review screen opens.
4. Confirm any ambiguous fields, then click "Save entry".

EXTENSION METHOD B — PRODUCT URL / TOOLBAR
1. Open the product listing page.
2. Click the ElectroCat extension icon in the browser toolbar.
3. Review or replace the detected page title with the exact part number.
4. Click "Add to my parts list".
5. Review the created entry in ElectroCat.

NOTE: Chrome does not allow extensions to add a custom right-click command
inside the address bar itself. The extension toolbar handles that scenario.
Right-click also works on a product link or elsewhere on the page.

STEP 4 — EDIT, SEARCH, AND PRINT STICKERS
-----------------------------------------
1. Search in the field above the inventory table.
2. Filter by category if needed.
3. Click any row to edit its fields, parameters, and pinout.
4. Select one or more checkboxes on the far left.
5. Click "Print stickers" to preview the first selected label.
6. Turn on the MXW01 and close its phone app. In Chrome or Edge, click
   "Connect printer" and choose the device whose name starts with MXW01.
7. Keep the first test at the default intensity (93 / 192), then click
   "Print label" or "Print N labels". Batches print sequentially.
8. Fallback: click "Download PNG" (384 x 352 px). Multiple selections
   download as a ZIP. Import a PNG in Image Mode at https://print.natey.me/.

The included sample\AO3400A.png is an immediately printable test image.
Direct printing uses a reverse-engineered protocol and still needs validation
on the owner's physical printer. Keep the PNG fallback while testing. Web
Bluetooth is unavailable in Firefox, Safari, and browsers on iPhone/iPad.

STEP 5 — FIND YOUR BACKUPS
--------------------------
The default local data folder on Windows is:
  C:\Users\<you>\Documents\ElectroCat

Files:
  electrocat.db               = authoritative SQLite database
  ElectroCat_inventory.xlsx   = latest Excel-compatible inventory
  backups\ElectroCat_*.xlsx   = dated version after EACH add, edit, or delete

You can open the XLSX backups in Excel or LibreOffice.
To keep a second independent backup, sync the data folder with OneDrive,
copy it to another drive, or use normal Windows File History.

IMPORTANT WINDOWS EXCEL NOTE: If ElectroCat_inventory.xlsx is open in Excel,
Windows may lock it. ElectroCat still saves your edit in the database and
creates a dated backup, but it may warn that it cannot replace the main XLSX.
Close the Excel workbook and make another edit to refresh the main file.

To choose a different data folder (PowerShell example):
  $env:ELECTROCAT_DATA_DIR = "D:\MyParts\ElectroCat"
  python app.py

STEP 6 — OPTIONAL AI ENRICHMENT
-------------------------------
No AI API key is required. With no key, built-in reference data and public
product-page metadata are used. AI can extract additional fields from the
listing text when an API key is explicitly configured.

In PowerShell, before running python app.py:
  $env:ELECTROCAT_AI_API_KEY = "your-key-here"
  $env:ELECTROCAT_AI_MODEL = "gpt-4o-mini"
  python app.py

The optional service uses an OpenAI-compatible chat-completions endpoint.
Requests can incur provider charges. Marketplace descriptions and extracted
values are untrusted; verify them against the official datasheet. Do not put
API keys in the extension, README, or a public GitHub repository.

STEP 7 — PUBLISH THIS AS YOUR FIRST GITHUB REPOSITORY
-----------------------------------------------------
1. Sign in to https://github.com and create a new PUBLIC repository named
   ElectroCat under your own GitHub username. Do not initialize it with a
   README, since the project already includes one.
2. Install Git for Windows from https://git-scm.com/download/win if necessary.
3. Open Git Bash or PowerShell in the extracted ElectroCat application folder.
4. Run the following commands (replace YOUR-USERNAME):

   git init -b main
   git add .
   git commit -m "Initial ElectroCat release"
   git remote add origin https://github.com/YOUR-USERNAME/ElectroCat.git
   git push -u origin main

5. Authenticate when requested by Git Credential Manager.
6. Check your public repository in the browser.

The name ElectroCat is already used by unrelated projects. GitHub permits the
same repository name under different user accounts. Check trademark rights
separately if you commercialize the name.

TROUBLESHOOTING
---------------
- "Python not found": Install Python 3.10+, then restart the command window.
- Dashboard unreachable: Keep start_electrocat.bat running; check port 8765.
- Browser extension can't connect: The local web service must be running.
- Unknown parts not fully populated: Add a source URL and/or verify manually.
- Excel locked: Close Excel; dated backups still preserve every edit.
- Printer image scaled: Import the PNG at exactly 384 px width and use the
  MXW01 image-mode controls. The file itself is already 384 px wide.
- Printer not listed: Use Chrome/Edge, turn the MXW01 on, and fully close its
  phone app. Only one app can connect at a time.
- Web Bluetooth unavailable: Open the local http://127.0.0.1:8765 address in
  Chrome/Edge, or use Download PNG.
- To stop ElectroCat, press Ctrl+C in the command window or close it.

DEVELOPERS / TESTING
--------------------
  python -m unittest discover -s tests -v
  node tests\mxw01_protocol.cjs
  python app.py --port 8765 --no-browser

No online server is published; all local application data stays on your PC
unless you voluntarily sync it, submit listing text to an AI endpoint, or
publish your code to GitHub.

SOURCE FOR INITIAL AO3400A ENTRY
---------------------------------
https://www.aosmd.com/products/mosfets/low-voltage-mosfets-12v-30v/ao3400a
https://www.aosmd.com/res/data_sheets/AO3400A.pdf
