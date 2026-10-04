const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const page = path.join(root, 'index.html');
const html = fs.readFileSync(page, 'utf8').replace(/(src|href)="((?:fire-calculator|fire-plan|app)\.js|styles\.css)(?:\?v=[^"]*)?"/g, (_, attr, file) => {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex').slice(0, 12);
    return `${attr}="${file}?v=${hash}"`;
});
fs.writeFileSync(page, html);
