const fs = require('fs');
const file = 'src/pages/dashboard/InstantSwap.jsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  { from: /bg-\[\#0ecb81\]/g, to: 'bg-success' },
  { from: /text-\[\#0ecb81\]/g, to: 'text-success' },
  { from: /border-\[\#0ecb81\]/g, to: 'border-success' },
  { from: /bg-\[\#f6465d\]/g, to: 'bg-danger' },
  { from: /text-\[\#f6465d\]/g, to: 'text-danger' },
  { from: /border-\[\#f6465d\]/g, to: 'border-danger' },
];

for (const {from, to} of replacements) {
  content = content.replace(from, to);
}

fs.writeFileSync(file, content);
console.log('Done replacing success/danger colors!');
