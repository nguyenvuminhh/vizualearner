import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

export async function needsInstall(root) {
  const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
  const lock=JSON.parse(await fs.readFile(path.join(root,'package-lock.json'),'utf8'));
  const runtime=Object.entries(lock.packages||{}).filter(([name,entry])=>name.startsWith('node_modules/')&&!entry.dev&&!entry.optional);
  for(const name of Object.keys(pkg.dependencies||{}))if(!lock.packages?.[`node_modules/${name}`])return true;
  for(const [name,entry] of runtime) {
    let installed;
    try {installed=JSON.parse(await fs.readFile(path.join(root,name,'package.json'),'utf8'));}
    catch(error) {if(error.code==='ENOENT')return true;throw error;}
    if(installed.version!==entry.version)return true;
  }
  return false;
}

export async function launch(root=fileURLToPath(new URL('../',import.meta.url))) {
  if(Number(process.versions.node.split('.')[0])<22)throw new Error('Node.js 22 or later is required. Install it from https://nodejs.org/.');
  if(await needsInstall(root)) {
    console.log('First run: installing locked runtime dependencies. An internet connection is required.');
    const executable=process.env.npm_execpath?process.execPath:'npm';
    const args=[...(process.env.npm_execpath?[process.env.npm_execpath]:[]),'ci','--omit=dev','--no-fund','--no-audit'];
    await new Promise((resolve,reject)=>{
      const child=spawn(executable,args,{cwd:root,stdio:'inherit'});
      child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error('Dependency installation failed. Check your connection, run npm ci, and try npm start again.')));
    });
  }
  const {start}=await import('../server.js');
  const running=await start();
  console.log(`\n  vizualearner → ${running.url}\n  Open this address in your browser. Keep this terminal open; Ctrl+C stops the app.\n`);
  let closing=false;
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{
    if(closing)return;closing=true;
    try {await running.close();process.exit(0);}catch(error){console.error(error.message);process.exit(1);}
  });
  return running;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))launch().catch(error=>{console.error('\n'+error.message);process.exitCode=1;});
