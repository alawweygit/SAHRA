const fs = require("fs");
const html = fs.readFileSync("index.html","utf8");
const js = ["main","host","controller","fx"].map(f=>fs.readFileSync("js/"+f+".js","utf8")).join("\n");

const htmlIds = new Set([...html.matchAll(/\bid="([A-Za-z0-9_-]+)"/g)].map(m=>m[1]));
const dynIds = new Set([...js.matchAll(/\bid="([A-Za-z0-9_-]+)"/g)].map(m=>m[1]));
const refs = [...js.matchAll(/\$\(['"`]#([A-Za-z0-9_-]+)['"`]\)/g)].map(m=>m[1]);

const missing = [...new Set(refs)].filter(id => !htmlIds.has(id) && !dynIds.has(id));
const inDyn = [...new Set(refs)].filter(id => !htmlIds.has(id) && dynIds.has(id));

console.log("Total $() ID refs:", new Set(refs).size);
console.log("In static HTML:", [...new Set(refs)].filter(id=>htmlIds.has(id)).length);
console.log("In JS templates:", inDyn.join(", ") || "none");
console.log("MISSING:", missing.join(", ") || "none ✓");
console.log("\nAll HTML IDs defined:", [...htmlIds].join(", "));
