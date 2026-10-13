# Instrukcja Obsługi: Skaner Pompy Ciepła Midea (Waveshare RTU over TCP) -> Home Assistant

Kompleksowe narzędzie diagnostyczne napisane w języku Python, służące do:
1. Przeskanowania magistrali Modbus RS485 w pompie ciepła Midea (oraz bliźniaczych: Kaisai, Clivet, Pro Heat, Carrier) podłączonej przez konwerter sieciowy Waveshare.
2. Zrzucenia wszystkich aktywnych rejestrów do czytelnego pliku tekstowego midea_registers.txt.
3. Automatycznego wygenerowania gotowego bloku konfiguracji encji (configuration.yaml) dla Home Assistant.

---

## SPIS TREŚCI
1. Architektura połączenia
2. Konfiguracja konwertera Waveshare
3. Wymagania i instalacja na komputerze
4. Obsługa zmiennego IP i Portu (Kluczowe)
5. Instrukcja uruchomienia skanera (Krok po kroku)
6. Dostępne parametry wiersza poleceń
7. Struktura plików wynikowych
8. Wdrożenie w Home Assistant
9. Rozwiązywanie problemów (Troubleshooting)

---

## 1. Architektura połączenia

[Pompa Ciepła Midea]
   │
   │ Magistrala 2-żyłowa RS485 (Zaciski A+ / B-)
   ▼
[Konwerter Waveshare RS485 <-> Ethernet / Wi-Fi]
   │
   │ Sieć lokalna LAN / Wi-Fi (Protokół: Modbus RTU over TCP)
   ▼
[Twój Komputer (Mac / Linux / Windows) / Home Assistant]

- Typ protokołu: rtuovertcp (Modbus RTU zapakowany w ramki TCP).
- Zadanie skryptu: Odpytanie rejestrów pamięci płyty głównej pompy, zdekodowanie wartości (temperatury, prądy, statusy) i przygotowanie sensorów dla HA.

---

## 2. Konfiguracja konwertera Waveshare

Aby komunikacja rtuovertcp działała poprawnie, konwerter Waveshare musi być skonfigurowany w trybie przezroczystym:
1. Zaloguj się do panelu WWW konwertera Waveshare (wpisując jego adres IP w przeglądarce).
2. Sprawdź ustawienia portu szeregowego (Serial Port):
   - Baud Rate: standardowo 9600 (rzadziej 19200).
   - Data Bits: 8.
   - Parity: None.
   - Stop Bits: 1.
3. Sprawdź tryb pracy sieciowej (Network Settings):
   - Protocol / Mode: TCP Server.
   - Port: domyślnie 4196 (lub dowolny inny, np. 502).
   - Modbus Gateway / Modbus TCP to RTU: WYŁĄCZONE (OFF / Transparent). 
     (Home Assistant oraz skrypt sami tworzą sumy kontrolne CRC i ramki RTU, więc konwerter nie może ich modyfikować).

---

## 3. Wymagania i instalacja na komputerze

Skrypt należy uruchomić na komputerze podłączonym do tej samej sieci lokalnej co Waveshare.

### Krok 3.1: Przygotowanie środowiska (macOS / Linux)
Otwórz Terminal i wpisz:

cd ~/Downloads
python3 -m venv venv
source venv/bin/activate
pip install "pymodbus>=3.5"

(Gdy środowisko jest aktywne, na początku wiersza w terminalu pojawi się (venv)).

### Krok 3.2: Przygotowanie środowiska (Windows)
W wierszu poleceń PowerShell lub CMD:

cd %USERPROFILE%\Downloads
python -m venv venv
venv\Scripts\activate
pip install "pymodbus>=3.5"

---

## 4. Obsługa zmiennego IP i Portu (Kluczowe)

Adres IP konwertera Waveshare może ulegać zmianie, np.:
- Router przydzielił inny adres przez DHCP (np. 192.168.1.150 zamiast 192.168.0.36),
- Przeniosłeś urządzenie do innej podsieci,
- Zmieniłeś port nasłuchu w Waveshare z 4196 na standardowy port Modbus 502.

Nie musisz pisać nowego skryptu! Możesz obsłużyć zmianę adresu na dwa sposoby:

### Sposób A: Podanie adresu w poleceniu (Zalecane – najwygodniejsze)
Przy każdym uruchomieniu możesz przekazać aktualny adres za pomocą flag --host oraz --port:

# Jeśli IP to 192.168.1.50, a port pozostał 4196:
python3 midea_scan.py --host 192.168.1.50

# Jeśli zmienił się zarówno adres IP, jak i port (np. na 502):
python3 midea_scan.py --host 192.168.1.50 --port 502

# Połączenie z innym adresem + szybki skan (rejestry 0-300):
python3 midea_scan.py --host 192.168.1.50 --end 300

Uwaga: Wartości --host i --port podane w terminalu zostaną automatycznie wpisane do wygenerowanego pliku configuration.yaml.

---

### Sposób B: Zmiana domyślnego IP na stałe w kodzie skryptu
Jeśli chcesz, aby skrypt zawsze łączył się z Twoim nowym adresem bez wpisywania flag w terminalu:
1. Otwórz plik midea_scan.py w edytorze tekstu.
2. Przejdź do funkcji main() na samym końcu pliku (okolice linii 270).
3. Zmień wartości w cudzysłowach:
   ap.add_argument("--host", default="192.168.1.50")  # <-- Tutaj wpisz swój nowy adres IP
   ap.add_argument("--port", type=int, default=4196)   # <-- Tutaj wpisz swój port
4. Zapisz plik. Teraz samo polecenie python3 midea_scan.py użyje nowego adresu.

---

## 5. Instrukcja uruchomienia skanera (Krok po kroku)

### Wariant 1: Szybki skan testowy (Zalecany na pierwszy raz)
Większość kluczowych danych pompy Midea (temperatury, prądy, stan pracy) znajduje się w rejestrach od 0 do 200. Skanowanie rejestrów 0–300 trwa zazwyczaj 1–2 minuty:

python3 midea_scan.py --end 300

(lub z własnym IP: python3 midea_scan.py --host TWOJE_IP --end 300)

### Wariant 2: Pełne skanowanie
Przeszukuje pełen zakres holding registers (0–1000). Może potrwać 5–10 minut:

python3 midea_scan.py

### Wariant 3: Tylko ponowne wygenerowanie YAML
Jeśli skanowanie zostało już wykonane i masz plik midea_registers.txt, a chcesz jedynie zmienić adres w configuration.yaml bez ponownego łączenia z pompą:

python3 midea_scan.py yaml --host 192.168.1.100 --port 4196

---

## 6. Dostępne parametry wiersza poleceń

| Parametr | Domyślnie | Opis |
|---|---|---|
| mode | all | Tryb działania: all (skan + generowanie YAML), scan (tylko skan), yaml (tylko YAML z TXT). |
| --host | 192.168.0.36 | Adres IP konwertera Waveshare. |
| --port | 4196 | Port TCP konwertera Waveshare. |
| --slave | 1 | Adres Modbus Slave ID pompy ciepła (zwykle 1, rzadziej 2). |
| --start | 0 | Numer początkowego rejestru do przeskanowania. |
| --end | 1000 | Numer końcowego rejestru do przeskanowania. |
| --delay | 1 | Opóźnienie w sekundach między zapytaniami (zabezpiecza płytę przed zawieszeniem). |
| --timeout | 5 | Czas oczekiwania na odpowiedź konwertera (w sekundach). |
| --input-registers | wyłączone | Dodatkowo skanuje rejestry wejściowe (FC04), a nie tylko rejestry trzymane (FC03). |
| --include-zero | wyłączone | Dołącza do YAML także nieznane rejestry o wartości 0. |

---

## 7. Struktura plików wynikowych

Po zakończeniu działania w folderze pojawią się dwa pliki:

### 1. midea_registers.txt
Zawiera pełną ewidencję odczytanych rejestrów:
Adres   Typ     Raw     Signed  Skalowane  Opis
--------------------------------------------------------------------------------
0       holding 1       1       1.00       Midea Power On/Off (bity)
2       holding 35      35      35.00      Midea Zadana temp wody strefa [°C]
104     holding 32      32      32.00      Midea Temp wody wlot Tw_in [°C]
105     holding 38      38      38.00      Midea Temp wody wylot Tw_out [°C]
107     holding 7       7       7.00       Midea Temp zewnętrzna T4 [°C]
...

### 2. configuration.yaml
Zawiera gotowy blok kodu w standardzie oficjalnej integracji Modbus Home Assistant:
modbus:
  - name: midea
    type: rtuovertcp
    host: 192.168.0.36
    port: 4196
    delay: 1
    timeout: 5
    sensors:
      - name: "Midea Temp wody wlot Tw_in"
        unique_id: midea_holding_104
        slave: 1
        address: 104
        input_type: holding
        data_type: int16
        scan_interval: 30
        unit_of_measurement: "°C"
        device_class: temperature
        state_class: measurement
...

---

## 8. Wdrożenie w Home Assistant

1. Otwórz plik configuration.yaml wygenerowany przez skrypt.
2. Skopiuj cały blok (począwszy od linii modbus:).
3. Otwórz panel Home Assistant, wejdź w edytor plików (np. Studio Code Server lub File Editor) i wklej zawartość do pliku configuration.yaml w Home Assistant.
   Uwaga: Jeśli masz już sekcję modbus: w HA, wklej zawartość listy urządzeń pod istniejący wpis modbus:.
4. Przejdź do: Narzędzia deweloperskie -> YAML -> Sprawdź konfigurację.
5. Jeśli pojawi się komunikat „Konfiguracja jest prawidłowa”, kliknij Uruchom ponownie.
6. Po restarcie encje pojawią się w menu: Ustawienia -> Urządzenia oraz usługi -> Encje pod przedrostkiem sensor.midea_...

---

## 9. Rozwiązywanie problemów (Troubleshooting)

### Problem 1: Connection refused lub błąd Timeout
- Sprawdź, czy komputer ma połączenie z konwerterem, wpisując w terminalu:
  ping 192.168.0.36
- Upewnij się, że port w Waveshare (4196) jest otwarty i w trybie TCP Server.
- Sprawdź, czy zapora sieciowa (firewall) na routerze lub komputerze nie blokuje ruchu.

### Problem 2: Wszystkie rejestry zwracają błąd odczytu
- Prawdopodobnie przewody magistrali RS485 są zamienione miejscami. Spróbuj zamienić żyły A+ i B-.
- Sprawdź adres Slave ID. Jeśli pompa nie odpowiada na --slave 1, spróbuj --slave 2 lub --slave 16.
- Upewnij się, że funkcja Modbus TCP to RTU w Waveshare jest wyłączona.

### Problem 3: Błąd externally-managed-environment przy instalacji pymodbus
- Oznacza to, że Twój system macOS blokuje globalną instalację pakietów. Zastosuj wirtualne środowisko opisane w punkcie 3.1:
  python3 -m venv venv && source venv/bin/activate && pip install "pymodbus>=3.5"
