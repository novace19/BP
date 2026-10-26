# Rezervační systém fitness centra – Forma Fitness

Bakalářská práce – Vojtěch Nováček. PHP 8.1+, MySQL 8 / MariaDB 10.4+, HTML, CSS, Bootstrap 5 a JavaScript. Bez Composeru a Node.js. Vzhled a ukázkové osoby jsou fiktivní.

## Spuštění v XAMPP na Windows

1. V XAMPP spusťte **Apache** a **MySQL**.
2. Na GitHubu klikněte **Code → Download ZIP** a archiv rozbalte.
3. Obsah složky `BP-main` vložte do `C:\xampp\htdocs\BP`. Soubor `index.php` musí být přímo v `BP`, nikoli v další podsložce. Původní zkušební `index.php` nahraďte.
4. Otevřete <http://localhost/phpmyadmin/>, nahoře **Import** a vyberte `database/fitness.sql`. Klikněte **Provést**. Soubor sám vytvoří databázi `fitness`, tabulky a ukázkové lekce s budoucími termíny. Import proveďte pouze jednou do prázdné databáze; existující tabulky nepřepisuje ani nemaže.
5. Otevřete <http://localhost/BP/>. Vytvořte vlastní první účet správce. Instalace se následně automaticky uzamkne, žádné výchozí heslo neexistuje.
6. Přihlaste se. Další klientský účet vytvoříte přes **Vytvořit účet**. Obě role můžete zkoušet v odděleném/anonymním okně.

Výchozí připojení je `127.0.0.1:3306`, databáze `fitness`, uživatel `root`, prázdné heslo – standardní lokální XAMPP. Pokud je vaše nastavení jiné, zkopírujte `config.example.php` do `config.local.php` a upravte hodnoty. Lokální konfigurace je v `.gitignore`. Bootstrap je uložen přímo v projektu, aplikace za běhu nepotřebuje CDN ani internet.

**Nepoužívejte tuto konfiguraci root bez hesla na veřejném serveru.** Pro nasazení nastavte samostatného databázového uživatele s omezenými právy, HTTPS, bezpečné připojení a zálohování; první instalaci dokončete před zpřístupněním webu. SQL import může provést databázový správce, běžný aplikační účet pak potřebuje jen SELECT/INSERT/UPDATE/DELETE nad databází.

## Funkce

- Veřejný rozvrh s filtrem podle lekce, trenéra a dne, přehled trenérů.
- Registrace, přihlášení, odhlášení, profil a změna hesla.
- Rezervace skupinových lekcí a individuálních tréninků, kontrola kapacity a časové kolize klienta.
- Storno nejpozději 2 hodiny před začátkem. Zrušenou rezervaci lze znovu aktivovat, pokud je místo.
- Historie rezervací, skutečné návštěvy, celkový počet minut a přehled posledních 6 měsíců.
- Správa druhů lekcí a trenérů, včetně úprav a archivace deaktivací.
- Vypisování a rušení termínů, kontrola kolize sálu a trenéra i kapacity místnosti. Zrušení termínu ruší také jeho rezervace.
- Správa uživatelských rolí a aktivace účtů. Správce nemůže odebrat vlastní správcovský přístup.
- Přehled rezervací a evidence docházky od 30 minut před začátkem lekce.

Deaktivace druhu lekce či trenéra brání vytváření nových termínů, již vypsané termíny zůstávají v rozvrhu. Změna délky či typu lekce platí pro nově vytvářené termíny; existující termíny uchovávají délku i typ. Chybný budoucí termín správce zruší a vypíše znovu. Deaktivace klienta blokuje jeho přístup, rezervace může správce samostatně zrušit. Archivace zachovává vazby a historii, fyzické mazání přes web se neprovádí.

Rezervace není návštěva: do statistik vstupuje jen aktivní rezervace označená správcem jako „Přítomen“. Pozdější administrátorské storno tuto návštěvu ze statistik odstraní. Registrace nemůže vytvořit správce; roli může změnit přihlášený správce. E-maily jsou unikátní bez rozlišení velikosti písmen.

## Struktura a zabezpečení

- `index.php`: vstupní bod, povolené stránky a zpracování chyb.
- `app/bootstrap.php`: PDO, autentizace, vstupy a CSRF.
- `app/services.php`: transakční pravidla rezervací, termínů a docházky.
- `app/actions.php`: zpracování POST formulářů a kontrola oprávnění.
- `app/pages.php`, `app/admin.php`, `app/layout.php`: HTML a obrazovky.
- `database/fitness.sql`: databázové schéma a ukázková data.
- `assets/`: místní CSS a JavaScript.
- `tests/`: integrační a HTTP testy, spouštěné také v GitHub Actions.

Hesla používají `password_hash`/`password_verify`, SQL pracuje s PDO prepared statements, HTML se escapuje. Změny probíhají přes POST s CSRF tokenem. Přístup se ověřuje na serveru včetně vlastnictví rezervace. Relace regeneruje ID po přihlášení a průběžně kontroluje aktivaci účtu. Přihlášení je omezeno na 15 pokusů za 15 minut z jedné IP (v databázi je jen hash). Nejde o distribuovaný ochranný systém; pro veřejný provoz je vhodné další omezení na webserveru.

Zámky InnoDB `SELECT ... FOR UPDATE` nad termínem chrání kapacitu při souběžných rezervacích. Zámek uživatele chrání jeho časové kolize, zámky sálu a trenéra brání souběžnému vypsání kolidujících termínů. Intervaly se mohou dotýkat konci, nesmí se překrývat. Časy se zobrazují a zadávají v `Europe/Prague`; MySQL spojení dostává odpovídající offset.

Apache respektuje `.htaccess` a blokuje přímý přístup do `app`, `database`, `tests`, ke konfiguraci a skrytým cestám. Při použití jiného webserveru musíte blokování nastavit sami. PHP vestavěný server je určen jen pro lokální vývoj a testování.

## Testy

GitHub Actions vytvoří samostatnou MariaDB a spustí kontrolu syntaxe, HTTP scénáře a integrační testy obchodních pravidel. Pro místní testování používejte **samostatnou testovací databázi**. Testy přidávají/mažou vlastní záznamy a HTTP test prvního spuštění vyžaduje databázi bez uživatelů. Nespouštějte je nad svou pracovní databází.

```sh
# Po importu SQL do samostatné testovací DB a nastavení config.local.php:
find . -name '*.php' -print0 | xargs -0 -n1 php -l
php -S 127.0.0.1:8080
# V dalším terminálu, před prvním vytvořením uživatele:
python3 tests/http_smoke.py
php tests/run.php
```

V XAMPP může být nutné použít celou cestu `C:\xampp\php\php.exe`. Přesné závislosti a příkazy jsou v `.github/workflows/php.yml`.

## Rozsah první verze

Neobsahuje platby, permanentky, e-mailová oznámení ani obnovu zapomenutého hesla. Obsahuje hlavní funkce zadání a je základem pro vlastní ověření, úpravy a popis v bakalářské práci. Automatické testy nenahrazují uživatelské testování ve Windows/XAMPP. Při použití generovaného kódu postupujte podle pravidel vedoucího práce a školy a zaznamenejte použití AI.

Bootstrap 5.3.3: © The Bootstrap Authors, licence MIT, viz `assets/BOOTSTRAP-LICENSE`.
