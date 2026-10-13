# Skrypt skanujący rejestry pompy Midea (Waveshare RTU over TCP) i generator configuration.yaml dla HA

Gotowy skrypt Python do pobrania (bez zmian w aplikacji webowej).

## Co dostaniesz
- `midea_scan.py` – jeden plik, uruchamiany na komputerze w tej samej sieci co Waveshare (192.168.0.36:4196).
- `README.txt` – instrukcja uruchomienia po polsku.

## Działanie skryptu
1. **Skan** – łączy się przez Modbus RTU over TCP (slave 1 domyślnie, opóźnienie 1 s, timeout 5 s, jak w Twojej konfiguracji) i odczytuje:
   - holding registers (FC03) w zakresie 0–1000 (zakres i slave ustawialne parametrami),
   - opcjonalnie input registers (FC04).
   Czyta blokami, a przy błędzie bloku schodzi do pojedynczych rejestrów, żeby nie pominąć działających adresów.
2. **Plik TXT** `midea_registers.txt` – tabela wszystkich odpowiadających rejestrów: adres, typ, wartość surowa, wartość jako signed, wartość ×0.1, oraz nazwa/jednostka, jeśli adres jest znany z mapy Midea M-Thermal (np. 0 = Power, 100+ = temperatury T1–T4, Tw_in/Tw_out, moc, częstotliwość sprężarki, kody błędów). Nieznane rejestry oznaczone jako `unknown_<adres>`.
3. **Generowanie YAML** – skrypt otwiera ten TXT i tworzy `configuration.yaml` z sekcją:
   ```text
   modbus:
     - name: midea
       type: rtuovertcp
       host: 192.168.0.36
       port: 4196
       delay: 1
       timeout: 5
       sensors: [...]   # każdy rejestr jako sensor
       switches: [...]  # rejestry on/off ze znanej mapy (np. zasilanie stref, DHW)
   ```
   Znane rejestry dostają poprawną nazwę, `unit_of_measurement`, `device_class`, `scale`, `data_type` (int16/uint16) i `scan_interval`. Nieznane, ale niezerowe – trafiają jako sensory surowe (można je potem przemianować).

## Tryby uruchomienia
- `python midea_scan.py scan` – tylko skan → TXT
- `python midea_scan.py yaml` – tylko TXT → configuration.yaml
- `python midea_scan.py all` – oba kroki (domyślnie)
- Parametry: `--host --port --slave --start --end --input-registers`

## Szczegóły techniczne
- Biblioteka `pymodbus` (3.x), `ModbusTcpClient` z `framer=RTU`.
- Mapa rejestrów Midea M-Thermal / Clivet / Pro Heat wbudowana w skrypt jako słownik.
- Pliki wynikowe zapisywane obok skryptu; kopia skryptu udostępniona do pobrania.
- Nie mogę przetestować połączenia z Twoją pompą z tego środowiska – sprawdzę składnię i generowanie YAML na danych przykładowych.
