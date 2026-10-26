<?php
// Zámek termínu serializuje rezervace, storna i zrušení lekce.
function book(int $uid,int $sid): void {
 transaction(function() use($uid,$sid) {
    $s=one('SELECT * FROM sessions WHERE id=? FOR UPDATE',[$sid]);
    if (!$s || $s['status']!=='published' || strtotime($s['starts_at'])<=time()) throw new DomainException('Na tento termín se již nelze přihlásit.');
    // Zámek uživatele současně brání dvěma souběžným rezervacím kolidujících lekcí.
    $u=one('SELECT active FROM users WHERE id=? FOR UPDATE',[$uid]);
    if (!$u || !$u['active']) throw new DomainException('Účet není aktivní.');
    $old=one('SELECT * FROM reservations WHERE user_id=? AND session_id=?',[$uid,$sid]);
    if ($old && $old['status']==='active') throw new DomainException('Tuto lekci už máte rezervovanou.');
    if ((int)scalar('SELECT COUNT(*) FROM reservations WHERE session_id=? AND status="active"',[$sid]) >= (int)$s['capacity']) throw new DomainException('Lekce je již obsazená.');
    if (scalar('SELECT COUNT(*) FROM reservations b JOIN sessions s ON s.id=b.session_id WHERE b.user_id=? AND b.status="active" AND s.status="published" AND s.starts_at < ? AND s.ends_at > ?',[$uid,$s['ends_at'],$s['starts_at']])) throw new DomainException('V tomto čase už máte jinou rezervaci.');
    if ($old) query('UPDATE reservations SET status="active",attendance="pending",created_at=NOW(),cancelled_at=NULL WHERE id=?',[$old['id']]);
    else query('INSERT INTO reservations(user_id,session_id) VALUES (?,?)',[$uid,$sid]);
 });
}
function cancel_booking(int $uid,int $bid,bool $admin=false): void {
 transaction(function() use($uid,$bid,$admin) {
    $b=one('SELECT session_id FROM reservations WHERE id=?',[$bid]);
    if (!$b) throw new DomainException('Rezervace neexistuje.');
    $s=one('SELECT * FROM sessions WHERE id=? FOR UPDATE',[$b['session_id']]);
    $b=one('SELECT * FROM reservations WHERE id=? FOR UPDATE',[$bid]);
    if (!$admin && (int)$b['user_id']!==$uid) throw new DomainException('Tato rezervace vám nepatří.');
    if ($b['status']!=='active') throw new DomainException('Rezervace už je zrušená.');
    if (!$admin && (strtotime($s['starts_at'])-time()<7200 || $b['attendance']!=='pending')) throw new DomainException('Rezervaci lze zrušit nejpozději 2 hodiny před začátkem.');
    query('UPDATE reservations SET status="cancelled",cancelled_at=NOW(),attendance="pending" WHERE id=?',[$bid]);
 });
}
function create_session(): void {
 $lid=id_input('lesson_id'); $tid=id_input('trainer_id'); $rid=id_input('room_id'); $capacity=number_input('capacity',1,500);
 $text=required('starts_at',30); $start=DateTimeImmutable::createFromFormat('!Y-m-d\TH:i',$text);
 if (!$start || $start->format('Y-m-d\TH:i')!==$text || $start->getTimestamp()<=time()) throw new DomainException('Vyberte platný budoucí termín.');
 transaction(function() use($lid,$tid,$rid,$capacity,$start) {
    $l=one('SELECT * FROM lessons WHERE id=? FOR UPDATE',[$lid]);
    $t=one('SELECT * FROM trainers WHERE id=? FOR UPDATE',[$tid]);
    $r=one('SELECT * FROM rooms WHERE id=? FOR UPDATE',[$rid]);
    if (!$l || !$l['active'] || !$t || !$t['active'] || !$r) throw new DomainException('Vyberte aktivní lekci, trenéra a sál.');
    if ($capacity>(int)$r['capacity'] || ($l['kind']==='personal' && $capacity!==1)) throw new DomainException('Kapacita přesahuje velikost sálu nebo osobní trénink nemá kapacitu 1.');
    $end=$start->modify('+'.(int)$l['duration_minutes'].' minutes');
    if (scalar('SELECT COUNT(*) FROM sessions WHERE status="published" AND (trainer_id=? OR room_id=?) AND starts_at < ? AND ends_at > ?',[$tid,$rid,$end->format('Y-m-d H:i:s'),$start->format('Y-m-d H:i:s')])) throw new DomainException('V tomto čase je trenér nebo sál již obsazený.');
    query('INSERT INTO sessions(lesson_id,trainer_id,room_id,starts_at,ends_at,capacity,kind) VALUES (?,?,?,?,?,?,?)',[$lid,$tid,$rid,$start->format('Y-m-d H:i:s'),$end->format('Y-m-d H:i:s'),$capacity,$l['kind']]);
 });
}
function cancel_session(int $sid): void {
 transaction(function() use($sid) {
    $s=one('SELECT * FROM sessions WHERE id=? FOR UPDATE',[$sid]);
    if (!$s || $s['status']!=='published' || strtotime($s['starts_at'])<=time()) throw new DomainException('Zrušit lze pouze budoucí zveřejněný termín.');
    query('UPDATE sessions SET status="cancelled" WHERE id=?',[$sid]);
    query('UPDATE reservations SET status="cancelled",cancelled_at=NOW(),attendance="pending" WHERE session_id=? AND status="active"',[$sid]);
 });
}
function mark_attendance(int $bid,string $value): void {
 if (!in_array($value,['pending','present','absent'],true)) throw new DomainException('Neplatný stav docházky.');
 transaction(function() use($bid,$value) {
    $b=one('SELECT session_id FROM reservations WHERE id=?',[$bid]);
    if (!$b) throw new DomainException('Rezervace neexistuje.');
    $s=one('SELECT * FROM sessions WHERE id=? FOR UPDATE',[$b['session_id']]);
    $b=one('SELECT * FROM reservations WHERE id=? FOR UPDATE',[$bid]);
    if ($b['status']!=='active' || $s['status']!=='published' || strtotime($s['starts_at'])>time()+1800) throw new DomainException('Docházku lze evidovat od 30 minut před začátkem aktivní lekce.');
    query('UPDATE reservations SET attendance=? WHERE id=?',[$value,$bid]);
 });
}
