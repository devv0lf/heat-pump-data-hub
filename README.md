# Skaner Pompy Ciepła Midea (Waveshare RTU over TCP) -> Home Assistant

Skrypt Python do automatycznego przeszukiwania rejestrów Modbus w pompie ciepła Midea (oraz zgodnych: Kaisai, Clivet, Pro Heat itp.) podłączonej przez konwerter **Waveshare** (w trybie RTU over TCP) oraz generowania gotowych encji do pliku `configuration.yaml` dla Home Assistant.

---

## 1. Wymagania wstępne

- Komputer w tej samej sieci lokalnej (LAN / Wi-Fi) co konwerter Waveshare.
- Python 3.9 lub nowszy.

### Przygotowanie środowiska (macOS / Linux):

```bash
cd ~/Downloads
python3 -m venv venv
source venv/bin/activate
pip install "pymodbus>=3.5"
