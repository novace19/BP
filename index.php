<?php
declare(strict_types=1);
require __DIR__.'/app/bootstrap.php';
require __DIR__.'/app/layout.php';
$page=is_string($_GET['page']??null)?$_GET['page']:'home';
$pages=['home','schedule','trainers','login','register','install','reservations','activity','profile','admin','admin-sessions','admin-lessons','admin-trainers','admin-users','admin-reservations'];
if (!in_array($page,$pages,true)) { http_response_code(404); page_header('Nenalezeno',null,''); heading('404','Stránka nebyla nalezena'); page_footer(); exit; }
try {
    $installed=(int)scalar('SELECT COUNT(*) FROM users')>0;
    if (!$installed && $page!=='install') go('install');
    if ($installed && $page==='install') go('login');
    if ($_SERVER['REQUEST_METHOD']==='POST') {
        require __DIR__.'/app/actions.php';
        try { handle_action(); }
        catch (DomainException $e) { flash($e->getMessage(),'error'); go($page); }
        catch (PDOException $e) { error_log((string)$e); flash($e->getCode()==='23000'?'Tento údaj už existuje nebo odkazuje na neplatný záznam. Zkontrolujte e-mail a výběr položek.':'Akci se nepodařilo uložit. Zkuste to znovu.','error'); go($page); }
    }
    $u=user();
    if (in_array($page,['reservations','activity','profile'],true)) $u=require_user();
    if (strpos($page,'admin')===0) $u=require_admin();
    page_header(['home'=>'Váš pohyb začíná tady','schedule'=>'Rozvrh lekcí','trainers'=>'Naši trenéři','login'=>'Přihlášení','register'=>'Registrace','install'=>'První spuštění','reservations'=>'Moje rezervace','activity'=>'Moje aktivita','profile'=>'Můj profil'][$page]??'Administrace',$u,$page);
    if(strpos($page,'admin')===0) { admin_nav($page); require __DIR__.'/app/admin.php'; }
    else require __DIR__.'/app/pages.php';
    page_footer();
} catch (DomainException $e) {
    page_header('Přístup odepřen',null,$page); heading('Přístup','Tato stránka není dostupná',$e->getMessage()); page_footer();
} catch (Throwable $e) {
    error_log((string)$e); http_response_code(503);
    // Při chybě připojení neukazujeme hesla ani interní výpis výjimky.
    page_header('Připojení k databázi',null,$page); heading('Nastavení','Databáze zatím není připravená','Spusťte MySQL v XAMPP a v phpMyAdmin importujte soubor database/fitness.sql. Pokud máte vlastní přístupové údaje, nastavte je v config.local.php podle config.example.php.'); page_footer();
}
