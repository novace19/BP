import { openDatabase, transaction } from '../src/db.js';
import { hashPassword, token } from '../src/security.js';

const db=openDatabase();
if(db.prepare('SELECT COUNT(*) n FROM users').get().n){console.log('Databáze už obsahuje účty. Demo data se nepřepisují.');db.close();process.exit(0);}
const adminPassword=token().slice(0,18),clientPassword=token().slice(0,18);
const adminHash=await hashPassword(adminPassword),clientHash=await hashPassword(clientPassword);
const now=Date.now(),day=86400000;
transaction(db,()=>{
  db.prepare('INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,?,?)').run('Správce centra','admin@fitness.test',adminHash,'admin',now);
  db.prepare('INSERT INTO users(name,email,password_hash,created_at) VALUES(?,?,?,?)').run('Alex Novák','klient@fitness.test',clientHash,now);
  const trainer=db.prepare('INSERT INTO trainers(name,bio,specialty) VALUES(?,?,?)');
  trainer.run('Tereza Malá','Pomůžu vám najít rovnováhu a radost z pohybu.','Jóga a mobilita');
  trainer.run('Adam Dvořák','Síla se buduje postupně. Každý trénink se počítá.','Síla a kondice');
  trainer.run('Klára Veselá','Energie, rytmus a trénink s úsměvem.','Kardio a funkční trénink');
  db.prepare('INSERT INTO rooms(name,capacity) VALUES(?,?)').run('Studio A',16);
  db.prepare('INSERT INTO rooms(name,capacity) VALUES(?,?)').run('Silová zóna',10);
  db.prepare('INSERT INTO rooms(name,capacity) VALUES(?,?)').run('Tréninkové studio',2);
  const lesson=db.prepare('INSERT INTO lessons(name,description,kind,duration,color) VALUES(?,?,?,?,?)');
  lesson.run('Ranní flow','Protažení, vědomý dech a klidný začátek dne. Lekce je vhodná i pro začátečníky.','group',60,'purple');
  lesson.run('Silový trénink','Celé tělo, správná technika a práce s vlastní vahou i činkami. Intenzitu přizpůsobíme vám.','group',60,'green');
  lesson.run('Funkční kruháč','Střídání stanovišť pro lepší kondici, stabilitu a sílu. Vezměte si ručník a vodu.','group',45,'orange');
  lesson.run('Osobní trénink','Individuální lekce s trenérem podle vašich zkušeností a cílů. Jedno místo jen pro vás.','personal',60,'blue');
  const insert=db.prepare('INSERT INTO class_sessions(lesson_id,trainer_id,room_id,start_at,end_at,capacity) VALUES(?,?,?,?,?,?)');
  // Relative dates keep the local demonstration useful whenever it is first seeded.
  const base=new Date(now);base.setUTCHours(7,0,0,0);
  for(let n=1;n<=14;n++) {
    const at=base.getTime()+n*day;
    insert.run(1,1,1,at,at+3600000,12);
    insert.run(2,2,2,at+7*3600000,at+8*3600000,8);
    insert.run(3,3,1,at+9*3600000,at+9.75*3600000,16);
    if(n%2)insert.run(4,2,3,at+3*3600000,at+4*3600000,1);
  }
  // Completed demo activity with a real reservation-to-visit relationship.
  const old=Number(insert.run(1,1,1,now-2*day,now-2*day+3600000,12).lastInsertRowid);
  const booking=Number(db.prepare('INSERT INTO reservations(user_id,session_id,created_at) VALUES(2,?,?)').run(old,now-4*day).lastInsertRowid);
  db.prepare('INSERT INTO visits(user_id,reservation_id,visited_at,recorded_by,note) VALUES(2,?,?,1,?)').run(booking,now-2*day,'Ukázková absolvovaná lekce');
  db.prepare('INSERT INTO visits(user_id,visited_at,recorded_by,note) VALUES(2,?,1,?)').run(now-5*day,'Ukázková návštěva posilovny');
});
db.close();
console.log(`Demo data byla vytvořena. Hesla jsou náhodná; poznamenejte si je.\nSprávce: admin@fitness.test / ${adminPassword}\nKlient: klient@fitness.test / ${clientPassword}\nPouze syntetická data. Nový vlastní účet založíte přímo v aplikaci.`);
