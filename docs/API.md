# JSON API

Všechny cesty mají prefix `/api`. Zápisové požadavky používají `Content-Type: application/json`, cookie relace a hlavičku `X-CSRF-Token`. Token vrací `GET /api/me` a rotující přihlašovací operace. Server nevydává CORS oprávnění pro cizí weby. Časové údaje se přenášejí jako čísla v milisekundách od Unix epochy.

## Veřejná a účtová část

| Metoda a cesta | Účel / tělo |
| --- | --- |
| `GET /me` | Aktuální účet, CSRF a serverový čas |
| `POST /auth/register` | `name`, `email`, `password` (12–128 znaků) |
| `POST /auth/login` | `email`, `password` |
| `POST /auth/logout` | Prázdný objekt; rotace na anonymní relaci |
| `GET /catalogs` | Lekce, trenéři a sály; neaktivní katalogy pouze správci |
| `GET /schedule` | Budoucí publikované termíny; správce získá i koncepty a historii |
| `GET /reservations` | Jen vlastní rezervace přihlášeného účtu |
| `POST /reservations` | `session_id`; správce může přidat `user_id` |
| `POST /reservations/:id/cancel` | Storno vlastní rezervace nebo zásah správce |
| `GET /visits` | Jen vlastní zaznamenané návštěvy |
| `PATCH /profile` | `name` |
| `POST /profile/password` | `current_password`, `password`; ostatní relace zaniknou |

## Administrace

Všechny následující operace vyžadují aktivního správce.

| Metoda a cesta | Účel / tělo |
| --- | --- |
| `GET /admin/users` | Přehled účtů bez hesel a hashů |
| `PUT /admin/users/:id` | `name`, `role` (`client`/`admin`), `active` (0/1) |
| `POST /admin/lessons` / `PUT /admin/lessons/:id` | `name`, `description`, `kind` (`group`/`personal`), `duration`, `color` (`purple`/`green`/`orange`/`blue`), `active` |
| `POST /admin/trainers` / `PUT /admin/trainers/:id` | `name`, `bio`, `specialty`, `active` |
| `POST /admin/rooms` / `PUT /admin/rooms/:id` | `name`, `capacity` |
| `POST /admin/sessions` / `PUT /admin/sessions/:id` | `lesson_id`, `trainer_id`, `room_id`, `start_at`, `end_at`, `capacity`, `status` (`draft`/`published`/`cancelled`) |
| `GET /admin/reservations` | Rezervace centra včetně vazby na účast |
| `GET /admin/visits` | Přehled návštěv |
| `POST /admin/visits` | `user_id`, volitelný `reservation_id`, `note`; bez rezervace jde o aktuální vstup do posilovny |
| `GET /admin/audit` | Posledních 100 zásahů správce |

Číselná pole musí být JSON čísla, nikoli textové řetězce. Změna lekce nebo trenéra s historií se řeší příznakem aktivity, není k dispozici fyzické DELETE.

## Výsledky a chyby

Úspěšné načtení nebo úprava vrací 200, nové záznamy zpravidla 201. Opakovaná aktivní rezervace vrací 200 se stejným `id` a `existing: true`. Potvrzení dříve zaznamenané účasti vrací stejné ID; nemění počet návštěv.

Chybová odpověď má tvar `{"error":"Srozumitelný popis"}`. Používají se kódy 400 (validace), 401 (chybějící přihlášení), 403 (oprávnění/CSRF/origin), 404 (nedostupný záznam nebo cesta), 409 (provozní konflikt), 413 (tělo nad 32 KiB), 415 (typ obsahu), 429 (četnost), 500 (neočekávaná chyba) a 503 (zaneprázdněná databáze). Neočekávané chyby nesdělují SQL ani hodnoty hesel uživateli.
