import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
mkdirSync('demo', { recursive: true });
for (const file of readdirSync('.').filter(f=>f.endsWith('.html') && !['offline.html','login.html'].includes(f))) {
    const source=readFileSync(file,'utf8').replace(/(src|href)="((?:js|css|assets|vendor)\/[^"#]+|manifest\.webmanifest(?:\?[^"#]*)?)"/g,'$1="../$2"');
    writeFileSync('demo/'+file,source);
}
console.log('Generated isolated demo pages.');
