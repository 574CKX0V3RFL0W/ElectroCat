"""Run from project root: python -m unittest discover -s tests -v"""
import io
import json
import os
import tempfile
import threading
import unittest
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from app import create_handler
from electrocat.lookup import autofill, clean_name, guess_category
from electrocat.store import Inventory


class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.inventory = Inventory(self.temp.name)

    def tearDown(self):
        self.inventory.db.close()
        self.temp.cleanup()

    def test_seed_ao3400a_and_backup(self):
        entries = self.inventory.list()
        self.assertEqual(len(entries), 1)
        e = entries[0]
        self.assertEqual(e["part_number"], "AO3400A")
        self.assertEqual(e["package"], "SOT-23")
        self.assertEqual([(p["number"],p["signal"]) for p in e["pinout"]],
                         [("1","G"),("2","S"),("3","D")])
        self.assertEqual(len(list(Path(self.temp.name).glob("backups/*.xlsx"))), 1)
        with zipfile.ZipFile(Path(self.temp.name)/"ElectroCat_inventory.xlsx") as z:
            for name in z.namelist():
                if name.endswith(".xml") or name.endswith(".rels"):
                    ET.fromstring(z.read(name))
            text = z.read("xl/worksheets/sheet1.xml").decode()
            self.assertIn("AO3400A", text)
            self.assertIn("5.7 A", text)

    def test_add_edit_delete_versioned_mirrors(self):
        e = self.inventory.add({"part_number":"LM324N","category":"IC",
            "quantity":15,"attributes":[{"label":"VCC","value":"3–32 V"}],"pinout":[]})
        self.assertEqual(self.inventory.get(e["id"])["quantity"],15)
        revised = self.inventory.update(e["id"],{"quantity":9,"location":"Drawer B2"})
        self.assertEqual(revised["location"],"Drawer B2")
        self.assertEqual(revised["quantity"],9)
        self.inventory.delete(e["id"])
        self.assertEqual(len(self.inventory.list()),1)
        self.assertEqual(len(list(Path(self.temp.name).glob("backups/*.xlsx"))),4)

    def test_empty_inventory_does_not_reseed(self):
        for entry in self.inventory.list():
            self.inventory.delete(entry["id"])
        self.inventory.db.close()
        reopened = Inventory(self.temp.name)
        try:
            self.assertEqual(reopened.list(),[])
        finally:
            reopened.db.close()

    def test_invalid_quantity(self):
        with self.assertRaises(ValueError):
            self.inventory.add({"part_number":"R1","quantity":-5})

    def test_batch_add_is_one_transaction_and_one_backup(self):
        entries = self.inventory.add_many([
            {"part_number":"NE555P","category":"IC"},
            {"part_number":"10K-RES","category":"Resistor","quantity":20},
        ])
        self.assertEqual([entry["part_number"] for entry in entries],["NE555P","10K-RES"])
        self.assertEqual(len(self.inventory.list()),3)
        self.assertEqual(len(list(Path(self.temp.name).glob("backups/*.xlsx"))),2)


class LookupTests(unittest.TestCase):
    def test_known_part_curated_without_url(self):
        result = autofill("100pcs AO3400A SOT-23", "", False)
        self.assertEqual(result["entry"]["part_number"],"AO3400A")
        self.assertEqual(result["entry"]["status"],"reference")
        self.assertEqual(result["entry"]["attributes"][3]["label"],"VGS(th)")

    def test_unknown_part_is_not_hallucinated(self):
        result = autofill("ABC1234 mosfet", "", False)
        self.assertEqual(result["entry"]["category"],"MOSFET")
        self.assertEqual(result["entry"]["status"],"review")
        self.assertTrue(all(not x["value"] for x in result["entry"]["attributes"]))

    def test_rendered_browser_metadata_populates_listing_without_refetch(self):
        captured={"title":"NE555P timer IC DIP-8", "sku":"NE555P",
                  "description":"Precision timer in DIP-8 package",
                  "manufacturer":"Texas Instruments",
                  "attributes":[{"label":"Supply voltage","value":"4.5 V to 16 V"}],
                  "pinout":[{"number":"1","signal":"GND","label":"Ground"}]}
        result=autofill("Marketplace listing", "https://example.invalid/item/123", False,
                        captured=captured)
        entry=result["entry"]
        self.assertEqual(entry["part_number"],"NE555P")
        self.assertEqual(entry["package"],"DIP-8")
        self.assertEqual(entry["manufacturer"],"Texas Instruments")
        self.assertEqual(entry["attributes"][0]["value"],"4.5 V to 16 V")
        self.assertEqual(entry["pinout"][0]["signal"],"GND")

    def test_local_ai_is_structured_and_source_grounded(self):
        model_output={"part_number":"NE555P","category":"IC","subtype":"Timer","package":"DIP-8",
                      "manufacturer":"Invented Semiconductor","description":"Invented description",
                      "attributes":[{"label":"Supply","value":"5 V","note":"listing"},
                                    {"label":"Current","value":"99 A","note":"invented"}],
                      "pinout":[{"number":"1","signal":"GND","label":"Ground"},
                                {"number":"2","signal":"MAGIC","label":"Invented"}]}
        response=io.BytesIO(json.dumps({"response":json.dumps(model_output)}).encode())
        captured={"title":"NE555P timer DIP-8","description":"Timer with 5 V supply",
                  "page_text":"NE555P timer DIP-8. Supply: 5 V. Pin 1: GND."}
        with patch.dict(os.environ,{"ELECTROCAT_LOCAL_AI_MODEL":"qwen3:4b"}), \
             patch("electrocat.lookup.urlopen",return_value=response):
            entry=autofill("NE555P timer","",True,captured=captured)["entry"]
        self.assertEqual(entry["category"],"IC")
        self.assertEqual(entry["attributes"],[{"label":"Supply","value":"5 V","note":"listing"}])
        self.assertEqual(entry["pinout"],[{"number":"1","signal":"GND","label":"Ground"}])
        self.assertNotEqual(entry["manufacturer"],"Invented Semiconductor")


class HttpTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.inventory = Inventory(self.temp.name)
        self.server = ThreadingHTTPServer(("127.0.0.1",0),create_handler(self.inventory))
        self.thread = threading.Thread(target=self.server.serve_forever,daemon=True)
        self.thread.start()
        self.base = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.inventory.db.close()
        self.temp.cleanup()

    def request(self,path,method="GET",body=None):
        headers={"Content-Type":"application/json"} if body is not None else {}
        req=urllib.request.Request(self.base+path,
            data=json.dumps(body).encode() if body is not None else None,
            headers=headers,method=method)
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.read(),resp.headers

    def test_end_to_end_crud_and_excel(self):
        entries=json.loads(self.request("/api/entries")[0])
        self.assertEqual(entries[0]["part_number"],"AO3400A")
        index=self.request("/")[0]
        self.assertIn(b"ElectroCat", index)
        self.assertIn(b'id="connect-printer"', index)
        self.assertIn(b'id="print-intensity"', index)
        self.assertIn(b'id="print-labels"', index)
        self.assertIn(b"function renderLabel", self.request("/app.js")[0])
        driver=self.request("/mxw01.js")[0]
        self.assertIn(b"class MXW01Printer", driver)
        self.assertIn(b"0000ae03-0000-1000-8000-00805f9b34fb", driver)
        new=json.loads(self.request("/api/entries","POST",{
            "part_number":"TEST555","category":"IC","quantity":4,
            "attributes":[{"label":"VCC","value":"5 V"}]
        })[0])
        self.assertEqual(new["quantity"],4)
        updated=json.loads(self.request(f"/api/entries/{new['id']}","PATCH",{"quantity":7})[0])
        self.assertEqual(updated["quantity"],7)
        xlsx,headers=self.request("/api/export.xlsx")
        self.assertIn("spreadsheetml",headers["Content-Type"])
        with zipfile.ZipFile(io.BytesIO(xlsx)) as z:
            text=z.read("xl/worksheets/sheet1.xml").decode()
            self.assertIn("TEST555",text)
        self.request(f"/api/entries/{new['id']}","DELETE")
        self.assertEqual(len(json.loads(self.request("/api/entries")[0])),1)

    def test_batch_capture_uses_visible_listing_data(self):
        before=len(list(Path(self.temp.name).glob("backups/*.xlsx")))
        body={"use_ai":False,"items":[
            {"name":"NE555P timer", "url":"https://example.invalid/item/1",
             "captured":{"title":"NE555P timer DIP-8","sku":"NE555P","description":"Timer IC"}},
            {"name":"BME280 sensor module", "url":"https://example.invalid/item/2",
             "captured":{"title":"BME280 sensor module","sku":"BME280","description":"Temperature sensor module"}},
        ]}
        result=json.loads(self.request("/api/capture/batch","POST",body)[0])
        self.assertEqual(len(result["entries"]),2)
        self.assertEqual(result["entries"][0]["package"],"DIP-8")
        self.assertEqual(len(list(Path(self.temp.name).glob("backups/*.xlsx"))),before+1)


if __name__=="__main__":
    unittest.main()
