import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openDatabase, transaction } from './db.js';
import { FitnessService, publicUser } from './service.js';
import { AppError, requireValue, text, integer, email, password, hashPassword, verifyPassword, token, digest } from './security.js';

const MAX_BODY = 32768;
async function jsonBody(req) {
  requireValue((req.headers['content-type'] || '').split(';')[0] === 'application/json','Požadavek musí obsahovat JSON.',415);
  return new Promise((resolve,reject)=>{
    let size=0; const chunks=[];
    req.on('data',chunk=>{size+=chunk.length;if(size>MAX_BODY) reject(new AppError(413,'Příliš velký požadavek.'));else chunks.push(chunk);});
    req.on('error',reject);
    req.on('end',()=>{try{const data=JSON.parse(Buffer.concat(chunks).toString());requireValue(data&&typeof data==='object'&&!Array.isArray(data),'Neplatný objekt.');resolve(data);}catch(e){reject(e instanceof AppError?e:new AppError(400,'Neplatný JSON.'));}});
  });
}

export async function createApp({ dbPath, clock = Date.now, origin = process.env.APP_ORIGIN, secureCookie = process.env.SECURE_COOKIE === '1' } = {}) {
  const db=openDatabase(dbPath), service=new FitnessService(db,clock);
  const dummyHash=await hashPassword(token());
  const attempts=new Map(); let requests=0;
  function rate(key,max,interval=15*60000) {
    const now=clock();let bucket=attempts.get(key);
    if(!bucket||bucket.until<now){bucket={until:now+interval,count:0};attempts.set(key,bucket);}
    requireValue(++bucket.count<=max,'Příliš mnoho pokusů. Zkuste to za chvíli.',429);
    if(attempts.size>10000) for(const [k,v] of attempts) if(v.until<now) attempts.delete(k);
    if(attempts.size>20000) attempts.delete(attempts.keys().next().value);
  }
  const server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const send=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
    try {
      const url=new URL(req.url,'http://localhost');
      if(!url.pathname.startsWith('/api/')) {
        requireValue(req.method==='GET'||req.method==='HEAD','Metoda není povolena.',405);
        const files={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css','/favicon.svg':'favicon.svg'};
        const name=files[url.pathname];requireValue(name,'Stránka nebyla nalezena.',404);
        const body=await readFile(new URL('../public/'+name,import.meta.url));
        res.writeHead(200,{'Content-Type':name.endsWith('css')?'text/css; charset=utf-8':name.endsWith('js')?'text/javascript; charset=utf-8':name.endsWith('svg')?'image/svg+xml':'text/html; charset=utf-8','Cache-Control':'no-cache'});
        res.end(req.method==='HEAD'?undefined:body);return;
      }
      rate('api:'+req.socket.remoteAddress,500,60000);
      if(++requests%100===0) db.prepare('DELETE FROM auth_sessions WHERE expires_at<?').run(clock());
      const raw=(req.headers.cookie||'').split(';').map(p=>p.trim()).find(p=>p.startsWith('fitness_session='))?.slice(16);
      let session=raw&&/^[a-f0-9]{64}$/.test(raw)?db.prepare('SELECT * FROM auth_sessions WHERE token_hash=? AND expires_at>?').get(digest(raw),clock()):null;
      function newSession(userId=null) {
        if(session) db.prepare('DELETE FROM auth_sessions WHERE token_hash=?').run(session.token_hash);
        const raw=token(),csrf=token(),expires=clock()+24*3600000;
        db.prepare('INSERT INTO auth_sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)').run(digest(raw),userId,csrf,expires);
        session={token_hash:digest(raw),user_id:userId,csrf,expires_at:expires};
        res.setHeader('Set-Cookie',`fitness_session=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secureCookie?'; Secure':''}`);
      }
      if(!session) newSession();
      const actor=session.user_id?service.user(session.user_id):null;
      const auth=()=>{requireValue(actor?.active,'Přihlaste se prosím.',401);return actor;};
      const admin=()=>{auth();service.admin(actor);};
      if(!['GET','HEAD'].includes(req.method)) {
        requireValue(req.headers['x-csrf-token']===session.csrf,'Platnost formuláře vypršela. Obnovte stránku.',403);
        const requestOrigin=req.headers.origin;
        const loopback=/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(req.headers.host||'');
        requireValue(!requestOrigin || (origin?requestOrigin===origin:loopback&&requestOrigin===`http://${req.headers.host}`),'Požadavek pochází z nepovoleného webu.',403);
      }
      const method=req.method,path=url.pathname;
      if(method==='GET'&&path==='/api/me') return send(200,{user:actor?.active?publicUser(actor):null,csrf:session.csrf,server_time:clock()});
      if(method==='POST'&&path==='/api/auth/register') {
        rate('register:'+req.socket.remoteAddress,8);
        const input=await jsonBody(req),name=text(input.name,'Jméno',100),mail=email(input.email),pass=password(input.password);
        requireValue(!db.prepare('SELECT id FROM users WHERE email=?').get(mail),'Účet s tímto e-mailem už existuje.',409);
        const hash=await hashPassword(pass);
        const id=transaction(db,()=>Number(db.prepare('INSERT INTO users(name,email,password_hash,created_at) VALUES(?,?,?,?)').run(name,mail,hash,clock()).lastInsertRowid));
        newSession(id);return send(201,{user:publicUser(service.user(id)),csrf:session.csrf});
      }
      if(method==='POST'&&path==='/api/auth/login') {
        const input=await jsonBody(req),mail=email(input.email);
        requireValue(typeof input.password==='string'&&input.password.length<=128,'Zadejte heslo.');
        rate('login:'+req.socket.remoteAddress,20);rate('account:'+digest(mail),15);
        const u=db.prepare('SELECT * FROM users WHERE email=?').get(mail);
        const valid=await verifyPassword(input.password,u?.password_hash||dummyHash);
        requireValue(valid&&u?.active,'Nesprávný e-mail nebo heslo.',401);
        // Recheck after asynchronous hashing; an admin may have disabled the account.
        requireValue(service.user(u.id)?.active,'Nesprávný e-mail nebo heslo.',401);
        newSession(u.id);return send(200,{user:publicUser(service.user(u.id)),csrf:session.csrf});
      }
      if(method==='POST'&&path==='/api/auth/logout') {newSession();return send(200,{csrf:session.csrf});}
      if(method==='GET'&&path==='/api/catalogs') return send(200,service.catalogs(actor?.active&&actor.role==='admin'));
      if(method==='GET'&&path==='/api/schedule') return send(200,service.schedule(actor?.active?actor:null));
      if(method==='GET'&&path==='/api/reservations') return send(200,service.reservations(auth()));
      if(method==='GET'&&path==='/api/visits') return send(200,service.visits(auth()));
      if(method==='POST'&&path==='/api/reservations') {
        auth();const input=await jsonBody(req);
        const result=service.book(actor,integer(input.session_id,'Termín'),input.user_id===undefined?undefined:integer(input.user_id,'Klient'));
        return send(result.existing?200:201,result);
      }
      let match=path.match(/^\/api\/reservations\/(\d+)\/cancel$/);
      if(method==='POST'&&match){service.cancel(auth(),Number(match[1]));return send(200,{ok:true});}
      if(method==='PATCH'&&path==='/api/profile') {
        auth();const input=await jsonBody(req),name=text(input.name,'Jméno',100);
        db.prepare('UPDATE users SET name=? WHERE id=?').run(name,actor.id);return send(200,{user:publicUser(service.user(actor.id))});
      }
      if(method==='POST'&&path==='/api/profile/password') {
        auth();rate('password:'+actor.id,8);const input=await jsonBody(req);
        requireValue(typeof input.current_password==='string'&&input.current_password.length<=128,'Zadejte původní heslo.');
        password(input.password);
        requireValue(await verifyPassword(input.current_password,actor.password_hash),'Původní heslo není správné.',400);
        const hash=await hashPassword(input.password);
        transaction(db,()=>{
          requireValue(service.account(actor.id).password_hash===actor.password_hash,'Heslo se mezitím změnilo. Přihlaste se znovu.',409);
          db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hash,actor.id);
          db.prepare('DELETE FROM auth_sessions WHERE user_id=?').run(actor.id);
        });
        newSession(actor.id);return send(200,{ok:true,csrf:session.csrf});
      }
      if(path.startsWith('/api/admin/')) {
        admin();
        if(method==='GET'&&path==='/api/admin/users') return send(200,db.prepare('SELECT id,name,email,role,active,created_at FROM users ORDER BY name LIMIT 1000').all());
        if(method==='GET'&&path==='/api/admin/reservations') return send(200,service.reservations(actor,true));
        if(method==='GET'&&path==='/api/admin/visits') return send(200,db.prepare('SELECT v.*,u.name user_name FROM visits v JOIN users u ON u.id=v.user_id ORDER BY visited_at DESC LIMIT 500').all());
        if(method==='GET'&&path==='/api/admin/audit') return send(200,db.prepare('SELECT a.*,u.name actor_name FROM audit a JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 100').all());
        if(method==='POST'&&path==='/api/admin/visits') return send(201,service.recordVisit(actor,await jsonBody(req)));
        match=path.match(/^\/api\/admin\/(lessons|trainers|rooms)(?:\/(\d+))?$/);
        if(match&&((method==='POST'&&!match[2])||(method==='PUT'&&match[2]))) return send(match[2]?200:201,service.saveCatalog(actor,match[1],match[2]?Number(match[2]):null,await jsonBody(req)));
        match=path.match(/^\/api\/admin\/sessions(?:\/(\d+))?$/);
        if(match&&((method==='POST'&&!match[1])||(method==='PUT'&&match[1]))) return send(match[1]?200:201,service.saveSession(actor,match[1]?Number(match[1]):null,await jsonBody(req)));
        match=path.match(/^\/api\/admin\/users\/(\d+)$/);
        if(method==='PUT'&&match){service.saveUser(actor,Number(match[1]),await jsonBody(req));return send(200,{ok:true});}
      }
      throw new AppError(404,'Požadovaná funkce neexistuje.');
    } catch(e) {
      if(res.headersSent){res.end();return;}
      const dbConflict=e.message?.includes('UNIQUE constraint failed');
      if(e instanceof AppError) send(e.status,{error:e.message});
      else if(dbConflict) send(409,{error:'Takový záznam už existuje. Obnovte přehled.'});
      else if(e.message?.includes('database is locked')) send(503,{error:'Databáze je zaneprázdněná. Zkuste požadavek zopakovat.'});
      else {const event=token().slice(0,10);console.error(`Chyba ${event}: ${e.name}: ${e.message}`);send(500,{error:`Operaci nelze dokončit. Kód události: ${event}`});}
    }
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  return {server,db,service};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
  const {server,db}=await createApp();
  server.listen(port,host,()=>console.log(`Fitness centrum běží na http://localhost:${port}\nPrvní demo data: npm run seed (v jiném terminálu před spuštěním).`));
  const stop=()=>{server.close(()=>{db.close();process.exit(0);});};
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
