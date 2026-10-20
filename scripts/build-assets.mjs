import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';

// A fresh page must not combine new code with an older browser HTTP cache.
for (const file of readdirSync('.').filter(name=>name.endsWith('.html'))) {
    const html=readFileSync(file,'utf8').replace(/(src|href)="((?:js|css|assets|vendor)\/[^"?#]+|manifest\.webmanifest)(?:\?v=[a-f0-9]+)?"/g,(_,attribute,path)=>{
        const version=createHash('sha256').update(readFileSync(path)).digest('hex').slice(0,16);
        return `${attribute}="${path}?v=${version}"`;
    });
    writeFileSync(file,html);
}
console.log('Versioned public assets to prevent mixed cached releases.');
