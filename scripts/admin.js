import { openDatabase } from '../src/db.js';
import { email, text, password, hashPassword } from '../src/security.js';
// Supply secrets through the environment, never as command-line arguments or committed files.
const mail=email(process.env.ADMIN_EMAIL),name=text(process.env.ADMIN_NAME||'Správce','Jméno',100);
const secret=password(process.env.ADMIN_PASSWORD);
const db=openDatabase();
if(db.prepare('SELECT id FROM users WHERE email=?').get(mail)) {db.close();throw new Error('E-mail již existuje. Správce může oprávnění upravit v administraci.');}
const hash=await hashPassword(secret);
db.prepare("INSERT INTO users(name,email,password_hash,role,created_at) VALUES(?,?,?,'admin',?)").run(name,mail,hash,Date.now());
db.close();console.log(`Správce ${mail} byl vytvořen.`);
