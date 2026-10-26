import { parentPort, workerData } from 'node:worker_threads';
import { openDatabase } from '../src/db.js';
import { FitnessService } from '../src/service.js';
import { NOW } from './fixtures.js';
const db=openDatabase(workerData.path),service=new FitnessService(db,()=>NOW);
parentPort.postMessage({ready:true});
const barrier=new Int32Array(workerData.barrier);
Atomics.wait(barrier,0,0);
try{service.book(service.user(workerData.userId),1);parentPort.postMessage({ok:true});}
catch(e){parentPort.postMessage({ok:false,error:e.message});}
finally{db.close();}
