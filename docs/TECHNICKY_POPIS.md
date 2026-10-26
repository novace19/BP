# Technický popis praktické části

Tento dokument popisuje skutečnou implementaci v tomto repozitáři. Nenahrazuje finální text bakalářské práce v předepsané Word šabloně.

## Průchod požadavku

Server v `src/server.js` nejprve nastaví bezpečnostní hlavičky a rozliší statické prostředky a API. Statické soubory poskytuje z pevného seznamu, takže nelze adresou stáhnout databázi, zdrojové soubory ani konfiguraci.

U API načte serverovou relaci z databáze. Cookie obsahuje náhodný token; databáze uchovává pouze jeho SHA-256 otisk. Relace existuje i před přihlášením, aby bylo možné chránit registrační a přihlašovací požadavky tokenem CSRF. Po přihlášení, registraci a odhlášení se relace rotuje. Platnost relace je 24 hodin bez klouzavého prodlužování. Změna hesla ruší všechny relace účtu a vydá novou aktuálnímu zařízení.

Zápisové API požadavky musí obsahovat JSON a správnou hlavičku `X-CSRF-Token`. Přítomný `Origin` se kontroluje proti nastavenému originu nebo lokální adrese. Každé API volání má limit četnosti; přihlášení, registrace a změna hesla mají přísnější limity. Limity jsou v paměti jednoho procesu a nejsou sdílené mezi více instancemi.

Aktivita a role účtu se načítají ze serveru. Registrace přijímá pouze jméno, e-mail a heslo, takže podvržené pole `role` nepřidělí oprávnění. Přihlašovací e-mail se ořízne a převede na malá písmena. Chybné přihlášení má obecnou odpověď a také neexistující účet prochází hashovacím výpočtem. Hesla používají scrypt se solí 16 náhodných bajtů a nastavením N=32768, r=8, p=3. Výpočet probíhá asynchronně; ukládá se identifikátor algoritmu, sůl a výsledný klíč.

## Relační model

| Tabulka | Obsah a vazby |
| --- | --- |
| `users` | Účet, jedinečný e-mail, hash, role a aktivita |
| `auth_sessions` | Otisk tokenu, vazba na účet, CSRF a expirace |
| `lessons` | Typ lekce, popis, skupinová/osobní, výchozí délka a aktivita |
| `trainers` | Jméno, veřejný profil, specializace a aktivita |
| `rooms` | Název a maximální kapacita sálu |
| `class_sessions` | Konkrétní termín, vazby na lekci, trenéra a sál, časy, kapacita, stav |
| `reservations` | Klient a termín, stav, vznik a údaje o zrušení |
| `visits` | Skutečně zaznamenaná účast nebo samostatný vstup do posilovny |
| `audit` | Správce, operace, dotčený objekt, podrobnosti a čas |

Časy jsou celá čísla vyjadřující milisekundy od Unix epochy. Rozhraní je zobrazuje v časovém pásmu zařízení a uvádí jeho název v patičce. Administrátorské pole `datetime-local` používá stejné pásmo. Pro český provoz mají zařízení používat Europe/Prague. Nejde o centrální správu více časových pásem; přechody letního času nejsou samostatně automatizovaně ověřeny.

Migrace `001-initial.sql` se provede pouze při verzi databáze nižší než 1. `PRAGMA user_version` označuje aplikovanou verzi. Zapnuté cizí klíče chrání vazby. Částečný jedinečný index povoluje jednu aktivní rezervaci dvojice klient–termín; staré zrušené záznamy zůstávají zachované. Trigger odmítá nový zápis do plného nebo nepublikovaného termínu. Druhý trigger chrání snížení kapacity pod obsazenost. Další pravidla jsou v aplikační službě, nikoli všechna v databázových triggerech.

## Rezervace a souběh

`FitnessService.book` začíná transakcí `BEGIN IMMEDIATE`, tedy získáním práva zapisovat před čtením dostupnosti. V transakci se znovu ověří aktuální účet, případné oprávnění rezervovat za jiného klienta, stav a čas termínu. Existující aktivní rezervace se vrátí jako výsledek opakovaného požadavku. Jinak se zjistí počet aktivních záznamů, porovná s kapacitou a vloží nový záznam.

SQLite dovoluje jedinou současnou zapisující transakci. Druhý zapisovatel proto vyčká, případně po pěti sekundách skončí chybou zaneprázdněné databáze. Po získání zápisu zkontroluje stav znovu. Úspěšná odpověď následuje až po `COMMIT`; výjimka vede k `ROLLBACK`. Uvnitř této transakce není asynchronní čekání. Stejný transakční vzor používá administrátorská změna termínu, storno a docházka.

Toto řešení se liší od původně navržených řádkových zámků PostgreSQL. Je jednodušší pro lokální spuštění a menší provoz, ale omezuje paralelní zápis. Automatizovaný test skutečně otevírá dvě samostatná SQLite připojení ve dvou workerech a synchronizuje jejich pokus o poslední místo bariérou.

## Provozní pravidla

- Klient může na jednom termínu vlastnit jednu aktivní rezervaci. Opakovaný požadavek vrací stejný záznam.
- Po stornu zůstává původní záznam. Nová rezervace vytvoří nový.
- Klientské storno je povolené, pokud čas nepřekročil začátek minus dvě hodiny. Správce smí tuto lhůtu překročit.
- Potvrzenou návštěvu nelze stornovat. Opravy chybně zadané docházky zatím nejsou součástí rozhraní.
- Osobní trénink má kapacitu jedna. Kapacita termínu nesmí překročit sál.
- Koncept i publikovaný termín blokují čas sálu a trenéra. Zrušený termín jej neblokuje.
- Dva intervaly se překrývají při `old.start_at < new.end_at && old.end_at > new.start_at`. Dotyk konce a začátku je povolený.
- Publikovaný termín se nevrací do konceptu. Zrušený termín se neobnovuje.
- Zrušení budoucího termínu zruší jeho aktivní rezervace v jedné transakci.
- Deaktivace účtu ukončí jeho relace, rezervace ale ponechá k samostatnému vyřešení.
- Katalogové položky s historií se deaktivují, nikoli fyzicky mažou.
- Změna času nevydává automatické oznámení. Rozhraní správce na povinnost informovat klienty upozorňuje.

## Rozhraní

Klientský JavaScript načítá JSON a sestavuje obrazovky přehledu, rozvrhu, rezervací, aktivit, trenérů a profilu. Správce získává samostatné záložky evidencí. Hodnoty vložené do HTML se kódují funkcí `escape`; nepoužívá se uživatelské HTML. Výběrové hodnoty se validují také serverem. Identifikátor účtu odeslaný klientem nenahrazuje serverové rozhodnutí o oprávnění.

Stránka používá externí soubor skriptu a stylů, vlastní SVG ikony, sémantické formuláře a nativní dialog. CSP zakazuje skripty z jiných zdrojů, inline JavaScript, objekty a vkládání do rámců. Rozvrh se na úzké obrazovce skládá do jednoho sloupce, administrátorské tabulky mají vlastní posuvný kontejner.

## Omezení a další rozvoj

Synchronní SQLite operace blokují hlavní vlákno během dotazu. Prototyp neprovádí stránkování rozsáhlých evidencí: rozvrh načítá nejvýše 300 veřejných / 500 administrátorských termínů, rezervace 1000 záznamů, návštěvy 500 a audit 100. Pro větší provoz je nutné přidat stránkování, měření, vhodnou infrastrukturu a případně jinou databázi.

V současné verzi chybí automatické e-maily, reset hesla, platby, členství, čekací listina a správa doby uchování osobních údajů. Audit není chráněn proti správci databáze a jeho přehled zobrazuje základní údaje; podrobný JSON zůstává uložený v databázi. Nebyl proveden nezávislý penetrační audit ani zátěžové ověření veřejného provozu.

## Primární technické zdroje

- [Node.js 24 — SQLite](https://nodejs.org/download/release/v24.11.0/docs/api/sqlite.html)
- [Node.js 24 — Crypto](https://nodejs.org/download/release/v24.11.0/docs/api/crypto.html)
- [SQLite — Transactions](https://www.sqlite.org/lang_transaction.html)
- [OWASP — Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP — CSRF Prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

Dokumentace popisuje vlastní řešení projektu; odkazy slouží pro principy použitých rozhraní a ochranných opatření.
