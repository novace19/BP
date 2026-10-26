# Rezervační systém fitness centra

Funkční bakalářský prototyp s českým rozhraním **Forma**. Klient si založí účet, rezervuje skupinovou lekci nebo osobní trénink, spravuje vlastní rezervace a sleduje skutečně zaznamenané návštěvy. Správce udržuje rozvrh, katalog lekcí, trenéry, sály, účty, rezervace a docházku.

**Autor práce: Vojtěch Nováček.** Projekt není veřejně nasazený. Samotné nahrání na GitHub nespouští server; GitHub Pages neumí tuto serverovou aplikaci hostovat.

## Rychlé spuštění na Windows

1. Nainstalujte **Node.js řady 24 LTS, verze 24.11 nebo vyšší v řadě 24** z [nodejs.org](https://nodejs.org/). Instalátor obsahuje i npm.
2. Stáhněte repozitář tlačítkem **Code → Download ZIP**, rozbalte jej a otevřete terminál přímo ve složce se souborem `package.json`.
3. Ověřte `node --version`. Pokud PowerShell blokuje příkaz `npm`, používejte `npm.cmd` nebo Příkazový řádek.
4. Pro první lokální ukázku spusťte:

   ```sh
   npm run seed
   npm start
   ```

5. Otevřete **http://localhost:3000**. Terminál nechte otevřený. Server zastavíte **Ctrl+C**.

Projekt nemá externí npm závislosti, takže pro spuštění **není potřeba `npm install`**, XAMPP ani samostatný databázový server. SQLite soubor a schéma se vytvoří automaticky. Node může vypisovat informaci o vývojovém stavu vestavěného SQLite modulu; použití ověřuje testovací sada projektu.

### Přihlašovací účty

`npm run seed` vytvoří **náhodná hesla** a vypíše je v terminálu. Poznamenejte si je:

| Role | E-mail | Heslo |
| --- | --- | --- |
| Správce | `admin@fitness.test` | Vypíše příkaz `npm run seed` |
| Ukázkový klient | `klient@fitness.test` | Vypíše příkaz `npm run seed` |

Hesla nejsou zveřejněná v repozitáři. Data jsou syntetická. Seed se spustí jen nad databází bez účtů a existující databázi nepřepisuje. Obsahuje relativní rozvrh na 14 dní a dvě ukázkové návštěvy klienta. Nového klienta lze zaregistrovat přímo v aplikaci. Při opětovném seedu se hesla existujících účtů nemění ani znovu nevypisují.

## Co aplikace obsahuje

### Klient

- Registraci a přihlášení, odhlášení, změnu jména a hesla.
- Přehled nadcházejících rezervací a návštěv.
- Týdenní rozvrh, filtr dne, trenéra a typu lekce.
- Detail lekce, rezervaci místa, zákaz duplicit a serverovou kontrolu kapacity.
- Storno nejpozději dvě hodiny před začátkem, včetně přesné rovnosti s hranicí.
- Historii rezervací a deník návštěv s grafem za šest měsíců.
- Profily trenérů a responzivní zobrazení pro telefon i počítač.

### Správce

- Vytvoření a úpravu typů lekcí, jejich deaktivaci, rozlišení skupinové lekce a osobního tréninku.
- Vytvoření a úpravu trenérů a jejich deaktivaci.
- Správu sálů a jejich kapacity.
- Vytvoření, publikaci, úpravu a zrušení konkrétních termínů.
- Kontrolu překryvu času trenéra a sálu; přilehlé intervaly jsou přípustné.
- Správu jména, role a aktivity účtů; ochranu posledního aktivního správce.
- Rezervace za klienta a rušení rezervací, evidenci účasti na lekci a samostatného vstupu do posilovny.
- Přehled významných administrátorských změn.

**Návštěva není totéž co rezervace.** Klientovi vznikne záznam návštěvy až po potvrzení účasti správcem. U lekce je možné účast potvrdit nejdříve 30 minut před začátkem. Již potvrzenou účast nelze podruhé přidat ani její rezervaci následně stornovat.

## Technologie a struktura

| Vrstva | Implementace |
| --- | --- |
| Klient | HTML, CSS, JavaScript bez frameworku |
| Server | Node.js 24, vestavěný HTTP server, JSON API |
| Databáze | SQLite přes `node:sqlite`, relační vazby, indexy a triggery |
| Účty | scrypt, náhodné soli, serverové relace, HttpOnly cookie a CSRF token |
| Ověření | `node:test`, HTTP integrační test a souběžný test ve dvou workerech |

```text
public/           České rozhraní, styly a klientský JavaScript
src/server.js     HTTP server, API, relace a bezpečnostní hlavičky
src/service.js    Sdílená pravidla rezervací, administrace a návštěv
src/db.js         Připojení, migrace a transakce
src/security.js   Hashování hesel, validace a chybové typy
migrations/       Verze databázového schématu
scripts/          Demo data, založení správce a záloha
test/             Automatické testy a syntetické fixtures
docs/             Technický popis, API a ověření
data/             Lokální databáze (nevkládá se do Gitu)
```

## Ověření

```sh
npm run check
npm test
```

Testy používají paměťovou nebo dočasnou databázi. **Nemažou vaši lokální databázi.** Podrobnosti jsou v [docs/TESTOVANI.md](docs/TESTOVANI.md).

## Vlastní databáze a správce bez demo dat

Pro novou instalaci vynechte seed. Spuštění serveru vytvoří prázdnou databázi; prvního správce založte jednorázově přes prostředí. Příklad v PowerShellu:

```powershell
$env:ADMIN_EMAIL = "vas-email@example.cz"
$env:ADMIN_NAME = "Správce centra"
$env:ADMIN_PASSWORD = Read-Host "Zadejte nové heslo (min. 12 znaků)" -MaskInput
npm.cmd run admin
Remove-Item Env:ADMIN_PASSWORD
npm.cmd start
```

`-MaskInput` vyžaduje PowerShell 7. Ve Windows PowerShellu 5.1 použijte místo řádku se zadáním hesla tyto dva řádky:

```powershell
$secret = Read-Host "Zadejte nové heslo" -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new("", $secret).Password
```

Pokud je e-mail již použit, příkaz účet nemění. Existující oprávnění řeší správce v aplikaci. Přihlašovací e-mail se v první verzi v rozhraní nemění a obnova zapomenutého hesla e-mailem není implementována.

## Konfigurace a záloha

Volitelně zkopírujte `.env.example` na `.env` a upravte hodnoty. `.env` se neposílá do Gitu. Výchozí server naslouchá pouze lokálně na `127.0.0.1:3000`.

```sh
npm run backup
```

Příkaz vytvoří konzistentní kopii databáze v `backups/`. Pro obnovu zastavte server a zkopírujte zvolenou zálohu na `DB_PATH` (výchozí `data/fitness.sqlite`). Původní databázi a případné soubory `-wal` a `-shm` nejprve přesuňte do jiné složky jako celek. Ověřte obnovená data před dalším provozem. Zálohy obsahují osobní údaje a hashovaná hesla; nezveřejňujte je.

## Rozsah prototypu a návaznost na text práce

Původní pracovní text navrhoval Symfony a PostgreSQL. **Aktuální implementace podle cíle práce používá JavaScript na klientu i serveru a SQLite.** V textu práce je proto třeba před odevzdáním upravit výběr technologií, datové typy, způsob synchronizace, obrázky a výsledky. U SQLite se používá transakce `BEGIN IMMEDIATE`, nikoli PostgreSQL `SELECT FOR UPDATE`.

Nejsou implementovány platby, členství, automatické e-maily, čekací listiny, turnikety ani více poboček. „Osobní trénink“ je termín s kapacitou jednoho místa. Uživatel může mít překrývající se rezervace různých termínů; kolize sálu a trenéra jsou zakázané. Systém má konečné limity načítaných přehledů a není navržen pro velký provoz.

Před veřejným nasazením nastavte HTTPS, `SECURE_COOKIE=1` a přesný `APP_ORIGIN`, persistentní disk, zálohy a provozní podmínky. `HOST=0.0.0.0` nastavujte pouze pro odpovídajícím způsobem zabezpečené hostování. SQLite má jednoho současného zapisovatele; jde o řešení pro menší centrum a demonstrační provoz, nikoli o distribuovaný systém.
