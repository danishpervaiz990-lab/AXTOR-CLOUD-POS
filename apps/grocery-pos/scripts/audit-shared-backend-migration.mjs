import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const apiRoot = path.join(root, "app", "api");
const failures = [];
const inventory = [];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function relative(file) {
  return path.relative(root, file).split(path.sep).join("/");
}

function fail(file, reason) {
  failures.push({ file: relative(file), reason });
}

const routeFiles = walk(apiRoot).filter((file) => file.endsWith("route.ts"));
for (const file of routeFiles) {
  const source = fs.readFileSync(file, "utf8");
  const rel = relative(file);
  const isGroceryModule = rel.startsWith("app/api/grocery/");
  const usesBridge = /bridgeSharedRoute|sharedBackendRequest|groceryApi\./.test(source);

  inventory.push({ file: rel, usesBridge });

  const forbiddenPatterns = [
    [/@\/lib\/db/, "imports the local Prisma database client"],
    [/@prisma\/client/, "imports Prisma runtime types/client"],
    [/\bgetDatabase\s*\(/, "opens the local Grocery database"],
    [/@\/server\/tenancy\//, "uses legacy local tenant context"],
    [/@\/server\/permissions\//, "uses legacy local permission middleware"],
    [/@\/server\/auth\//, "uses legacy local authentication/session middleware"]
  ];

  for (const [pattern, reason] of forbiddenPatterns) {
    if (pattern.test(source)) fail(file, reason);
  }

  if (isGroceryModule && !usesBridge) {
    fail(file, "Grocery module route is not bridged to the existing shared backend");
  }
}

const runtimeFiles = walk(root).filter((file) => {
  const rel = relative(file);
  return !rel.startsWith("node_modules/") && !rel.startsWith(".next/") && !rel.startsWith("prisma/") && !rel.startsWith("scripts/");
});
for (const file of runtimeFiles) {
  if (!/\.(?:ts|tsx|js|mjs|json|md)$/.test(file)) continue;
  const source = fs.readFileSync(file, "utf8");
  if (/GROCERY_DATABASE_URL/.test(source)) fail(file, "still requires a dedicated Grocery database URL");
  if (/release:railway|start:railway|GROCERY_RAILWAY_ORIGIN|axtor-grocery-pos-production\.up\.railway\.app/.test(source)) {
    fail(file, "still contains dedicated Grocery Railway deployment assumptions");
  }
}

const railwayPath = path.join(root, "railway.toml");
if (fs.existsSync(railwayPath)) fail(railwayPath, "dedicated Grocery Railway configuration still exists");

console.log(JSON.stringify({ routeCount: inventory.length, inventory, failures }, null, 2));
if (failures.length) {
  console.error(`Shared-backend migration audit failed with ${failures.length} blocker(s).`);
  process.exit(1);
}
console.log(`PASS: ${inventory.length} Grocery API routes are database-free and use the existing shared backend.`);
