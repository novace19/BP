# Provedené ověření praktické části

Protokol vychází z lokálního ověření dne **26. 10. 2026**. Prostředí: Linux, Node.js **24.22.1**, vestavěná SQLite **3.53.4**. Toto není ověření reálného provozu fitness centra ani potvrzení testování na Windows.

## Automatizované testy

Spuštění:

```sh
npm run check
npm test
```

`check` ověřuje syntaxi vstupního serverového modulu, aplikační služby a klientského skriptu. Testovací sada obsahuje **19 testů**; všechny při lokálním ověření prošly. Souhrn není procentem splnění celého zadání a nepředstavuje bezpečnostní certifikaci.

| Test / oblast | Ověření |
| --- | --- |
| Záloha a obnova | Vytvoření konzistentní zálohy, opětovné otevření, verze migrace a kontrola vazeb |
| Klientské šablony | Vygenerování hlavních obrazovek a administrátorských formulářů, kódování nedůvěryhodného jména a popisu |
| HTTP integrace | Registrace, normalizovaný duplicitní e-mail, přihlášení, cookie, ochrana proti podvržené roli, CSRF, cizí origin, změna hesla, odhlášení, soukromí rezervací a administrátorské API |
| Poslední místo | Vytvoření jediné aktivní rezervace, opakované odeslání vrací stejné ID, další klient je odmítnut |
| Vlastnictví | Odmítnutí cizího storna a rezervace za cizí účet běžným klientem |
| Hraniční storno | Přesná dvouhodinová hranice, opakované storno a nová rezervace po stornu |
| Pozdní storno | Odmítnutí klienta a povolený zásah správce s auditním záznamem |
| Stav termínu | Odmítnutí konceptu, zrušeného a minulého termínu |
| Snížení kapacity | Odmítnutí hodnoty pod obsazenost a zachování původní hodnoty |
| Kolize rozvrhu | Odmítnutí překryvu; přilehlý termín je přípustný |
| Osobní trénink | Právě jedno místo, zákaz překročení kapacity sálu |
| Zrušení termínu | Storno jeho aktivních rezervací, zákaz obnovy zrušeného termínu |
| Deaktivace účtu | Rezervace zůstává, další operace se odmítají |
| Odebraná role | Dříve načtený objekt správce nemůže po změně role zrušit cizí rezervaci |
| Správa účtů a vstupů | Ochrana posledního správce a odmítnutí neplatné kapacity |
| Docházka | Rezervace sama nevytváří návštěvu, předčasné potvrzení je odmítnuté, opakované potvrzení nevytvoří duplicitu |
| Databázové ochrany | Trigger odmítne přeplňující přímý zápis a kapacitu pod obsazeností |
| Persistence | Rezervace přetrvá zavření a opětovné otevření databáze |
| Skutečný souběh | Dva workery se samostatnými připojeními současně rezervují poslední místo; zůstane právě jeden aktivní záznam |

HTTP integrační test mimo jiné vytvoří správce a dva klienty v izolované paměťové databázi. Ověří také založení trenéra, sálu, osobní lekce a termínu přes administrátorské endpointy, rezervaci za klienta, zrušení termínu, samostatný vstup do posilovny a zneplatnění relace po deaktivaci účtu.

Souběžný test nepoužívá dva postupné požadavky. Workery čekají na sdílenou bariéru a po uvolnění pracují se stejným SQLite souborem přes dvě vlastní připojení. Při prvním průchodu test odhalil nevhodné pořadí nastavení čekání na zámek během otevírání databáze. `busy_timeout` se nyní nastavuje před přepnutím režimu WAL. Následný průchod prošel.

## Spuštění skutečného serveru

Vedle testů bylo ověřeno vytvoření demo dat a spuštění `src/server.js` jako samostatného procesu. Požadavky na `/`, `/app.js`, `/styles.css` a `/api/me` vrátily 200. Server byl následně řádně ukončen signálem SIGTERM. Demo hesla byla náhodně vygenerovaná a nejsou součástí tohoto protokolu.

## Co zatím není ověřeno

V prostředí nebyl dostupný vykonatelný Chromium a jeho stažení se nezdařilo. **Nebyl proto proveden skutečný prohlížečový průchod ani vizuální kontrola mobilního a desktopového rozložení.** Test klientských šablon běží v izolovaném JavaScriptovém kontextu a není náhradou testu v prohlížeči. Protokol neobsahuje vymyšlené snímky aplikace.

Před použitím pro obhajobu je potřeba v běžném prohlížeči ověřit:

1. Registraci, přihlášení, rezervaci, její storno a změnu hesla.
2. Všechny administrátorské formuláře a potvrzení účasti.
3. Šířky 360, 768 a 1280 bodů, zvětšení textu a obsluhu klávesnicí.
4. Chování kolem přechodu letního času a nastavení časového pásma zařízení.
5. Skutečné snímky rozhraní se syntetickými daty pro text práce.

Dále nebylo provedeno měření 95. percentilu odezvy při definované zátěži, nezávislé penetrační testování, kontrola shody s WCAG, test veřejného HTTPS nasazení ani ověření na Windows 11. Návrhové cíle z původního Wordu tak nelze označit za všechny splněné jen podle této sady.
