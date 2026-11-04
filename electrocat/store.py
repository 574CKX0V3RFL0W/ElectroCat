"""SQLite is authoritative; atomic XLSX mirror and versioned backup on every edit."""

import json
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from .data import ao3400a
from .xlsx import make_xlsx

FIELDS = ("part_number", "category", "subtype", "description", "manufacturer",
          "package", "status", "quantity", "location", "supplier", "purchase_url",
          "source_url", "datasheet_url", "notes", "attributes", "pinout")


def data_directory():
    override = os.getenv("ELECTROCAT_DATA_DIR")
    return Path(override).expanduser() if override else Path.home() / "Documents" / "ElectroCat"


class Inventory:
    def __init__(self, folder=None):
        self.folder = Path(folder or data_directory())
        self.folder.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        fresh_database = not (self.folder / "electrocat.db").exists()
        self.db = sqlite3.connect(self.folder / "electrocat.db", check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute("""CREATE TABLE IF NOT EXISTS parts (
          id INTEGER PRIMARY KEY AUTOINCREMENT, part_number TEXT NOT NULL,
          category TEXT, subtype TEXT, description TEXT, manufacturer TEXT,
          package TEXT, status TEXT, quantity INTEGER, location TEXT, supplier TEXT,
          purchase_url TEXT, source_url TEXT, datasheet_url TEXT, notes TEXT,
          attributes TEXT NOT NULL DEFAULT '[]', pinout TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL)""")
        self.db.commit()
        if fresh_database:
            self.add(ao3400a())
        elif not (self.folder / "ElectroCat_inventory.xlsx").exists():
            self.backup()

    def list(self):
        with self.lock:
            result = [dict(r) for r in self.db.execute("SELECT * FROM parts ORDER BY created_at DESC, id DESC")]
            for r in result:
                for field in ("attributes", "pinout"):
                    r[field] = json.loads(r[field])
            return result

    def get(self, entry_id):
        for e in self.list():
            if e["id"] == int(entry_id):
                return e
        raise KeyError("Part not found")

    def _validate(self, values, existing=None):
        d = {k: (existing.get(k) if existing else None) for k in FIELDS}
        d.update({k: v for k, v in values.items() if k in FIELDS})
        d["part_number"] = str(d.get("part_number") or "").strip()[:120]
        if not d["part_number"]:
            raise ValueError("Part number or listing name is required")
        if d.get("quantity") in ("", None):
            d["quantity"] = None
        else:
            d["quantity"] = int(d["quantity"])
            if d["quantity"] < 0:
                raise ValueError("Quantity cannot be negative")
        for key in FIELDS:
            if key in ("attributes", "pinout"):
                if d.get(key) is None:
                    d[key] = []
                if not isinstance(d.get(key), list):
                    raise ValueError(f"{key} must be a list")
                d[key] = d[key][:50]
                for item in d[key]:
                    if not isinstance(item, dict):
                        raise ValueError(f"{key} items must be objects")
            elif key not in ("quantity",):
                d[key] = str(d.get(key) or "")[:4000]
        return d

    def add(self, values):
        with self.lock:
            data = self._validate(values)
            stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
            keys = list(FIELDS)
            stored = [json.dumps(data[k], ensure_ascii=False) if k in ("attributes", "pinout") else data[k] for k in keys]
            sql = f"INSERT INTO parts ({','.join(keys)},created_at,updated_at) VALUES ({','.join('?' for _ in keys)},?,?)"
            cur = self.db.execute(sql, stored + [stamp, stamp])
            self.db.commit()
            self.backup()
            return self.get(cur.lastrowid)

    def add_many(self, values_list):
        """Insert a reviewed batch in one transaction and write one Excel backup."""
        if not isinstance(values_list, list) or not values_list:
            raise ValueError("Batch must contain at least one entry")
        if len(values_list) > 100:
            raise ValueError("A batch is limited to 100 entries")
        with self.lock:
            prepared = [self._validate(values) for values in values_list]
            stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
            keys = list(FIELDS)
            sql = f"INSERT INTO parts ({','.join(keys)},created_at,updated_at) VALUES ({','.join('?' for _ in keys)},?,?)"
            ids = []
            try:
                for data in prepared:
                    stored = [json.dumps(data[k], ensure_ascii=False)
                              if k in ("attributes", "pinout") else data[k] for k in keys]
                    ids.append(self.db.execute(sql, stored + [stamp, stamp]).lastrowid)
                self.db.commit()
            except Exception:
                self.db.rollback()
                raise
            self.backup()
            return [self.get(entry_id) for entry_id in ids]

    def update(self, entry_id, changes):
        with self.lock:
            old = self.get(entry_id)
            data = self._validate(changes, old)
            keys = list(FIELDS)
            stored = [json.dumps(data[k], ensure_ascii=False) if k in ("attributes", "pinout") else data[k] for k in keys]
            stamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
            self.db.execute(f"UPDATE parts SET {','.join(f'{k}=?' for k in keys)},updated_at=? WHERE id=?",
                            stored + [stamp, int(entry_id)])
            self.db.commit()
            self.backup()
            return self.get(entry_id)

    def delete(self, entry_id):
        with self.lock:
            self.get(entry_id)
            self.db.execute("DELETE FROM parts WHERE id=?", (int(entry_id),))
            self.db.commit()
            self.backup()

    def backup(self):
        with self.lock:
            result = make_xlsx(self.list())
            version_folder = self.folder / "backups"
            version_folder.mkdir(exist_ok=True)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            (version_folder / f"ElectroCat_{timestamp}.xlsx").write_bytes(result)
            target = self.folder / "ElectroCat_inventory.xlsx"
            tmp = self.folder / f".{uuid.uuid4().hex}.xlsx.tmp"
            try:
                tmp.write_bytes(result)
                try:
                    os.replace(tmp, target)
                except PermissionError as exc:
                    raise ValueError("Excel is holding the main workbook open. Your change was saved in the database and the timestamped backup; close Excel and try an edit again.") from exc
            finally:
                if tmp.exists():
                    tmp.unlink()
            return target
