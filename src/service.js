import { transaction } from './db.js';
import { AppError, requireValue, text, integer } from './security.js';

const sessionQuery = `SELECT s.*,l.name,l.description,l.kind,l.color,l.duration,t.name trainer_name,
 r.name room_name,(SELECT COUNT(*) FROM reservations b WHERE b.session_id=s.id AND b.status='active') booked
 FROM class_sessions s JOIN lessons l ON l.id=s.lesson_id JOIN trainers t ON t.id=s.trainer_id
 JOIN rooms r ON r.id=s.room_id`;
export const publicUser = (u) => u && ({ id: u.id, name: u.name, email: u.email, role: u.role, active: u.active });

/** Business rules are shared by client and administrator operations. */
export class FitnessService {
  constructor(db, clock = Date.now) { this.db = db; this.now = clock; }
  audit(actor, action, entity, id, details = {}) {
    this.db.prepare('INSERT INTO audit(actor_id,action,entity,entity_id,details,created_at) VALUES(?,?,?,?,?,?)')
      .run(actor.id, action, entity, Number(id), JSON.stringify(details), this.now());
  }
  user(id) { return this.db.prepare('SELECT * FROM users WHERE id=?').get(id); }
  account(id) { const u = this.user(id); requireValue(u?.active, 'Účet není aktivní.', 403); return u; }
  admin(actor) { requireValue(this.account(actor.id).role === 'admin', 'Tato část je jen pro správce.', 403); }
  schedule(actor) {
    const rows = actor?.role === 'admin'
      ? this.db.prepare(sessionQuery + ' ORDER BY s.start_at DESC LIMIT 500').all().reverse()
      : this.db.prepare(sessionQuery + " WHERE s.status='published' AND s.start_at>? ORDER BY s.start_at LIMIT 300").all(this.now());
    const owned = actor ? this.db.prepare("SELECT session_id,id FROM reservations WHERE user_id=? AND status='active'").all(actor.id) : [];
    return rows.map(s => ({ ...s, reservation_id: owned.find(b => b.session_id === s.id)?.id || null }));
  }
  catalogs(admin = false) {
    return {
      lessons: this.db.prepare(`SELECT * FROM lessons ${admin ? '' : 'WHERE active=1'} ORDER BY name`).all(),
      trainers: this.db.prepare(`SELECT * FROM trainers ${admin ? '' : 'WHERE active=1'} ORDER BY name`).all(),
      rooms: this.db.prepare('SELECT * FROM rooms ORDER BY name').all()
    };
  }
  reservations(actor, all = false) {
    if (all) this.admin(actor);
    return this.db.prepare(`SELECT b.*,u.name user_name,u.email,s.start_at,s.end_at,s.status session_status,
      l.name,l.kind,l.color,t.name trainer_name,r.name room_name,v.id visit_id
      FROM reservations b JOIN users u ON u.id=b.user_id JOIN class_sessions s ON s.id=b.session_id
      JOIN lessons l ON l.id=s.lesson_id JOIN trainers t ON t.id=s.trainer_id JOIN rooms r ON r.id=s.room_id
      LEFT JOIN visits v ON v.reservation_id=b.id ${all ? '' : 'WHERE b.user_id=?'} ORDER BY s.start_at DESC LIMIT 1000`)
      .all(...(all ? [] : [actor.id]));
  }
  visits(actor) {
    return this.db.prepare(`SELECT v.*,l.name lesson_name,l.kind FROM visits v
      LEFT JOIN reservations b ON b.id=v.reservation_id LEFT JOIN class_sessions s ON s.id=b.session_id
      LEFT JOIN lessons l ON l.id=s.lesson_id WHERE v.user_id=? ORDER BY v.visited_at DESC LIMIT 500`).all(actor.id);
  }
  book(actor, sessionId, requestedUserId) {
    return transaction(this.db, () => {
      actor = this.account(actor.id);
      const userId = requestedUserId ?? actor.id;
      if (userId !== actor.id) this.admin(actor);
      this.account(userId);
      const s = this.db.prepare('SELECT * FROM class_sessions WHERE id=?').get(sessionId);
      requireValue(s && s.status === 'published' && s.start_at > this.now(), 'Termín již nelze rezervovat.', 409);
      const existing = this.db.prepare("SELECT * FROM reservations WHERE user_id=? AND session_id=? AND status='active'").get(userId, sessionId);
      if (existing) return { id: existing.id, existing: true };
      const count = this.db.prepare("SELECT COUNT(*) n FROM reservations WHERE session_id=? AND status='active'").get(sessionId).n;
      requireValue(count < s.capacity, 'Tento termín je již plně obsazený.', 409);
      const result = this.db.prepare('INSERT INTO reservations(user_id,session_id,created_at) VALUES(?,?,?)').run(userId, sessionId, this.now());
      if (actor.role === 'admin') this.audit(actor, 'create', 'reservation', result.lastInsertRowid, { userId, sessionId });
      return { id: Number(result.lastInsertRowid), existing: false };
    });
  }
  cancel(actor, id) {
    return transaction(this.db, () => {
      actor = this.account(actor.id);
      const b = this.db.prepare('SELECT b.*,s.start_at FROM reservations b JOIN class_sessions s ON s.id=b.session_id WHERE b.id=?').get(id);
      requireValue(b && (b.user_id === actor.id || actor.role === 'admin'), 'Rezervace nebyla nalezena.', 404);
      if (b.status === 'cancelled') return;
      requireValue(!this.db.prepare('SELECT id FROM visits WHERE reservation_id=?').get(id), 'U absolvované rezervace nelze provést storno.', 409);
      requireValue(actor.role === 'admin' || this.now() <= b.start_at - 2 * 3600000, 'Rezervaci lze zrušit nejpozději dvě hodiny před začátkem.', 409);
      this.db.prepare("UPDATE reservations SET status='cancelled',cancelled_at=?,cancelled_by=? WHERE id=?").run(this.now(), actor.id, id);
      if (actor.role === 'admin') this.audit(actor, 'cancel', 'reservation', id);
    });
  }
  saveCatalog(actor, entity, id, input) {
    this.admin(actor);
    return transaction(this.db, () => {
      const active = input.active === undefined ? 1 : integer(input.active, 'Aktivita', 0, 1);
      const name = text(input.name, 'Název', 100);
      let columns, values;
      if (entity === 'lessons') {
        const kind = input.kind;
        requireValue(['group','personal'].includes(kind), 'Vyberte typ lekce.');
        requireValue(['purple','green','orange','blue'].includes(input.color), 'Vyberte barvu.');
        columns = ['name','description','kind','duration','color','active'];
        values = [name,text(input.description ?? '', 'Popis', 2000, 0),kind,integer(input.duration,'Délka',15,240),input.color,active];
      } else if (entity === 'trainers') {
        columns=['name','bio','specialty','active'];
        values=[name,text(input.bio ?? '', 'Profil', 1500, 0),text(input.specialty ?? '', 'Specializace', 100, 0),active];
      } else if (entity === 'rooms') {
        columns=['name','capacity']; values=[name,integer(input.capacity,'Kapacita',1,500)];
        if (id) requireValue(!this.db.prepare("SELECT id FROM class_sessions WHERE room_id=? AND end_at>? AND status!='cancelled' AND capacity>?").get(id,this.now(),values[1]), 'Budoucí termín má vyšší kapacitu. Nejdřív upravte jeho kapacitu.', 409);
      } else throw new AppError(404, 'Neznámá evidence.');
      // entity and column names come exclusively from the allowlist above.
      if (id) {
        requireValue(this.db.prepare(`SELECT id FROM ${entity} WHERE id=?`).get(id),'Záznam neexistuje.',404);
        this.db.prepare(`UPDATE ${entity} SET ${columns.map(c=>`${c}=?`).join(',')} WHERE id=?`).run(...values,id);
      } else id = Number(this.db.prepare(`INSERT INTO ${entity}(${columns.join(',')}) VALUES(${values.map(()=>'?').join(',')})`).run(...values).lastInsertRowid);
      this.audit(actor, 'save', entity, id, { name }); return { id };
    });
  }
  saveSession(actor, id, input) {
    this.admin(actor);
    return transaction(this.db, () => {
      const old = id ? this.db.prepare('SELECT * FROM class_sessions WHERE id=?').get(id) : null;
      if (id) requireValue(old, 'Termín neexistuje.', 404);
      const lessonId=integer(input.lesson_id,'Lekce'),trainerId=integer(input.trainer_id,'Trenér'),roomId=integer(input.room_id,'Sál');
      const start=integer(input.start_at,'Začátek',1,8640000000000000),end=integer(input.end_at,'Konec',1,8640000000000000);
      const capacity=integer(input.capacity,'Kapacita',1,500),status=input.status;
      requireValue(['draft','published','cancelled'].includes(status),'Vyberte stav termínu.');
      requireValue(!old || old.status !== 'cancelled','Zrušený termín se neobnovuje. Vytvořte nový.',409);
      requireValue(end>start && end-start<=8*3600000,'Délka termínu musí být větší než nula a nejvýše 8 hodin.');
      requireValue(start > this.now(), 'Nový nebo upravovaný termín musí být v budoucnosti.');
      const lesson=this.db.prepare('SELECT * FROM lessons WHERE id=?').get(lessonId);
      const trainer=this.db.prepare('SELECT * FROM trainers WHERE id=?').get(trainerId);
      const room=this.db.prepare('SELECT * FROM rooms WHERE id=?').get(roomId);
      requireValue(lesson?.active && trainer?.active && room,'Vyberte aktivní lekci, trenéra a existující sál.');
      requireValue(capacity<=room.capacity,'Kapacita nesmí překročit kapacitu sálu.');
      requireValue(lesson.kind !== 'personal' || capacity===1,'Osobní trénink má právě jedno místo.');
      if (old && old.status==='published') requireValue(status!=='draft','Publikovaný termín nelze skrýt jako koncept.',409);
      if (status!=='cancelled') {
        const collision=this.db.prepare(`SELECT id FROM class_sessions WHERE id!=? AND status!='cancelled'
          AND (room_id=? OR trainer_id=?) AND start_at<? AND end_at>?`).get(id||0,roomId,trainerId,end,start);
        requireValue(!collision,'V tomto čase už je sál nebo trenér obsazený.',409);
      }
      if (old && status!=='cancelled') {
        const booked=this.db.prepare("SELECT COUNT(*) n FROM reservations WHERE session_id=? AND status='active'").get(id).n;
        requireValue(capacity>=booked,'Kapacitu nelze snížit pod počet rezervací.',409);
      }
      if (old && status==='cancelled') this.db.prepare("UPDATE reservations SET status='cancelled',cancelled_at=?,cancelled_by=? WHERE session_id=? AND status='active'").run(this.now(),actor.id,id);
      if (id) this.db.prepare('UPDATE class_sessions SET lesson_id=?,trainer_id=?,room_id=?,start_at=?,end_at=?,capacity=?,status=? WHERE id=?').run(lessonId,trainerId,roomId,start,end,capacity,status,id);
      else id=Number(this.db.prepare('INSERT INTO class_sessions(lesson_id,trainer_id,room_id,start_at,end_at,capacity,status) VALUES(?,?,?,?,?,?,?)').run(lessonId,trainerId,roomId,start,end,capacity,status).lastInsertRowid);
      this.audit(actor,'save','session',id,{before:old,after:{lessonId,trainerId,roomId,start,end,capacity,status},notice:'Při přesunu termínu informujte klienty. E-maily se neposílají.'});
      return {id};
    });
  }
  saveUser(actor,id,input) {
    this.admin(actor);
    return transaction(this.db,()=>{
      const u=this.user(id);requireValue(u,'Účet neexistuje.',404);
      const name=text(input.name,'Jméno',100),active=integer(input.active,'Aktivita',0,1),role=input.role;
      requireValue(['client','admin'].includes(role),'Vyberte oprávnění.');
      if(u.role==='admin' && (role!=='admin'||!active)) {
        requireValue(this.db.prepare("SELECT COUNT(*) n FROM users WHERE role='admin' AND active=1 AND id!=?").get(id).n>0,'Posledního aktivního správce nelze odebrat.',409);
      }
      this.db.prepare('UPDATE users SET name=?,active=?,role=? WHERE id=?').run(name,active,role,id);
      if(!active||u.role!==role) this.db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(id);
      this.audit(actor,'update','user',id,{name,active,role});
    });
  }
  recordVisit(actor,input) {
    this.admin(actor);
    return transaction(this.db,()=>{
      const userId=integer(input.user_id,'Klient');this.account(userId);
      const reservationId=input.reservation_id ? integer(input.reservation_id,'Rezervace') : null;
      let time=this.now();
      if(reservationId) {
        const b=this.db.prepare('SELECT b.*,s.start_at,s.end_at FROM reservations b JOIN class_sessions s ON s.id=b.session_id WHERE b.id=?').get(reservationId);
        requireValue(b?.user_id===userId&&b.status==='active','Vyberte aktivní rezervaci tohoto klienta.');
        requireValue(this.now()>=b.start_at-30*60000,'Účast lze potvrdit nejdřív 30 minut před začátkem.',409);
        const existing=this.db.prepare('SELECT id FROM visits WHERE reservation_id=?').get(reservationId);
        if(existing) return {id:existing.id,existing:true};
        time=b.start_at;
      }
      const note=text(input.note??'','Poznámka',300,0);
      const id=Number(this.db.prepare('INSERT INTO visits(user_id,reservation_id,visited_at,recorded_by,note) VALUES(?,?,?,?,?)').run(userId,reservationId,time,actor.id,note).lastInsertRowid);
      this.audit(actor,'create','visit',id,{userId,reservationId});return {id};
    });
  }
}
