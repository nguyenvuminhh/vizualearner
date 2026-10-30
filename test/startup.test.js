import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {needsInstall} from '../scripts/start.mjs';

test('fresh clones need installation; matching runtime dependencies do not; lockfile changes are detected',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vizualizer-startup-'));
 try{
  await fs.writeFile(path.join(root,'package.json'),JSON.stringify({dependencies:{express:'^5.1.0'}}));
  await fs.writeFile(path.join(root,'package-lock.json'),JSON.stringify({packages:{'node_modules/express':{version:'5.1.0'}}}));
  assert.equal(await needsInstall(root),true);
  await fs.mkdir(path.join(root,'node_modules/express'),{recursive:true});
  await fs.writeFile(path.join(root,'node_modules/express/package.json'),JSON.stringify({version:'5.1.0'}));
  assert.equal(await needsInstall(root),false);
  await fs.writeFile(path.join(root,'package-lock.json'),JSON.stringify({packages:{'node_modules/express':{version:'5.2.0'}}}));
  assert.equal(await needsInstall(root),true);
  await fs.writeFile(path.join(root,'package-lock.json'),JSON.stringify({packages:{'node_modules/express':{version:'5.1.0'},'node_modules/body-parser':{version:'2.2.0'}}}));
  assert.equal(await needsInstall(root),true,'Missing transitive dependencies need installation too');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
