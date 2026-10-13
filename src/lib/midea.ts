export type Reg = {
  kind: "holding" | "input";
  address: number;
  raw: number;
  signed: number;
  name: string;
  unit: string;
  unknown: boolean;
};

export type Conn = { host: string; port: number; slave: number; name: string };

export const SWITCH_ADDR = [7, 8];
const SCALE_01 = [118]; // prąd sprężarki x0.1

export function parseRegisters(text: string): Reg[] {
  const out: Reg[] = [];
  const seen = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    const p = l.split(";");
    if (p.length < 3) continue;
    const kind = p[0].trim() === "input" ? "input" : "holding";
    const address = Number(p[1]);
    const raw = Number(p[2]);
    if (!Number.isFinite(address) || !Number.isFinite(raw)) continue;
    const key = kind + address;
    if (seen.has(key)) continue;
    seen.add(key);
    const name = (p[5] || "").trim() || `unknown_${kind}_${address}`;
    out.push({
      kind,
      address,
      raw,
      signed: Number(p[3]) || raw,
      name,
      unit: (p[6] || "").trim(),
      unknown: name.startsWith("unknown_"),
    });
  }
  return out;
}

const PL: Record<string, string> = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };
export function slug(s: string) {
  return s
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (c) => PL[c])
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function entityId(r: Reg) {
  return (SWITCH_ADDR.includes(r.address) && r.kind === "holding" ? "switch." : "sensor.") + slug(r.name);
}

export type Category = "Sterowanie" | "Temperatury" | "Praca" | "Elektryka i ciśnienia" | "Diagnostyka" | "Inne";
export function category(r: Reg): Category {
  if (SWITCH_ADDR.includes(r.address)) return "Sterowanie";
  if (r.unit === "°C") return "Temperatury";
  if (["Hz", "rpm", "P"].includes(r.unit)) return "Praca";
  if (["A", "V", "kPa", "W", "kW"].includes(r.unit)) return "Elektryka i ciśnienia";
  if (r.unknown) return "Inne";
  return "Diagnostyka";
}

function meta(r: Reg) {
  const m: string[] = [];
  const u = r.unit;
  if (u) m.push(`unit_of_measurement: "${u === "rpm" ? "obr/min" : u}"`);
  const dc: Record<string, string> = { "°C": "temperature", V: "voltage", A: "current", kPa: "pressure", h: "duration", W: "power", kW: "power" };
  if (dc[u]) m.push(`device_class: ${dc[u]}`);
  if (u === "h") m.push("state_class: total_increasing");
  else if (u) m.push("state_class: measurement");
  return m;
}

const q = (s: string) => `"${s.replace(/"/g, '\\"')}"`;

export function buildYaml(regs: Reg[], c: Conn, includeUnknown: boolean) {
  const L: string[] = [
    `name: ${c.name}`,
    "type: rtuovertcp",
    `host: ${c.host}`,
    `port: ${c.port}`,
    "delay: 1",
    "timeout: 5",
    "",
  ];
  const sw = regs.filter((r) => r.kind === "holding" && SWITCH_ADDR.includes(r.address));
  if (sw.length) {
    L.push("switches:");
    for (const r of sw) {
      L.push(
        `  - name: ${q(r.name)}`,
        `    unique_id: ${c.name}_switch_${r.address}`,
        `    slave: ${c.slave}`,
        `    address: ${r.address}`,
        "    write_type: holding",
        "    command_on: 1",
        "    command_off: 0",
        "    verify:",
        "      input_type: holding",
        `      address: ${r.address}`,
        "      state_on: 1",
        "      state_off: 0",
        "",
      );
    }
  }
  const sens = regs.filter((r) => !sw.includes(r) && (includeUnknown || !r.unknown));
  if (sens.length) {
    L.push("sensors:");
    for (const r of sens) {
      const signed = r.unit === "°C";
      L.push(
        `  - name: ${q(r.name)}`,
        `    unique_id: ${c.name}_${r.kind}_${r.address}`,
        `    slave: ${c.slave}`,
        `    address: ${r.address}`,
        `    input_type: ${r.kind}`,
        `    data_type: ${signed ? "int16" : "uint16"}`,
      );
      if (SCALE_01.includes(r.address) && r.kind === "holding") L.push("    scale: 0.1", "    precision: 1");
      L.push(`    scan_interval: ${r.unit === "h" ? 3600 : r.unit === "°C" || r.unit ? 15 : 30}`);
      for (const m of meta(r)) L.push("    " + m);
      L.push("");
    }
  }
  return L.join("\n").trimEnd() + "\n";
}

export function buildLovelace(regs: Reg[], style: "entities" | "tiles", title: string) {
  if (!regs.length) return "# Zaznacz przynajmniej jeden parametr\n";
  if (style === "entities") {
    return [`type: entities`, `title: ${q(title)}`, "show_header_toggle: false", "entities:", ...regs.map((r) => `  - entity: ${entityId(r)}\n    name: ${q(r.name.replace(/^Midea /, ""))}`)].join("\n") + "\n";
  }
  return [
    "type: grid",
    "columns: 3",
    "square: false",
    "cards:",
    ...regs.map((r) => `  - type: tile\n    entity: ${entityId(r)}\n    name: ${q(r.name.replace(/^Midea /, ""))}`),
  ].join("\n") + "\n";
}
