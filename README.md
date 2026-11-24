# Gymlog

Web-app voor de sportschool. Hij draait op je iPhone vanaf het beginscherm en werkt ook offline.

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

Alle gegevens staan **alleen op je iPhone** (in de app op je beginscherm). Maak af en toe een back-up via Profiel → Back-up maken.

## Online zetten met GitHub Pages (eenmalig, ±5 minuten)

1. Ga naar <https://github.com/new>.
   - Repository name: `gymlog`
   - Kies **Public** (gratis GitHub Pages vereist een openbare repository; alleen de code is zichtbaar, je trainingsgegevens niet)
   - Klik **Create repository**
2. Klik op de link **uploading an existing file**.
3. Sleep **de inhoud** van deze map in het uploadvak: `index.html`, `manifest.webmanifest`, `sw.js`, `README.md` en de mappen `css`, `js` en `icons`. Klik daarna op **Commit changes**.
4. Ga naar **Settings → Pages**. Kies bij *Build and deployment* voor **Deploy from a branch**, branch **main** en map **/ (root)**, en klik op **Save**.
5. Na ongeveer een minuut staat de app op `https://<jouw-gebruikersnaam>.github.io/gymlog/`.

## Op je iPhone zetten

1. Open die link in **Safari**.
2. Tik op de deelknop (vierkant met pijl omhoog) en kies **Zet op beginscherm**.
3. Open Gymlog voortaan altijd via het icoon. Je gegevens staan in die app, niet in de Safari-tab.
4. Importeer je schema: Training → Importeren → Kies bestand (je Excel staat in OneDrive of Bestanden).

Werkt op iOS 16.4 of nieuwer.

## Updates

Upload de gewijzigde bestanden opnieuw via GitHub (**Add file → Upload files**). Verhoog daarbij in `sw.js` het nummer in `VERSION` (bijv. `gymlog-v1.0.1`), zodat je iPhone de nieuwe versie ophaalt. Sluit de app daarna een keer helemaal af en open hem opnieuw.
