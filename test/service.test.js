import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { openDatabase } from '../src/db.js';
import { FitnessService } from '../src/service.js';
import { NOW, populate, addSession } from './fixtures.js';

function fixture(t) {
  const db=openDatabase(':memory:');populate(db);t.after(()=>db.close());
  const service=new FitnessService(db,()=>NOW);return {db,service,a:service.user(1),u:service.user(2),v:service.user(3)};
}
test('rezervace posledního místa a duplicitní požadavek',t=>{
  const {db,service,u,v}=fixture(t);const first=service.book(u,1);
  assert.equal(service.book(u,1).id,first.id);assert.equal(service.book(u,1).existing,true);
  assert.throws(()=>service.book(v,1),/plně obsazený/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reservations WHERE status='active'").get().n,1);
});
test('cizí rezervaci nelze zrušit ani rezervovat za cizí účet',t=>{
  const {service,u,v}=fixture(t);const b=service.book(u,1);
  assert.throws(()=>service.cancel(v,b.id),/nebyla nalezena/);
  assert.throws(()=>service.book(v,1,u.id),/jen pro správce/);
});
test('storno přesně na hranici, opakované storno a opětovná rezervace',t=>{
  const {db,service,u}=fixture(t);db.prepare('UPDATE class_sessions SET start_at=?,end_at=? WHERE id=1').run(NOW+7200000,NOW+10800000);
  const first=service.book(u,1);service.cancel(u,first.id);service.cancel(u,first.id);
  const next=service.book(u,1);assert.notEqual(first.id,next.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM reservations').get().n,2);
});
test('storno za časovou hranicí se odmítá, správce může zasáhnout',t=>{
  const {db,service,a,u}=fixture(t);db.prepare('UPDATE class_sessions SET start_at=?,end_at=? WHERE id=1').run(NOW+7199999,NOW+10800000);
  const b=service.book(u,1);assert.throws(()=>service.cancel(u,b.id),/dvě hodiny/);service.cancel(a,b.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM audit').get().n,1);
});
test('koncept, zrušený i minulý termín nejsou rezervovatelné',t=>{
  const {db,service,u}=fixture(t);
  for(const status of ['draft','cancelled']){db.prepare('UPDATE class_sessions SET status=? WHERE id=1').run(status);assert.throws(()=>service.book(u,1),/nelze rezervovat/);}
  db.prepare("UPDATE class_sessions SET status='published',start_at=?,end_at=? WHERE id=1").run(NOW-7200000,NOW-3600000);
  assert.throws(()=>service.book(u,1),/nelze rezervovat/);
});
test('snížení kapacity pod rezervace se odmítne a transakce se vrátí',t=>{
  const {db,service,a,u,v}=fixture(t);db.prepare('UPDATE class_sessions SET capacity=3 WHERE id=1').run();service.book(u,1);service.book(v,1);
  const s=db.prepare('SELECT * FROM class_sessions WHERE id=1').get();
  assert.throws(()=>service.saveSession(a,1,{...s,capacity:1}),/pod počet/);
  assert.equal(db.prepare('SELECT capacity FROM class_sessions WHERE id=1').get().capacity,3);
});
test('sál a trenér nesmějí kolidovat; přilehlé termíny jsou přípustné',t=>{
  const {db,service,a}=fixture(t),s=db.prepare('SELECT * FROM class_sessions WHERE id=1').get();
  assert.throws(()=>service.saveSession(a,null,{...s,start_at:s.start_at+60000}),/obsazený/);
  const next=service.saveSession(a,null,{...s,start_at:s.end_at,end_at:s.end_at+3600000});assert.ok(next.id);
});
test('osobní trénink má kapacitu jedna a termín nepřekročí kapacitu sálu',t=>{
  const {db,service,a}=fixture(t),s=db.prepare('SELECT * FROM class_sessions WHERE id=1').get();
  assert.throws(()=>service.saveSession(a,1,{...s,lesson_id:2,capacity:2}),/jedno místo/);
  assert.throws(()=>service.saveSession(a,1,{...s,capacity:11}),/kapacitu sálu/);
});
test('zrušení termínu atomicky zruší všechny jeho rezervace',t=>{
  const {db,service,a,u}=fixture(t);service.book(u,1);
  const s=db.prepare('SELECT * FROM class_sessions WHERE id=1').get();service.saveSession(a,1,{...s,status:'cancelled'});
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reservations WHERE status='active'").get().n,0);
  assert.throws(()=>service.saveSession(a,1,s),/neobnovuje/);
});
test('deaktivace účtu nepřepíše rezervace a znemožní další operace',t=>{
  const {db,service,a,u}=fixture(t);service.book(u,1);service.saveUser(a,u.id,{name:u.name,role:'client',active:0});
  assert.equal(db.prepare("SELECT COUNT(*) n FROM reservations WHERE status='active'").get().n,1);
  assert.throws(()=>service.book(u,1),/není aktivní/);
});
test('odebrané administrátorské oprávnění platí i pro dříve načtený účet',t=>{
  const {db,service,a,u}=fixture(t);const booking=service.book(u,1);
  db.prepare("UPDATE users SET role='client' WHERE id=1").run();
  assert.throws(()=>service.cancel(a,booking.id),/nebyla nalezena/);
});
test('nelze odebrat posledního správce ani snížit obsazený sál',t=>{
  const {service,a}=fixture(t);
  assert.throws(()=>service.saveUser(a,a.id,{name:a.name,role:'client',active:1}),/Posledního/);
  assert.throws(()=>service.saveCatalog(a,'rooms',1,{name:'Sál',capacity:0}),/celé číslo/);
});
test('návštěva vzniká až potvrzením správcem a účast se neduplikuje',t=>{
  const {db,service,a,u}=fixture(t);const b=service.book(u,1);
  assert.equal(service.visits(u).length,0);
  assert.throws(()=>service.recordVisit(a,{user_id:u.id,reservation_id:b.id}),/30 minut/);
  db.prepare('UPDATE class_sessions SET start_at=?,end_at=? WHERE id=1').run(NOW-3600000,NOW-1);
  const v=service.recordVisit(a,{user_id:u.id,reservation_id:b.id});
  assert.equal(service.recordVisit(a,{user_id:u.id,reservation_id:b.id}).id,v.id);
  assert.equal(service.visits(u).length,1);assert.throws(()=>service.cancel(a,b.id),/absolvované/);
});
test('přímý duplicitní nebo přeplňující zápis chrání databáze',t=>{
  const {db,service,u,v}=fixture(t);service.book(u,1);
  assert.throws(()=>db.prepare('INSERT INTO reservations(user_id,session_id,created_at) VALUES(?,?,?)').run(v.id,1,NOW),/session_full/);
  assert.throws(()=>db.prepare('UPDATE class_sessions SET capacity=0 WHERE id=1').run(),/capacity_below_bookings|CHECK/);
});
test('data přetrvají zavření a znovuotevření databáze',()=>{
  const dir=mkdtempSync(join(tmpdir(),'fitness-persist-'));const path=join(dir,'test.sqlite');
  try{let db=openDatabase(path);populate(db);new FitnessService(db,()=>NOW).book({id:2},1);db.close();db=openDatabase(path);assert.equal(db.prepare('SELECT COUNT(*) n FROM reservations').get().n,1);db.close();}finally{rmSync(dir,{recursive:true,force:true});}
});
test('dva nezávislé procesory přes dvě databázová připojení získají jediné poslední místo',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'fitness-race-')),path=join(dir,'test.sqlite');
  const db=openDatabase(path);populate(db);db.close();
  const barrier=new SharedArrayBuffer(4);
  const workers=[2,3].map(userId=>new Worker(new URL('./race-worker.js',import.meta.url),{workerData:{path,userId,barrier}}));
  try {
    const results=workers.map(worker=>new Promise((resolve,reject)=>{worker.on('message',m=>{if(m.ready)return;resolve(m);});worker.on('error',reject);}));
    await Promise.all(workers.map(worker=>new Promise(resolve=>worker.once('message',resolve))));
    Atomics.store(new Int32Array(barrier),0,1);Atomics.notify(new Int32Array(barrier),0,2);
    const out=await Promise.all(results);assert.equal(out.filter(x=>x.ok).length,1);assert.match(out.find(x=>!x.ok).error,/plně obsazený/);
    const check=openDatabase(path);assert.equal(check.prepare("SELECT COUNT(*) n FROM reservations WHERE status='active'").get().n,1);check.close();
  }finally{await Promise.all(workers.map(w=>w.terminate()));rmSync(dir,{recursive:true,force:true});}
});
