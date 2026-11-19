# Radar Słupów
PWA: działki z siecią przesyłową (dane publiczne: OpenStreetMap, ULDK/GUGiK, Geoportal WMS).

Aplikacja PWA do planowania pracy w terenie: pokazuje działki z liniami energetycznymi i domami pod nimi lub obok, układa trasę i prowadzi do drzwi. Korzysta wyłącznie z danych publicznych (OSM, ULDK, BDOT10k, PRG). Przechowuje tylko opisy działek (numer, status, krótka notatka); imion, telefonów i adresów osób nie zapisuje.

## Nowości v94–v129

- Trasa: „Dopisz 4”, cofnięcie ostatniej zmiany, pasek „następny punkt”, filtr „tylko domy przy linii”, przypięta trasa na jeden dzień.
- Status „karteczka” i „inna firma”, lista „Wróć po 17” (sortowanie i kopiowanie numerów działek).
- CRM: podsumowanie dnia do skopiowania, cel dzienny z paskiem postępu, kopia zapasowa i wczytanie, eksport CSV, wykres odwiedzin z ostatnich 14 dni z numerem dnia i liczbą.
- Ostrzeżenie, gdy notatka wygląda na dane osobowe.
- Tryb „Słońce” (wysoki kontrast w pełnym słońcu) oraz poprawiony kontrast w trybie ciemnym.
- Praca bez zasięgu: znacznik offline, podręczna pamięć danych i obejrzanych kafelków mapy.
- Czytelność na małych telefonach (360 px) i przyciski z nazwami dla czytników ekranu.
- „Teren na dziś” pokazuje liczbę działek do powrotu po 17 i lekko podnosi takie obszary.
- Link „Jedź w Mapach” (limit 10 punktów) bierze tylko nieodwiedzone przystanki.
- CRM: kafelek „karteczek dziś” oraz informacja, ile dni temu nikogo nie było.
- Karta działki: krótsza etykieta „nie wiem” w polu „Typ gruntu” i czytelna etykieta „brak statusu”.
