#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Skaner rejestrów Modbus pompy ciepła Midea (M-Thermal / Clivet / Pro Heat itp.)
przez Waveshare RTU over TCP + generator configuration.yaml dla Home Assistant.

Użycie:
  pip install "pymodbus>=3.5"
  python midea_scan.py all            # skan -> midea_registers.txt -> configuration.yaml
  python midea_scan.py scan           # tylko skan
  python midea_scan.py yaml           # tylko TXT -> YAML
Opcje: --host 192.168.0.36 --port 4196 --slave 1 --start 0 --end 1000 --input-registers
"""
import argparse
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
TXT_FILE = os.path.join(HERE, "midea_registers.txt")
YAML_FILE = os.path.join(HERE, "configuration.yaml")

# ---------------------------------------------------------------------------
# Znana mapa rejestrów Midea (holding, FC03) wg dokumentacji M-Thermal.
# adres: (nazwa, jednostka, device_class, scale, data_type, rodzaj)
# rodzaj: "sensor" albo "switch"
# ---------------------------------------------------------------------------
KNOWN = {
    0:   ("Midea Power On/Off (bity)", None, None, 1, "uint16", "sensor"),
    1:   ("Midea Tryb pracy (1=auto 2=chłodz. 3=grzanie)", None, None, 1, "uint16", "sensor"),
    2:   ("Midea Zadana temp wody strefa", "°C", "temperature", 1, "uint16", "sensor"),
    3:   ("Midea Zadana temp powietrza", "°C", "temperature", 0.5, "uint16", "sensor"),
    4:   ("Midea Zadana temp CWU T5s", "°C", "temperature", 1, "uint16", "sensor"),
    5:   ("Midea Ustawienia funkcji (bity)", None, None, 1, "uint16", "sensor"),
    6:   ("Midea Wybór krzywej grzewczej", None, None, 1, "uint16", "sensor"),
    7:   ("Midea Wymuszone grzanie CWU", None, None, 1, "uint16", "switch"),
    8:   ("Midea Wymuszona grzałka TBH", None, None, 1, "uint16", "switch"),
    100: ("Midea Częstotliwość sprężarki", "Hz", "frequency", 1, "uint16", "sensor"),
    101: ("Midea Aktualny tryb pracy", None, None, 1, "uint16", "sensor"),
    102: ("Midea Prędkość wentylatora", "rpm", None, 1, "uint16", "sensor"),
    103: ("Midea Otwarcie zaworu EEV", "P", None, 1, "uint16", "sensor"),
    104: ("Midea Temp wody wlot Tw_in", "°C", "temperature", 1, "int16", "sensor"),
    105: ("Midea Temp wody wylot Tw_out", "°C", "temperature", 1, "int16", "sensor"),
    106: ("Midea Temp wymiennika T3", "°C", "temperature", 1, "int16", "sensor"),
    107: ("Midea Temp zewnętrzna T4", "°C", "temperature", 1, "int16", "sensor"),
    108: ("Midea Temp tłoczenia Tp", "°C", "temperature", 1, "int16", "sensor"),
    109: ("Midea Temp ssania Th", "°C", "temperature", 1, "int16", "sensor"),
    110: ("Midea Temp T1 (wyjście wody całk.)", "°C", "temperature", 1, "int16", "sensor"),
    111: ("Midea Temp T1B", "°C", "temperature", 1, "int16", "sensor"),
    112: ("Midea Temp czynnika ciecz T2", "°C", "temperature", 1, "int16", "sensor"),
    113: ("Midea Temp czynnika gaz T2B", "°C", "temperature", 1, "int16", "sensor"),
    114: ("Midea Temp pokojowa Ta", "°C", "temperature", 1, "int16", "sensor"),
    115: ("Midea Temp zasobnika CWU T5", "°C", "temperature", 1, "int16", "sensor"),
    116: ("Midea Ciśnienie wysokie", "kPa", "pressure", 1, "uint16", "sensor"),
    117: ("Midea Ciśnienie niskie", "kPa", "pressure", 1, "uint16", "sensor"),
    118: ("Midea Prąd jednostki zewn.", "A", "current", 1, "uint16", "sensor"),
    119: ("Midea Napięcie jednostki zewn.", "V", "voltage", 1, "uint16", "sensor"),
    120: ("Midea Temp bufora Tbt1", "°C", "temperature", 1, "int16", "sensor"),
    121: ("Midea Temp bufora Tbt2", "°C", "temperature", 1, "int16", "sensor"),
    122: ("Midea Czas pracy sprężarki", "h", "duration", 1, "uint16", "sensor"),
    123: ("Midea Moc jednostki (kod)", None, None, 1, "uint16", "sensor"),
    124: ("Midea Aktualny błąd", None, None, 1, "uint16", "sensor"),
    125: ("Midea Błąd historyczny 1", None, None, 1, "uint16", "sensor"),
    126: ("Midea Błąd historyczny 2", None, None, 1, "uint16", "sensor"),
    127: ("Midea Błąd historyczny 3", None, None, 1, "uint16", "sensor"),
    128: ("Midea Status bity 1", None, None, 1, "uint16", "sensor"),
    129: ("Midea Wyjścia obciążeń (bity)", None, None, 1, "uint16", "sensor"),
    134: ("Midea Wersja oprogramowania", None, None, 1, "uint16", "sensor"),
    135: ("Midea Wersja sterownika", None, None, 1, "uint16", "sensor"),
    136: ("Midea Docelowa częstotliwość sprężarki", "Hz", "frequency", 1, "uint16", "sensor"),
    137: ("Midea Prąd szyny DC", "A", "current", 1, "uint16", "sensor"),
    138: ("Midea Napięcie szyny DC", "V", "voltage", 1, "uint16", "sensor"),
    139: ("Midea Temp modułu falownika TF", "°C", "temperature", 1, "int16", "sensor"),
    140: ("Midea Krzywa T1S strefa 1", "°C", "temperature", 1, "int16", "sensor"),
    141: ("Midea Krzywa T1S strefa 2", "°C", "temperature", 1, "int16", "sensor"),
    142: ("Midea Zużycie energii (hi)", None, None, 1, "uint16", "sensor"),
    143: ("Midea Zużycie energii (lo)", "kWh", "energy", 1, "uint16", "sensor"),
    144: ("Midea Moc pobierana", "kW", "power", 0.01, "uint16", "sensor"),
    145: ("Midea Moc wyjściowa (hi)", None, None, 1, "uint16", "sensor"),
    146: ("Midea Moc wyjściowa (lo)", None, None, 1, "uint16", "sensor"),
}


def to_signed(v):
    return v - 65536 if v > 32767 else v


def slug(text):
    t = text.lower()
    for a, b in zip("ąćęłńóśźż", "acelnoszz"):
        t = t.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "_", t).strip("_")


# ---------------------------------------------------------------------------
# SKAN
# ---------------------------------------------------------------------------
def make_client(host, port, timeout):
    try:
        from pymodbus.client import ModbusTcpClient
        from pymodbus import FramerType
        return ModbusTcpClient(host, port=port, framer=FramerType.RTU, timeout=timeout)
    except ImportError:
        try:
            from pymodbus.client import ModbusTcpClient
            from pymodbus.framer import Framer
            return ModbusTcpClient(host, port=port, framer=Framer.RTU, timeout=timeout)
        except ImportError:
            print("Brak pymodbus. Zainstaluj: pip install \"pymodbus>=3.5\"")
            sys.exit(1)


def read(client, fc, addr, count, slave):
    fn = client.read_holding_registers if fc == 3 else client.read_input_registers
    for kw in ("device_id", "slave", "unit"):
        try:
            rr = fn(addr, count=count, **{kw: slave})
            break
        except TypeError:
            continue
    else:
        return None
    if rr is None or rr.isError():
        return None
    return list(rr.registers)


def scan(args):
    client = make_client(args.host, args.port, args.timeout)
    if not client.connect():
        print(f"Nie można połączyć z {args.host}:{args.port}")
        sys.exit(1)
    print(f"Połączono z {args.host}:{args.port}, slave {args.slave}")
    results = []  # (typ, adres, wartość)
    kinds = [(3, "holding")] + ([(4, "input")] if args.input_registers else [])
    block = 10
    for fc, kind in kinds:
        addr = args.start
        while addr <= args.end:
            cnt = min(block, args.end - addr + 1)
            regs = read(client, fc, addr, cnt, args.slave)
            time.sleep(args.delay * 0.2)
            if regs is not None:
                for i, v in enumerate(regs):
                    results.append((kind, addr + i, v))
                print(f"[{kind}] {addr}-{addr+cnt-1}: OK")
            else:
                # schodzimy do pojedynczych rejestrów
                for a in range(addr, addr + cnt):
                    r = read(client, fc, a, 1, args.slave)
                    time.sleep(args.delay * 0.1)
                    if r is not None:
                        results.append((kind, a, r[0]))
                        print(f"[{kind}] {a}: {r[0]}")
            addr += cnt
    client.close()

    with open(TXT_FILE, "w", encoding="utf-8") as f:
        f.write(f"# Skan Midea {args.host}:{args.port} slave={args.slave} "
                f"{time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write("# typ;adres;raw;signed;x0.1;nazwa;jednostka\n")
        for kind, a, v in results:
            k = KNOWN.get(a) if kind == "holding" else None
            name = k[0] if k else f"unknown_{kind}_{a}"
            unit = (k[1] or "") if k else ""
            f.write(f"{kind};{a};{v};{to_signed(v)};{to_signed(v)/10:.1f};{name};{unit}\n")
    print(f"\nZapisano {len(results)} rejestrów do {TXT_FILE}")


# ---------------------------------------------------------------------------
# TXT -> YAML
# ---------------------------------------------------------------------------
def q(s):
    return '"' + str(s).replace('"', "'") + '"'


def generate_yaml(args):
    if not os.path.exists(TXT_FILE):
        print(f"Brak pliku {TXT_FILE} – najpierw uruchom: python midea_scan.py scan")
        sys.exit(1)
    rows = []
    with open(TXT_FILE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            p = line.split(";")
            if len(p) < 7:
                continue
            rows.append((p[0], int(p[1]), int(p[2])))

    sensors, switches = [], []
    for kind, a, raw in rows:
        k = KNOWN.get(a) if kind == "holding" else None
        if k:
            name, unit, dc, scale, dtype, typ = k
        else:
            if raw == 0 and not args.include_zero:
                continue
            name, unit, dc, scale, dtype, typ = (f"Midea {kind} {a}", None, None, 1, "uint16", "sensor")
        uid = f"midea_{kind}_{a}"
        if typ == "switch":
            switches.append([
                f"      - name: {q(name)}",
                f"        unique_id: {uid}",
                f"        slave: {args.slave}",
                f"        address: {a}",
                f"        write_type: holding",
                f"        command_on: 1",
                f"        command_off: 0",
                f"        verify:",
                f"          input_type: holding",
                f"          address: {a}",
                f"          state_on: 1",
                f"          state_off: 0",
            ])
        else:
            s = [
                f"      - name: {q(name)}",
                f"        unique_id: {uid}",
                f"        slave: {args.slave}",
                f"        address: {a}",
                f"        input_type: {kind}",
                f"        data_type: {dtype}",
                f"        scan_interval: 30",
            ]
            if scale != 1:
                s.append(f"        scale: {scale}")
                s.append(f"        precision: 2")
            if unit:
                s.append(f"        unit_of_measurement: {q(unit)}")
            if dc:
                s.append(f"        device_class: {dc}")
                if dc == "energy":
                    s.append("        state_class: total_increasing")
                elif dc != "duration":
                    s.append("        state_class: measurement")
            sensors.append(s)

    out = [
        "# Wygenerowane przez midea_scan.py – " + time.strftime("%Y-%m-%d %H:%M:%S"),
        "# Wklej sekcję 'modbus:' do swojego configuration.yaml (tylko raz!).",
        "",
        "modbus:",
        f"  - name: {args.name}",
        "    type: rtuovertcp",
        f"    host: {args.host}",
        f"    port: {args.port}",
        f"    delay: {int(args.delay)}",
        f"    timeout: {int(args.timeout)}",
    ]
    if sensors:
        out.append("    sensors:")
        for s in sensors:
            out += s
    if switches:
        out.append("    switches:")
        for s in switches:
            out += s
    with open(YAML_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(out) + "\n")
    print(f"Zapisano {YAML_FILE}: {len(sensors)} sensorów, {len(switches)} przełączników")


def main():
    ap = argparse.ArgumentParser(description="Skaner Midea Modbus -> Home Assistant")
    ap.add_argument("mode", nargs="?", default="all", choices=["all", "scan", "yaml"])
    ap.add_argument("--name", default="midea")
    ap.add_argument("--host", default="192.168.0.36")
    ap.add_argument("--port", type=int, default=4196)
    ap.add_argument("--slave", type=int, default=1)
    ap.add_argument("--start", type=int, default=0)
    ap.add_argument("--end", type=int, default=1000)
    ap.add_argument("--delay", type=float, default=1)
    ap.add_argument("--timeout", type=float, default=5)
    ap.add_argument("--input-registers", action="store_true", help="skanuj też FC04")
    ap.add_argument("--include-zero", action="store_true",
                    help="dodaj do YAML także nieznane rejestry o wartości 0")
    args = ap.parse_args()
    if args.mode in ("all", "scan"):
        scan(args)
    if args.mode in ("all", "yaml"):
        generate_yaml(args)


if __name__ == "__main__":
    main()
