"""Pure-stdlib OOXML Excel backup writer for runtime on Windows (no pip needed)."""

import io
import zipfile
from datetime import datetime, timezone
from xml.sax.saxutils import escape

HEADERS = ["ID", "Part number", "Category", "Subtype", "Description", "Manufacturer",
           "Package", "Quantity", "Location", "Status", "Supplier", "Purchase URL",
           "Datasheet URL", "Source URL", "Notes", "Parameters", "Pinout",
           "Created UTC", "Updated UTC"]


def rows(entries):
    yield HEADERS
    for e in entries:
        specs = "\n".join(f"{a.get('label','')}: {a.get('value','')}"
                          + (f" ({a['note']})" if a.get("note") else "")
                          for a in e.get("attributes", []))
        pins = ", ".join(f"{p.get('number','')}={p.get('signal','')}" for p in e.get("pinout", []))
        yield [e.get(k) for k in ("id", "part_number", "category", "subtype",
                "description", "manufacturer", "package", "quantity", "location", "status",
                "supplier", "purchase_url", "datasheet_url", "source_url", "notes")] + [
            specs, pins, e.get("created_at"), e.get("updated_at")]


def colnum(n):
    s = ""
    while n:
        n, remainder = divmod(n-1, 26)
        s = chr(65+remainder)+s
    return s


def make_xlsx(entries):
    all_rows = list(rows(entries))
    sheet_rows = []
    for i, row in enumerate(all_rows, 1):
        cells = []
        for j, val in enumerate(row, 1):
            address = f"{colnum(j)}{i}"
            style = ' s="1"' if i == 1 else (' s="2"' if i % 2 == 0 else "")
            if type(val) in (int, float):
                cells.append(f'<c r="{address}"{style}><v>{val}</v></c>')
            else:
                value = escape(str(val if val is not None else ""), {'"': '&quot;'})
                cells.append(f'<c r="{address}"{style} t="inlineStr"><is><t xml:space="preserve">{value}</t></is></c>')
        sheet_rows.append(f'<row r="{i}" ht="{27 if i == 1 else 23}" customHeight="1">{"".join(cells)}</row>')
    widths = [9,19,17,26,45,45,15,12,23,18,22,43,43,43,48,62,24,23,23]
    cols = "".join(f'<col min="{i}" max="{i}" width="{w}" customWidth="1"/>' for i,w in enumerate(widths, 1))
    tab = ('<?xml version="1.0" encoding="UTF-8"?>'
           '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
           '<sheetViews><sheetView showGridLines="0" workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
           f'<cols>{cols}</cols><sheetData>{"".join(sheet_rows)}</sheetData>'
           f'<autoFilter ref="A1:S{len(all_rows)}"/></worksheet>')
    files = {
        '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
        '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Inventory" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
        'xl/worksheets/sheet1.xml': tab,
        'xl/styles.xml': '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Aptos"/></font><font><b/><sz val="10"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF173043"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF0F5F7"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf fontId="0" fillId="0" borderId="0" xfId="0"/><xf fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/></cellXfs></styleSheet>',
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for path, text in files.items():
            z.writestr(path, text)
    return buf.getvalue()
