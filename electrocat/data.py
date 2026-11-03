"""Reference sample and editable category-specific field suggestions."""

AOS_URL = "https://www.aosmd.com/products/mosfets/low-voltage-mosfets-12v-30v/ao3400a"
AOS_PDF = "https://www.aosmd.com/res/data_sheets/AO3400A.pdf"

TEMPLATES = {
    "MOSFET": ["VDS max", "ID continuous", "VGS max", "VGS(th)", "RDS(on)"],
    "BJT": ["VCEO", "IC max", "hFE", "VBE(sat)"],
    "Diode": ["VRRM", "IF max", "VF", "Recovery time"],
    "LED": ["Color / wavelength", "VF", "IF", "Optical power"],
    "Resistor": ["Resistance", "Tolerance", "Power", "TCR"],
    "Capacitor": ["Capacitance", "Voltage rating", "Dielectric", "Tolerance", "ESR"],
    "Inductor": ["Inductance", "Rated current", "DCR", "Saturation current"],
    "Microcontroller": ["Core", "Supply voltage", "Flash", "RAM", "Clock"],
    "IC": ["Function", "Supply voltage", "Interface", "Current"],
    "Sensor": ["Measured quantity", "Range", "Accuracy", "Supply voltage", "Interface"],
    "Module": ["Function", "Supply voltage", "Interface", "Dimensions"],
    "Connector": ["Pin count", "Pitch", "Rated voltage", "Rated current"],
    "Other": ["Key parameter", "Rating", "Voltage"],
}


def ao3400a():
    return {
        "part_number": "AO3400A", "category": "MOSFET",
        "subtype": "N-channel enhancement / trench",
        "description": "N-channel enhancement-mode trench MOSFET; very low RDS(on), load switching / PWM",
        "manufacturer": "Alpha & Omega Semiconductor (reference; check actual part marking)",
        "package": "SOT-23", "status": "reference",
        "quantity": None, "location": "", "supplier": "", "purchase_url": "",
        "source_url": AOS_URL, "datasheet_url": AOS_PDF,
        "notes": "AOS reference ratings; generic marketplace parts may use another maker's die. ID depends on PCB thermal conditions.",
        "attributes": [
            {"label": "VDS max", "value": "30 V", "note": "absolute maximum"},
            {"label": "ID continuous", "value": "5.7 A", "note": "TA=25°C; PCB-dependent"},
            {"label": "VGS max", "value": "±12 V", "note": "absolute maximum"},
            {"label": "VGS(th)", "value": "0.65–1.45 V", "note": "ID=250 µA; not fully-on gate voltage"},
            {"label": "RDS(on) @ 4.5V", "value": "≤32 mΩ", "note": "ID=5 A, TJ=25°C"},
            {"label": "RDS(on) @ 2.5V", "value": "≤48 mΩ", "note": "ID=3 A, TJ=25°C"},
            {"label": "RDS(on) @ 10V", "value": "≤26.5 mΩ", "note": "ID=5.7 A, TJ=25°C"},
            {"label": "PD", "value": "1.4 W", "note": "TA=25°C; transient thermal rating"},
        ],
        "pinout": [
            {"number": "1", "signal": "G", "label": "Gate"},
            {"number": "2", "signal": "S", "label": "Source"},
            {"number": "3", "signal": "D", "label": "Drain"},
        ],
    }
