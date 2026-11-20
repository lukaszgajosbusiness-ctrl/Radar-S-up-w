# Radar Słupów
PWA: działki z siecią przesyłową (dane publiczne: OpenStreetMap, ULDK/GUGiK, Geoportal WMS).

Aplikacja PWA do planowania pracy w terenie: pokazuje działki z liniami energetycznymi i domami pod nimi lub obok, układa trasę i prowadzi do drzwi. Korzysta wyłącznie z danych publicznych (OSM, ULDK, BDOT10k, PRG). Przechowuje tylko opisy działek (numer, status, krótka notatka); imion, telefonów i adresów osób nie zapisuje.

## Nowości v94–v144
- „Wróć w sobotę” obok „Wróć po 17”: w trasie takie działki pojawiają się tylko w sobotę, w CRM mają własną listę.
- Przycisk „Podziel wg planu” szacuje, ile metrów pasa leży na jakim przeznaczeniu (MPZP).
- Przycisk „Podpowiedz stawkę” wpisuje zł/m² ze źródłem i nigdy nie nadpisuje wartości bez pytania.
- Notatka zapisuje się sama; na dole karty jest „← Wróć do mapy”; tytuł działki na trasie otwiera kartę.
- CRM: przycisk „Raport” pobiera CSV z polami kalkulatora (bez danych osobowych).
- Karta działki: „Czy warto pukać” podaje rząd wielkości wartości gruntu w pasie (to nie wycena).
- „Działka tu”: przycisk „Kopiuj lead” (obręb, numer, gmina) do wklejenia w CRM.
- „Działka tu”: przycisk „Nawiguj tu” otwiera trasę dojazdu do tego punktu w Mapach.
- Karta „Działka tu” (▦): przycisk „Sprawdź plan tutaj” pokazuje plan, typ gruntu i podpowiedź stawki. Gdy planu brak, komunikat podpowiada sprawdzenie WZ w BIP gminy lub Geoportalu (usługa planów może nie mieć danych dla gminy).

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
- Przyciski w karcie działki i na pasku trasy mają co najmniej 40 px wysokości (łatwiej trafić palcem).
