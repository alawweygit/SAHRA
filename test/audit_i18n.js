const fs = require("fs");
global.localStorage = { getItem: ()=>null, setItem: ()=>{} };
const i18nSrc = fs.readFileSync("js/i18n.js","utf8");
// wrap in IIFE and expose
const wrapper = i18nSrc.replace("const I18N =","global.I18N =").replace("let LANG","global.LANG");
eval(wrapper);

const src = ["main","host","controller"].map(f=>fs.readFileSync("js/"+f+".js","utf8")).join("\n");
const refs = [...new Set([...src.matchAll(/\bt\(['"]([a-zA-Z0-9_]+)['"]\)/g)].map(m=>m[1]))];

const missingEn = refs.filter(k => global.I18N.en[k] === undefined);
const missingAr = refs.filter(k => global.I18N.ar[k] === undefined);
console.log("t() key refs:", refs.length);
console.log("Missing EN:", missingEn.join(", ") || "none ✓");
console.log("Missing AR:", missingAr.join(", ") || "none ✓");

const modeKeys = ["bluff","wyr","interrogation","diss","quiz"];
for (const lang of ["en","ar"]) {
  for (const obj of ["mode_names","mode_taglines","mode_rules"]) {
    const missing = modeKeys.filter(k => !global.I18N[lang][obj] || !global.I18N[lang][obj][k]);
    if (missing.length) console.log(`MISSING ${lang}.${obj}:`, missing.join(", "));
  }
}
console.log("mode sub-objects: ✓");

const regionKeys = ["mena","weur","asia","africa","global"];
for (const lang of ["en","ar"]) {
  const missing = regionKeys.filter(k => !global.I18N[lang]["region_"+k]);
  if (missing.length) console.log(`MISSING ${lang} region_keys:`, missing.join(", "));
}
console.log("region keys: ✓");

const html = fs.readFileSync("index.html","utf8");
const htmlKeys = [...new Set([...html.matchAll(/data-i18n="([a-zA-Z0-9_]+)"/g)].map(m=>m[1]))];
const missingHtmlEn = htmlKeys.filter(k => global.I18N.en[k] === undefined);
const missingHtmlAr = htmlKeys.filter(k => global.I18N.ar[k] === undefined);
console.log("\nHTML data-i18n keys:", htmlKeys.length);
console.log("Missing EN:", missingHtmlEn.join(", ") || "none ✓");
console.log("Missing AR:", missingHtmlAr.join(", ") || "none ✓");
