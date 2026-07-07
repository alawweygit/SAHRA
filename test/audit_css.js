const fs = require("fs");
const css = fs.readFileSync("css/style.css","utf8");
const html = fs.readFileSync("index.html","utf8");
const js = ["main","host","controller","fx"].map(f=>fs.readFileSync("js/"+f+".js","utf8")).join("\n");

// Extract all class names used in CSS
const cssClasses = new Set([...css.matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]+)(?=[^{]*\{)/g)].map(m=>m[1]));

// Extract all class names defined in HTML (static) and JS (dynamic templates)
const defined = new Set([
  ...[...html.matchAll(/class="([^"]+)"/g)].flatMap(m=>m[1].split(/\s+/)),
  ...[...js.matchAll(/className[=:]\s*['"`]([^'"`]+)/g)].flatMap(m=>m[1].split(/\s+/)),
  ...[...js.matchAll(/classList\.(?:add|toggle)\(['"]([^'"]+)['"]/g)].map(m=>m[1]),
  ...[...js.matchAll(/class="([^"]+)"/g)].flatMap(m=>m[1].split(/\s+/)),
]);

// Filter CSS classes that never appear in HTML or JS (likely dead CSS or a typo)
// Exclude pseudo-class fragments, animation names, state classes added dynamically
const IGNORE = new Set(["go","show","active","hidden","dim","done","picked","flipped","revealed","diss-winner",
  "q-correct","q-dim","talking","scene-in","shaking","shake","danger","shake","ar","wide","feature",
  "pick-a","pick-b","big"]);

const orphanCss = [...cssClasses].filter(c => !defined.has(c) && !IGNORE.has(c) && !c.startsWith("lt") && c.length > 1);
console.log("CSS classes in stylesheet:", cssClasses.size);
console.log("Classes defined in HTML/JS:", defined.size);
console.log("Potentially orphaned CSS rules:", orphanCss.length ? orphanCss.slice(0,20).join(", ") : "none ✓");

// Check RTL rules exist for key asymmetric elements
const rtlChecks = ["[dir=\"rtl\"] #host", "[dir=\"rtl\"] .score-row", "[dir=\"rtl\"] .speech", "body.ar"];
for (const rule of rtlChecks) {
  const found = css.includes(rule);
  console.log(`RTL rule '${rule}': ${found?"✓":"MISSING ✗"}`);
}

// Check animation keyframes are all referenced
const keyframeNames = new Set([...css.matchAll(/@keyframes\s+([a-zA-Z0-9-]+)/g)].map(m=>m[1]));
const animRefs = new Set([...css.matchAll(/animation(?:-name)?\s*:[^;]*?([a-zA-Z][a-zA-Z0-9-]+)/g)].map(m=>m[1]));
const unreferenced = [...keyframeNames].filter(k=>!animRefs.has(k));
console.log("\nKeyframes defined:", keyframeNames.size);
console.log("Unreferenced keyframes:", unreferenced.length ? unreferenced.join(", ") : "none ✓");

// Check CSS vars are all defined in :root
const usedVars = new Set([...css.matchAll(/var\(--([a-zA-Z0-9-]+)/g)].map(m=>m[1]));
const definedVars = new Set([...css.matchAll(/--([a-zA-Z0-9-]+)\s*:/g)].map(m=>m[1]));
const missingVars = [...usedVars].filter(v=>!definedVars.has(v));
console.log("\nCSS vars used:", usedVars.size, "| defined:", definedVars.size);
console.log("Undefined vars:", missingVars.length ? missingVars.join(", ") : "none ✓");
