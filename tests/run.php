<?php
declare(strict_types=1);
require dirname(__DIR__).'/app/bootstrap.php';
$checks=[]; $uids=[]; $sids=[]; $tids=[]; $lids=[]; $rids=[];
function check(bool $ok,string $name): void { global $checks; if(!$ok) throw new RuntimeException('FAIL: '.$name); $checks[]=$name; }
function rejects(callable $fn,string $name): void { try { $fn(); } catch(DomainException $e) { check(true,$name); return; } throw new RuntimeException('FAIL (accepted): '.$name); }
function fixture_session(string $when,int $capacity=1,int $lesson=1,int $trainer=1,int $room=1): int {
 global $sids;
 $start=date('Y-m-d H:i:s',strtotime($when)); $end=date('Y-m-d H:i:s',strtotime($when)+3600);
 query('INSERT INTO sessions(lesson_id,trainer_id,room_id,starts_at,ends_at,capacity) VALUES (?,?,?,?,?,?)',[$lesson,$trainer,$room,$start,$end,$capacity]);
 $id=(int)db()->lastInsertId(); $sids[]=$id; return $id;
}
try {
 $prefix='test-'.bin2hex(random_bytes(6));
 for($i=0;$i<4;$i++){query('INSERT INTO users(name,email,password_hash) VALUES (?,?,?)',['Test client',$prefix.$i.'@example.test',password_hash('Test-password-123',PASSWORD_DEFAULT)]);$uids[]=(int)db()->lastInsertId();}
 $sid=fixture_session('+10 days');
 book($uids[0],$sid);
 check((int)scalar('SELECT COUNT(*) FROM reservations WHERE session_id=? AND status="active"',[$sid])===1,'reservation persisted');
 rejects(fn()=>book($uids[0],$sid),'duplicate rejected');
 rejects(fn()=>book($uids[1],$sid),'full session rejected');
 $bid=(int)scalar('SELECT id FROM reservations WHERE user_id=? AND session_id=?',[$uids[0],$sid]);
 rejects(fn()=>cancel_booking($uids[1],$bid),'ownership enforced');
 cancel_booking($uids[0],$bid); check(scalar('SELECT status FROM reservations WHERE id=?',[$bid])==='cancelled','cancellation persisted');
 book($uids[0],$sid); check((int)scalar('SELECT COUNT(*) FROM reservations WHERE user_id=? AND session_id=?',[$uids[0],$sid])===1,'rebooking reuses row');
 $collision=fixture_session('+10 days +30 minutes',3);
 rejects(fn()=>book($uids[0],$collision),'client overlap rejected');
 $touch=fixture_session('+10 days +1 hour',3); book($uids[0],$touch); check(true,'adjacent intervals allowed');
 $soon=fixture_session('+1 hour',3);book($uids[1],$soon);$bsoon=(int)scalar('SELECT id FROM reservations WHERE user_id=? AND session_id=?',[$uids[1],$soon]);
 rejects(fn()=>cancel_booking($uids[1],$bsoon),'late cancellation rejected');
 rejects(fn()=>mark_attendance($bsoon,'present'),'too early attendance rejected');
 query('UPDATE sessions SET starts_at=NOW()-INTERVAL 5 MINUTE,ends_at=NOW()+INTERVAL 55 MINUTE WHERE id=?',[$soon]);
 mark_attendance($bsoon,'present'); check(scalar('SELECT attendance FROM reservations WHERE id=?',[$bsoon])==='present','attendance persisted');
 rejects(fn()=>mark_attendance($bsoon,'forged'),'invalid attendance rejected');
 cancel_booking($uids[0],$bsoon,true); check(scalar('SELECT attendance FROM reservations WHERE id=?',[$bsoon])==='pending','admin cancellation clears attendance');
 $past=fixture_session('-2 days',3); rejects(fn()=>book($uids[2],$past),'past booking rejected');
 cancel_session($sid); check(scalar('SELECT status FROM sessions WHERE id=?',[$sid])==='cancelled','session cancelled');
 check(scalar('SELECT status FROM reservations WHERE id=?',[$bid])==='cancelled','session cancellation propagates');
 rejects(fn()=>book($uids[2],$sid),'cancelled session booking rejected');
 query('UPDATE users SET active=0 WHERE id=?',[$uids[3]]); rejects(fn()=>book($uids[3],$collision),'inactive client rejected');
 query('INSERT INTO trainers(name,specialty,bio) VALUES (?,?,?)',[$prefix,'Test','Test']); $tid=(int)db()->lastInsertId();$tids[]=$tid;
 query('INSERT INTO rooms(name,capacity) VALUES (?,?)',[$prefix,2]);$rid=(int)db()->lastInsertId();$rids[]=$rid;
 query('INSERT INTO lessons(name,description,kind,duration_minutes) VALUES (?,?,?,?)',[$prefix,'Test','personal',60]);$lid=(int)db()->lastInsertId();$lids[]=$lid;
 $_POST=['lesson_id'=>$lid,'trainer_id'=>$tid,'room_id'=>$rid,'capacity'=>2,'starts_at'=>date('Y-m-d\TH:i',strtotime('+20 days'))];
 rejects(fn()=>create_session(),'personal capacity must equal one');
 $_POST['capacity']=1; create_session();$new=(int)db()->lastInsertId();$sids[]=$new; check(scalar('SELECT kind FROM sessions WHERE id=?',[$new])==='personal','session snapshots kind');
 rejects(fn()=>create_session(),'trainer and room collision rejected');
 $_POST['starts_at']=date('Y-m-d\TH:i',strtotime('+20 days +1 hour'));create_session();$sids[]=(int)db()->lastInsertId();check(true,'adjacent trainer and room sessions allowed');
 query('UPDATE trainers SET active=0 WHERE id=?',[$tid]); $_POST['starts_at']=date('Y-m-d\TH:i',strtotime('+21 days')); rejects(fn()=>create_session(),'inactive trainer rejected');
 query('UPDATE trainers SET active=1 WHERE id=?',[$tid]);query('UPDATE lessons SET kind="group" WHERE id=?',[$lid]);$_POST['capacity']=3;rejects(fn()=>create_session(),'room capacity enforced');
 $_POST['capacity']=1;$_POST['starts_at']='2026-02-30T15:00';rejects(fn()=>create_session(),'invalid date rejected');
 check(scalar('SELECT kind FROM sessions WHERE id=?',[$new])==='personal','catalog edit preserves old session kind');
 // Dva samostatné PHP procesy rezervují poslední místo současně.
 $race=fixture_session('+30 days');$workers=[];
 foreach([$uids[1],$uids[2]] as $uid){$pipes=[];$process=proc_open([PHP_BINARY,__DIR__.'/worker.php',(string)$uid,(string)$race],[0=>['pipe','r'],1=>['pipe','w'],2=>['pipe','w']],$pipes);fclose($pipes[0]);$workers[]=[$process,$pipes];}
 $results=[];foreach($workers as [$process,$pipes]){$results[]=stream_get_contents($pipes[1]);$err=stream_get_contents($pipes[2]);fclose($pipes[1]);fclose($pipes[2]);if(proc_close($process)!==0)throw new RuntimeException($err);}
 sort($results);check($results===['OK','REJECTED'],'concurrent last-place booking has exactly one winner');
 check((int)scalar('SELECT COUNT(*) FROM reservations WHERE session_id=? AND status="active"',[$race])===1,'concurrent capacity not exceeded');
 echo count($checks)." integration checks passed\n";foreach($checks as $name) echo '  OK '.$name."\n";
} finally {
 foreach($sids as $id){query('DELETE FROM reservations WHERE session_id=?',[$id]);query('DELETE FROM sessions WHERE id=?',[$id]);}
 foreach($uids as $id){query('DELETE FROM reservations WHERE user_id=?',[$id]);query('DELETE FROM users WHERE id=?',[$id]);}
 foreach($tids as $id)query('DELETE FROM trainers WHERE id=?',[$id]);
 foreach($lids as $id)query('DELETE FROM lessons WHERE id=?',[$id]);
 foreach($rids as $id)query('DELETE FROM rooms WHERE id=?',[$id]);
}
