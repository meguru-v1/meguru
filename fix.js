import fs from 'fs';
let content = fs.readFileSync('src/lib/places.ts', 'utf8');
content = content.replace('await fetchData(currentRadius, ultimateFallbackTypes);\', 'await fetchData(currentRadius, ultimateFallbackTypes);');
fs.writeFileSync('src/lib/places.ts', content);
console.log('Fixed the backtick typo!');
