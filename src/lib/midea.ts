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
    const kind = (p[0] ?? "").trim() === "input" ? "input" : "holding";
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
    .replace(/[ąćęłńóśźż]/g, (c) => PL[c] ?? c)
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

export type LovelaceStyle = "entities" | "tiles" | "history" | "gauges" | "combo";

const nm = (r: Reg) => q(r.name.replace(/^Midea /, ""));

function gaugeRange(r: Reg): [number, number] {
  switch (r.unit) {
    case "°C": return [-20, 70];
    case "Hz": return [0, 120];
    case "V": return [180, 260];
    case "A": return [0, 30];
    case "kPa": return [0, 4500];
    case "rpm": return [0, 1000];
    case "P": return [0, 500];
    default: return [0, 100];
  }
}

function card(regs: Reg[], style: Exclude<LovelaceStyle, "combo">, title: string, ind: string): string[] {
  const I = (s: string) => ind + s;
  if (style === "entities") {
    return [I("type: entities"), I(`title: ${q(title)}`), I("show_header_toggle: false"), I("entities:"),
      ...regs.flatMap((r) => [I(`  - entity: ${entityId(r)}`), I(`    name: ${nm(r)}`)])];
  }
  if (style === "tiles") {
    return [I("type: grid"), I("columns: 3"), I("square: false"), I("cards:"),
      ...regs.flatMap((r) => [I("  - type: tile"), I(`    entity: ${entityId(r)}`), I(`    name: ${nm(r)}`)])];
  }
  if (style === "history") {
    return [I("type: history-graph"), I(`title: ${q(title + " – historia")}`), I("hours_to_show: 24"), I("entities:"),
      ...regs.flatMap((r) => [I(`  - entity: ${entityId(r)}`), I(`    name: ${nm(r)}`)])];
  }
  return [I("type: grid"), I("columns: 3"), I("square: false"), I("cards:"),
    ...regs.flatMap((r) => {
      const [min, max] = gaugeRange(r);
      return [I("  - type: gauge"), I(`    entity: ${entityId(r)}`), I(`    name: ${nm(r)}`), I(`    min: ${min}`), I(`    max: ${max}`), I("    needle: true")];
    })];
}

export function buildLovelace(regs: Reg[], style: LovelaceStyle, title: string) {
  if (!regs.length) return "# Zaznacz przynajmniej jeden parametr\n";
  if (style !== "combo") return card(regs, style, title, "").join("\n") + "\n";
  // combo: przełączniki jako kafelki, kluczowe wartości jako zegary, temperatury na wykresie, reszta w liście
  const sw = regs.filter((r) => r.address === 7 || r.address === 8);
  const temps = regs.filter((r) => r.unit === "°C");
  const gauges = regs.filter((r) => ["Hz", "V", "A", "kPa"].includes(r.unit));
  const rest = regs.filter((r) => !sw.includes(r) && !temps.includes(r) && !gauges.includes(r));
  const L = ["type: vertical-stack", "cards:"];
  const push = (rs: Reg[], s: Exclude<LovelaceStyle, "combo">, t: string) => {
    if (!rs.length) return;
    const c = card(rs, s, t, "    ");
    c[0] = "  - " + c[0].trimStart();
    L.push(...c);
  };
  push(sw, "tiles", title);
  push(temps, "tiles", title);
  push(temps, "history", title);
  push(gauges, "gauges", title);
  push(rest, "entities", title + " – diagnostyka");
  return L.join("\n") + "\n";
}
