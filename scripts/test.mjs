import {readdirSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
function discover(directory) {
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const path=join(directory,entry.name);
    return entry.isDirectory()?discover(path):/\.test\.(?:ts|mjs)$/.test(entry.name)?[path]:[];
  });
}
const files=[...discover('src'),...discover('tests')].sort();
if(!files.length)throw new Error('No application tests discovered');
console.log(`Running ${files.length} test files (bounded concurrency; isolated Vite caches).`);
const result=spawnSync(process.execPath,['--experimental-strip-types','--test','--test-concurrency=2','--test-timeout=120000',...process.argv.slice(2),...files],{stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
