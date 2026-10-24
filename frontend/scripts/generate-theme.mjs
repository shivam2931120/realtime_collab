import { readFileSync, writeFileSync } from 'node:fs';
const tokens = JSON.parse(readFileSync(new URL('../design-tokens.json', import.meta.url), 'utf8'));
const rgb = (hex) => hex.slice(1).match(/../g).map(value => parseInt(value, 16)).join(' ');
const colors = Object.entries(tokens.colors).flatMap(([name, value]) => [`  --color-${name}: ${value};`, `  --rgb-${name}: ${rgb(value)};`]);
const radius = Object.entries(tokens.radius).map(([name, value]) => `  --radius-${name}: ${value};`);
const fonts = Object.entries(tokens.font).map(([name, value]) => `  --font-${name}: ${value};`);
writeFileSync(new URL('../public/theme.css', import.meta.url), `/* Generated from design-tokens.json. Run npm run theme after editing tokens. */\n:root {\n  color-scheme: dark;\n${[...colors, ...radius, ...fonts].join('\n')}\n}\n`);
