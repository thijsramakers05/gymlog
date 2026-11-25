# Gymbie

Web-app voor de sportschool: **https://gymbie.github.io/**. Hij draait op je iPhone vanaf het beginscherm en werkt ook offline.

- Workouts maken met oefeningen en sets (normaal, warming-up, top set, back-off, dropset, tot falen)
- Een workout starten en loggen, met de vorige keer direct ingevuld
- "Vorige keer" per gym, met één tik te wisselen naar alle gyms
- Apparaatstanden per oefening per gym (bijv. Stoel 12 · Rugsteun 6), plus het gewicht van het extra "+" op het apparaat
- Spierkaart per oefening: een doorzichtig silhouet (voor- en achterkant) waarop de getrainde spieren oranje oplichten en de meewerkende spieren lichter
- Eigen foto van het apparaat per oefening per gym (camera of fotobibliotheek), te zien als rond plaatje in de workout
- Oefeningen wisselen, toevoegen en verplaatsen tijdens een workout. Na afloop vraagt de app of het schema bijgewerkt moet worden.
- Schema's importeren uit Excel (.xlsx) of uit geplakte tekst/cellen
- Historie, grafiek (geschatte 1RM, zwaarste gewicht, volume), records, kalender met streak, sets per spiergroep en lichaamsgewicht
- Rusttimer (handmatig starten), supersets, NL/EN, licht/donker volgt de iPhone
- Back-up maken en terugzetten (JSON-bestand)
- Optioneel account (e-mail + wachtwoord): synchroniseert workouts, historie, standen en foto's tussen je apparaten via Supabase (EU)

Zonder account staan alle gegevens **alleen op je iPhone** (in de app op je beginscherm); maak dan af en toe een back-up via Profiel → Back-up maken. Met een account (Profiel → Account) wordt alles daarnaast op de achtergrond gesynchroniseerd. In de gym werkt de app ook zonder bereik.

## Op je iPhone zetten

1. Open https://gymbie.github.io/ in **Safari**.
2. Tik op de deelknop (vierkant met pijl omhoog) en kies **Zet op beginscherm**.
3. Open Gymbie voortaan altijd via het icoon. Je gegevens staan in die app, niet in de Safari-tab.
4. Heb je een account? Log in via Profiel → Account, dan komen al je gegevens terug. Anders: importeer je schema via Training → Importeren.

Werkt op iOS 16.4 of nieuwer.

## Accounts (Supabase)

- De database-opzet staat in [`supabase/setup.sql`](supabase/setup.sql): één tabel `records` met beveiliging per gebruiker (RLS), een privé-bucket `photos` en een functie om je eigen account te verwijderen.
- In de app staat alleen de publieke *publishable key*; die is bedoeld om openbaar te zijn. De geheime sleutel staat nergens in de code.
- In Supabase staat onder **Authentication → URL Configuration** de Site URL op `https://gymbie.github.io/`, zodat links in bevestigings- en wachtwoordmails naar de app gaan.

## Updates

Bij elke update het nummer in `VERSION` in `sw.js` (en in `js/views/profile.js`) ophogen, zodat iPhones de nieuwe versie ophalen. Na een update draait de eerste keer openen nog de oude versie; sluit de app daarna helemaal af en open hem opnieuw.

De oude link `https://thijsramakers05.github.io/gymlog/` blijft werken en toont een melding met de nieuwe link.
