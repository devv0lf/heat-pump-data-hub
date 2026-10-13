import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { buildLovelace, buildYaml, category, entityId, parseRegisters, type Category, type LovelaceStyle } from "@/lib/midea";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Midea Modbus Decoder — generator midea.yaml dla HA" },
      { name: "description", content: "Wklej midea_registers.txt i wygeneruj midea.yaml oraz karty Lovelace dla Home Assistant." },
      { property: "og:title", content: "Midea Modbus Decoder" },
      { property: "og:description", content: "Generator midea.yaml i kart Lovelace dla pompy Midea przez Waveshare." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

const REPO_URL = "https://github.com/devv0lf/heat-pump-data-hub/";
const SCAN_PY_URL = "https://raw.githubusercontent.com/devv0lf/heat-pump-data-hub/refs/heads/main/midea_scan.py";
const CATS: Category[] = ["Sterowanie", "Temperatury", "Praca", "Elektryka i ciśnienia", "Diagnostyka", "Inne"];

function Panel({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className="border border-border bg-card/80 backdrop-blur">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
        <span className="text-accent">[{n}]</span>
        <span className="text-primary glow">{title}</span>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Btn(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={"border border-primary px-3 py-1 text-xs uppercase tracking-wider text-primary hover:bg-primary hover:text-primary-foreground disabled:opacity-40 " + (props.className ?? "")}
    />
  );
}

function SaveBtn({ href, file, label }: { href: string; file: string; label: string }) {
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch(href);
      if (!r.ok) throw new Error(String(r.status));
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = file;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(href, "_blank", "noopener");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Btn onClick={save} disabled={busy}>{busy ? "> pobieranie..." : label}</Btn>
  );
}

function Code({ text, file }: { text: string; file?: string }) {
  const [ok, setOk] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setOk(true);
    setTimeout(() => setOk(false), 1500);
  };
  const dl = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/yaml" }));
    a.download = file!;
    a.click();
  };
  return (
    <div>
      <div className="mb-2 flex gap-2">
        <Btn onClick={copy}>{ok ? "> skopiowano" : "[ kopiuj ]"}</Btn>
        {file && <Btn onClick={dl}>[ pobierz {file} ]</Btn>}
      </div>
      <pre className="max-h-[480px] overflow-auto border border-border bg-background p-3 text-xs leading-relaxed text-foreground">{text}</pre>
    </div>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} className="border border-input bg-background px-2 py-1 text-sm text-foreground outline-none focus:border-primary" />
    </label>
  );
}

function Index() {
  const [raw, setRaw] = useState("");
  const [host, setHost] = useState("192.168.0.36");
  const [port, setPort] = useState("4196");
  const [slave, setSlave] = useState("1");
  const [unknown, setUnknown] = useState(false);
  const [style, setStyle] = useState<LovelaceStyle>("entities");
  const [title, setTitle] = useState("Pompa ciepła Midea");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const regs = useMemo(() => parseRegisters(raw), [raw]);
  const conn = { host, port: Number(port) || 4196, slave: Number(slave) || 1, name: "midea" };
  const yaml = useMemo(() => buildYaml(regs, conn, unknown), [regs, host, port, slave, unknown]);
  const usable = regs.filter((r) => unknown || !r.unknown || category(r) === "Sterowanie");
  const chosen = usable.filter((r) => picked.has(entityId(r)));
  const lovelace = buildLovelace(chosen, style, title);

  const loadSample = async () => {
    const t = await (await fetch("/sample_midea_registers.txt")).text();
    setRaw(t);
    const def = parseRegisters(t).filter((r) => !r.unknown && r.raw !== 0 && r.raw !== 255);
    setPicked(new Set(def.map(entityId)));
  };
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div className="min-h-screen bg-background scanlines">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
        <div>
          <p className="text-xs text-muted-foreground">root@homeassistant:~$ ./decode --device midea --proto rtuovertcp</p>
          <h1 className="mt-2 text-3xl font-bold text-primary glow md:text-5xl">&gt; MIDEA_MODBUS_DECODER<span className="animate-pulse">_</span></h1>
          <p className="mt-2 text-sm text-muted-foreground">Skan rejestrów pompy → midea.yaml → dashboard Lovelace.</p>
        </div>

        <Panel n="01" title="SCAN_REGISTER // skrypt">
          <div className="flex flex-wrap gap-3">
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="border border-accent px-3 py-1 text-xs uppercase text-accent hover:bg-accent hover:text-accent-foreground">[ repozytorium heat-pump-data-hub ]</a>
            <SaveBtn href={SCAN_PY_URL} file="midea_scan.py" label="[ pobierz midea_scan.py ]" />
          </div>
          <pre className="mt-3 overflow-auto border border-border bg-background p-3 text-xs">{`$ cd ~/Downloads
$ python3 -m venv venv && source venv/bin/activate
$ pip install "pymodbus>=3.5"
$ python3 midea_scan.py --host ${host} --port ${port}
# wynik: midea_registers.txt`}</pre>
        </Panel>

        <Panel n="02" title="INPUT_BUFFER // midea_registers.txt">
          <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            <Input label="host IP" value={host} onChange={setHost} />
            <Input label="port" value={port} onChange={setPort} />
            <Input label="slave" value={slave} onChange={setSlave} />
            <div className="flex items-end"><Btn onClick={loadSample}>[ load_sample ]</Btn></div>
          </div>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="# wklej tutaj zawartość midea_registers.txt&#10;holding;0;4;4;0.4;Midea Power On/Off (bity);"
            className="h-56 w-full resize-y border border-input bg-background p-3 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span>&gt; wykryto rejestrów: <b className="text-primary">{regs.length}</b></span>
            <label className="flex items-center gap-2"><input type="checkbox" checked={unknown} onChange={(e) => setUnknown(e.target.checked)} className="accent-primary" /> dołącz nieznane rejestry (unknown_*)</label>
          </div>
        </Panel>

        <Panel n="03" title="OUTPUT // midea.yaml">
          {regs.length ? <Code text={yaml} file="midea.yaml" /> : <p className="text-xs text-muted-foreground">&gt; oczekiwanie na dane wejściowe...</p>}
        </Panel>

        <Panel n="04" title="PATCH // configuration.yaml">
          <p className="mb-2 text-xs text-muted-foreground">Zapisz plik jako <span className="text-accent">/config/midea.yaml</span> i dodaj do <span className="text-accent">configuration.yaml</span> (tylko jedna sekcja <b>modbus:</b>!):</p>
          <Code text={`modbus:\n  - !include midea.yaml\n  # - !include reku.yaml   # inne urządzenia Modbus\n`} />
          <p className="mt-2 text-xs text-destructive">! Klucze w midea.yaml muszą zaczynać się od lewej krawędzi (bez wcięcia). Potem: Narzędzia deweloperskie → Sprawdź konfigurację → Restart.</p>
        </Panel>

        <Panel n="05" title="DASHBOARD // lovelace">
          {!usable.length ? (
            <p className="text-xs text-muted-foreground">&gt; brak encji — wklej skan.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Btn onClick={() => setPicked(new Set(usable.map(entityId)))}>[ wszystko ]</Btn>
                  <Btn onClick={() => setPicked(new Set())}>[ nic ]</Btn>
                  {(["entities", "tiles", "history", "gauges", "combo"] as const).map((s) => (
                    <Btn key={s} onClick={() => setStyle(s)} className={style === s ? "bg-primary text-primary-foreground" : ""}>{s}</Btn>
                  ))}
                </div>
                <Input label="tytuł karty" value={title} onChange={setTitle} />
                <div className="max-h-[420px] space-y-3 overflow-auto pr-2">
                  {CATS.map((c) => {
                    const list = usable.filter((r) => category(r) === c);
                    if (!list.length) return null;
                    return (
                      <div key={c}>
                        <p className="mb-1 text-xs text-accent">## {c}</p>
                        {list.map((r) => {
                          const id = entityId(r);
                          return (
                            <label key={id + r.address} className="flex cursor-pointer items-center gap-2 py-0.5 text-xs hover:text-primary">
                              <input type="checkbox" checked={picked.has(id)} onChange={() => toggle(id)} className="accent-primary" />
                              <span className="flex-1 truncate">{r.name}</span>
                              <span className="text-muted-foreground">{r.raw}{r.unit && " " + r.unit}</span>
                            </label>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs text-muted-foreground">Dashboard → Edytuj → Dodaj kartę → Ręcznie (YAML). Wybrano: <b className="text-primary">{chosen.length}</b></p>
                <Code text={lovelace} />
              </div>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">* Identyfikatory encji wyliczane z nazw — jeśli HA nada inne, sprawdź je w Ustawienia → Encje.</p>
        </Panel>
      </main>
    </div>
  );
}
