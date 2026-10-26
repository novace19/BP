import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backup } from 'node:sqlite';
import { openDatabase } from '../src/db.js';
import { populate } from './fixtures.js';

test('zálohu lze znovu otevřít se zachovanými daty a referenční integritou',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'fitness-backup-'));
  let source,restored;
  try {
    source=openDatabase(join(dir,'source.sqlite'));populate(source);
    await backup(source,join(dir,'backup.sqlite'));
    source.close();source=null;restored=openDatabase(join(dir,'backup.sqlite'));
    assert.equal(restored.prepare('SELECT COUNT(*) n FROM users').get().n,3);
    assert.equal(restored.prepare('PRAGMA user_version').get().user_version,1);
    assert.deepEqual(restored.prepare('PRAGMA foreign_key_check').all(),[]);
  } finally {source?.close();restored?.close();rmSync(dir,{recursive:true,force:true});}
});
