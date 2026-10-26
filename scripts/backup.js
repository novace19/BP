import { backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { openDatabase } from '../src/db.js';
mkdirSync('./backups',{recursive:true});
const db=openDatabase();const path=`./backups/fitness-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`;
await backup(db,path);db.close();console.log(`Záloha: ${path}`);
