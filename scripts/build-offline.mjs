import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const files=[];
function collect(path='.') {
    for (const entry of readdirSync(path,{withFileTypes:true})) {
        const relative=path==='.'?entry.name:path+'/'+entry.name;
        if(entry.isDirectory() && ['assets','js','css','vendor','demo'].includes(entry.name) && path==='.' || entry.isDirectory() && path!=='.') collect(relative);
        else if(entry.isFile() && (/\.(html|js|css|svg|png|webmanifest)$/.test(relative)) && relative!=='sw.js' && !relative.startsWith('scripts/'))files.push(relative);
    }
}
collect();files.sort();
const hash=createHash('sha256');for(const file of files){hash.update(file);hash.update(readFileSync(file));}
const version=hash.digest('hex').slice(0,16);
const template=readFileSync('scripts/sw-template.js','utf8');
writeFileSync('sw.js',template.replace('__FLOW_VERSION__',version).replace('__FLOW_FILES__',JSON.stringify(files)));
console.log(`Prepared offline app shell ${version}. Only public app files are cached.`);
