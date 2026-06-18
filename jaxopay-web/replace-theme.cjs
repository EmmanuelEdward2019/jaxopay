const fs = require('fs');
const file = 'src/pages/dashboard/InstantSwap.jsx';
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  { from: /bg-\[\#0b0e11\]/g, to: 'bg-background' },
  { from: /bg-\[\#161a1f\]/g, to: 'bg-card' },
  { from: /border-\[\#2b3139\]/g, to: 'border-border' },
  { from: /text-\[\#848e9c\]/g, to: 'text-muted-foreground' },
  { from: /text-white/g, to: 'text-gray-900 dark:text-white' },
  { from: /hover:bg-\[\#363d47\]/g, to: 'hover:bg-muted dark:hover:bg-muted' },
  { from: /hover:bg-\[\#2b3139\]/g, to: 'hover:bg-muted dark:hover:bg-muted' },
  { from: /bg-\[\#2b3139\]/g, to: 'bg-muted' },
  { from: /placeholder-\[\#5e6673\]/g, to: 'placeholder-muted-foreground' },
  { from: /border-\[\#0b0e11\]/g, to: 'border-background' },
  { from: /text-\[\#0b0e11\]/g, to: 'text-gray-900 dark:text-gray-900' },
  { from: /placeholder-\[\#848e9c\]/g, to: 'placeholder-muted-foreground' },
  { from: /hover:text-\[\#f0b90b\]/g, to: 'hover:text-primary' },
  { from: /border-\[\#f0b90b\]\/40/g, to: 'border-primary/40' },
  { from: /bg-\[\#f0b90b\]/g, to: 'bg-primary' },
  { from: /text-\[\#f0b90b\]/g, to: 'text-primary' },
  { from: /bg-\[\#1e2329\]/g, to: 'bg-muted' },
  { from: /hover:bg-\[\#1e2329\]/g, to: 'hover:bg-muted' },
  { from: /bg-\[\#f0b90b\]\/10/g, to: 'bg-primary/10' },
  // specific fix for where text-white was already replaced in buttons:
  { from: /bg-\[\#0ecb81\] text-gray-900 dark:text-white/g, to: 'bg-[#0ecb81] text-white' },
  { from: /bg-primary text-gray-900 dark:text-gray-900/g, to: 'bg-primary text-primary-foreground' },
];

for (const {from, to} of replacements) {
  content = content.replace(from, to);
}

fs.writeFileSync(file, content);
console.log('Done!');
