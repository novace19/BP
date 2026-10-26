export const NOW=1900000000000;
export function populate(db,hash='test-only-hash') {
  db.prepare('INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(1,'Správce','admin@test.cz',hash,'admin',NOW);
  db.prepare('INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(2,'První klient','one@test.cz',hash,'client',NOW);
  db.prepare('INSERT INTO users(id,name,email,password_hash,role,created_at) VALUES(?,?,?,?,?,?)').run(3,'Druhý klient','two@test.cz',hash,'client',NOW);
  db.exec(`INSERT INTO trainers(id,name) VALUES(1,'Trenér'),(2,'Druhý trenér');
    INSERT INTO rooms(id,name,capacity) VALUES(1,'První sál',10),(2,'Druhý sál',10);
    INSERT INTO lessons(id,name,kind,duration) VALUES(1,'Jóga','group',60),(2,'Osobní trénink','personal',60);`);
  addSession(db,1,1);
}
export function addSession(db,id,capacity=4,start=NOW+86400000) {
  db.prepare('INSERT INTO class_sessions(id,lesson_id,trainer_id,room_id,start_at,end_at,capacity) VALUES(?,1,1,1,?,?,?)').run(id,start,start+3600000,capacity);
}
