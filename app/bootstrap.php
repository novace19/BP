<?php
declare(strict_types=1);
date_default_timezone_set('Europe/Prague');
ini_set('session.use_strict_mode', '1');
session_set_cookie_params(['httponly'=>true,'samesite'=>'Lax','secure'=>!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off']);
session_start();
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');
header("Content-Security-Policy: default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'; base-uri 'self'");
header('Cache-Control: no-store');
function e($value): string { return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function db(): PDO {
    static $pdo;
    if (!$pdo) {
        $file = dirname(__DIR__) . '/config.local.php';
        $c = require is_file($file) ? $file : dirname(__DIR__) . '/config.example.php';
        $pdo = new PDO("mysql:host={$c['host']};port={$c['port']};dbname={$c['database']};charset=utf8mb4",$c['username'],$c['password'],[
            PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC,PDO::ATTR_EMULATE_PREPARES=>false
        ]);
        // Lokální časy aplikace jsou české; databázová session má stejný aktuální offset.
        $pdo->exec("SET time_zone = '" . date('P') . "'");
    }
    return $pdo;
}
function query(string $sql, array $args=[]): PDOStatement { $s=db()->prepare($sql); $s->execute($args); return $s; }
function all(string $sql,array $args=[]): array { return query($sql,$args)->fetchAll(); }
function one(string $sql,array $args=[]): ?array { return query($sql,$args)->fetch() ?: null; }
function scalar(string $sql,array $args=[]) { return query($sql,$args)->fetchColumn(); }
function go(string $page='home'): void { header('Location: index.php?page='.rawurlencode($page)); exit; }
function flash(string $text,string $type='success'): void { $_SESSION['flash']=['text'=>$text,'type'=>$type]; }
function csrf(): string { return $_SESSION['csrf'] ?? ($_SESSION['csrf']=bin2hex(random_bytes(32))); }
function token(): void { echo '<input type="hidden" name="csrf" value="'.e(csrf()).'">'; }
function check_csrf(): void {
    if (!is_string($_POST['csrf']??null) || !hash_equals(csrf(),$_POST['csrf'])) throw new DomainException('Platnost formuláře vypršela. Obnovte stránku a zkuste to znovu.');
}
function user(): ?array {
    if (empty($_SESSION['user_id'])) return null;
    $u=one('SELECT id,name,email,role,active FROM users WHERE id=?',[(int)$_SESSION['user_id']]);
    if (!$u || !$u['active']) { unset($_SESSION['user_id']); return null; }
    return $u;
}
function require_user(): array { $u=user(); if (!$u) { flash('Nejprve se přihlaste.','error'); go('login'); } return $u; }
function require_admin(): array { $u=require_user(); if ($u['role']!=='admin') { http_response_code(403); throw new DomainException('K této akci nemáte oprávnění.'); } return $u; }
function input(string $key,int $max=1000): string {
    $v=$_POST[$key]??'';
    if (!is_string($v)) throw new DomainException('Neplatný vstup formuláře.');
    $v=trim($v);
    if (strlen($v)>$max) throw new DomainException('Zadaný text je příliš dlouhý.');
    return $v;
}
function required(string $key,int $max=1000): string { $s=input($key,$max); if ($s==='') throw new DomainException('Vyplňte všechna povinná pole.'); return $s; }
function id_input(string $key): int { $v=filter_var($_POST[$key]??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]); if (!$v) throw new DomainException('Neplatný identifikátor.'); return $v; }
function number_input(string $key,int $min,int $max): int { $v=filter_var($_POST[$key]??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>$min,'max_range'=>$max]]); if ($v===false || $v===null) throw new DomainException('Číselný údaj je mimo povolený rozsah.'); return $v; }
function email_input(): string { $v=strtolower(required('email',190)); if (!filter_var($v,FILTER_VALIDATE_EMAIL)) throw new DomainException('Zadejte platný e-mail.'); return $v; }
function password_input(): string { $v=$_POST['password']??''; if (!is_string($v) || strlen($v)<10 || strlen($v)>72) throw new DomainException('Heslo musí mít 10 až 72 bajtů (alespoň 10 běžných znaků).'); return $v; }
function stamp(string $time): string { return date('d. m. Y · H:i',strtotime($time)); }
function attendance_label(string $v): string { return ['pending'=>'Nepotvrzeno','present'=>'Přítomen','absent'=>'Nepřítomen'][$v]??$v; }
function transaction(callable $fn) { db()->beginTransaction(); try { $r=$fn(); db()->commit(); return $r; } catch (Throwable $e) { if(db()->inTransaction()) db()->rollBack(); throw $e; } }
const SESSION_SELECT = 'SELECT s.*,l.name AS lesson_name,l.description,TIMESTAMPDIFF(MINUTE,s.starts_at,s.ends_at) AS duration_minutes,t.name AS trainer_name,r.name AS room_name,(SELECT COUNT(*) FROM reservations b WHERE b.session_id=s.id AND b.status="active") AS booked FROM sessions s JOIN lessons l ON l.id=s.lesson_id JOIN trainers t ON t.id=s.trainer_id JOIN rooms r ON r.id=s.room_id ';
require __DIR__.'/services.php';
