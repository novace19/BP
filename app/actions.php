<?php
function handle_action(): void {
 check_csrf();
 $action=input('action',40);
 if ($action==='install') {
    $name=required('name',100); $email=email_input(); $hash=password_hash(password_input(),PASSWORD_DEFAULT);
    if ((int)scalar("SELECT GET_LOCK('fitness_first_admin',5)")!==1) throw new DomainException('Instalaci právě dokončuje jiný požadavek.');
    try {
       if ((int)scalar('SELECT COUNT(*) FROM users')!==0) throw new DomainException('První správce už byl vytvořen. Přihlaste se.');
       query('INSERT INTO users(name,email,password_hash,role) VALUES (?,?,?,"admin")',[$name,$email,$hash]);
    } finally { query("SELECT RELEASE_LOCK('fitness_first_admin')"); }
    flash('Správce je vytvořený. Nyní se přihlaste.'); go('login');
 }
 if ($action==='register') {
    if (!(int)scalar('SELECT COUNT(*) FROM users')) throw new DomainException('Nejprve dokončete instalaci.');
    $name=required('name',100); $email=email_input(); $password=password_input();
    query('INSERT INTO users(name,email,password_hash) VALUES (?,?,?)',[$name,$email,password_hash($password,PASSWORD_DEFAULT)]);
    flash('Registrace je hotová. Můžete se přihlásit.'); go('login');
 }
 if ($action==='login') {
    $email=email_input(); $password=input('password',200);
    $ip=hash('sha256',$_SERVER['REMOTE_ADDR']??'local');
    // Krátké okno omezuje hádání hesel; neukládá se samotná IP adresa.
    query('DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL 1 DAY');
    if ((int)scalar('SELECT COUNT(*) FROM login_attempts WHERE ip_hash=? AND attempted_at > NOW() - INTERVAL 15 MINUTE',[$ip])>=15) throw new DomainException('Příliš mnoho pokusů o přihlášení. Zkuste to za 15 minut.');
    query('INSERT INTO login_attempts(ip_hash) VALUES (?)',[$ip]);
    $u=one('SELECT * FROM users WHERE email=?',[$email]);
    // Stejné znění odpovědi pro neexistující účet, špatné heslo a deaktivovaný účet.
    $valid=password_verify($password,$u['password_hash']??'$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');
    if (!$u || !$u['active'] || !$valid) throw new DomainException('Nesprávný e-mail nebo heslo, případně neaktivní účet.');
    if (password_needs_rehash($u['password_hash'],PASSWORD_DEFAULT)) query('UPDATE users SET password_hash=? WHERE id=?',[password_hash($password,PASSWORD_DEFAULT),$u['id']]);
    session_regenerate_id(true); $_SESSION['user_id']=(int)$u['id']; $_SESSION['csrf']=bin2hex(random_bytes(32));
    flash('Jste přihlášeni.'); go('schedule');
 }
 $u=require_user();
 if ($action==='logout') { $_SESSION=[]; session_regenerate_id(true); flash('Byli jste odhlášeni.'); go(); }
 if ($action==='book') { book((int)$u['id'],id_input('session_id')); flash('Místo na lekci máte rezervované.'); go('reservations'); }
 if ($action==='cancel_booking') { cancel_booking((int)$u['id'],id_input('reservation_id')); flash('Rezervace je zrušená.'); go('reservations'); }
 if ($action==='profile') {
    $name=required('name',100); $email=email_input();
    query('UPDATE users SET name=?,email=? WHERE id=?',[$name,$email,$u['id']]);
    flash('Profil je uložený.'); go('profile');
 }
 if ($action==='password') {
    $old=one('SELECT password_hash FROM users WHERE id=?',[$u['id']]);
    if (!password_verify(input('current_password',200),$old['password_hash'])) throw new DomainException('Současné heslo nesouhlasí.');
    $hash=password_hash(password_input(),PASSWORD_DEFAULT);
    query('UPDATE users SET password_hash=? WHERE id=?',[$hash,$u['id']]); session_regenerate_id(true);
    flash('Heslo je změněné.'); go('profile');
 }
 require_admin();
 if ($action==='save_trainer') {
    $id=number_input('id',0,2147483647); $name=required('name',100); $specialty=required('specialty',190); $bio=required('bio',4000); $active=isset($_POST['active'])?1:0;
    if ($id) query('UPDATE trainers SET name=?,specialty=?,bio=?,active=? WHERE id=?',[$name,$specialty,$bio,$active,$id]);
    else query('INSERT INTO trainers(name,specialty,bio,active) VALUES (?,?,?,?)',[$name,$specialty,$bio,$active]);
    flash('Trenér je uložený.'); go('admin-trainers');
 }
 if ($action==='save_lesson') {
    $id=number_input('id',0,2147483647); $name=required('name',100); $description=required('description',4000); $kind=required('kind',20); $duration=number_input('duration_minutes',15,240); $active=isset($_POST['active'])?1:0;
    if (!in_array($kind,['group','personal'],true)) throw new DomainException('Neplatný typ lekce.');
    if ($id) query('UPDATE lessons SET name=?,description=?,kind=?,duration_minutes=?,active=? WHERE id=?',[$name,$description,$kind,$duration,$active,$id]);
    else query('INSERT INTO lessons(name,description,kind,duration_minutes,active) VALUES (?,?,?,?,?)',[$name,$description,$kind,$duration,$active]);
    flash('Lekce je uložená. Změny délky a typu se projeví u nově vytvořených termínů.'); go('admin-lessons');
 }
 if ($action==='create_session') { create_session(); flash('Termín je zveřejněný.'); go('admin-sessions'); }
 if ($action==='cancel_session') { cancel_session(id_input('session_id')); flash('Termín i jeho rezervace jsou zrušené.'); go('admin-sessions'); }
 if ($action==='admin_cancel_booking') { cancel_booking((int)$u['id'],id_input('reservation_id'),true); flash('Rezervace je zrušená.'); go('admin-reservations'); }
 if ($action==='attendance') { mark_attendance(id_input('reservation_id'),required('attendance',20)); flash('Docházka je uložená.'); go('admin-reservations'); }
 if ($action==='save_user') {
    $id=id_input('id'); $role=required('role',20); $active=isset($_POST['active'])?1:0;
    if (!in_array($role,['client','admin'],true)) throw new DomainException('Neplatná role.');
    if ($id===(int)$u['id'] && ($role!=='admin' || !$active)) throw new DomainException('Svůj správcovský účet nemůžete deaktivovat ani mu odebrat roli.');
    query('UPDATE users SET role=?,active=? WHERE id=?',[$role,$active,$id]);
    flash('Uživatel je uložený. Deaktivace blokuje přístup; případné rezervace zrušte v přehledu rezervací.'); go('admin-users');
 }
 throw new DomainException('Neznámá akce.');
}
