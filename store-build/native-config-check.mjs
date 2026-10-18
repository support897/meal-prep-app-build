/* Meal Prep native config check (app v39, the native door fix).
   Asserts the SOURCE-LEVEL forms of the four proof reads Store
   Review re-runs on the IPA (recipe of record, NATIVE-DOORS-RECIPE):
     1 the plist ships inside the .app
     2 the OAuth scheme stands in the shipped Info.plist
     3 applesignin stands in the binary and the provisioning profile
     4 the plugin branch stands in the shipped code (not popup only)
   The console half (the app registration + the plist file itself)
   lands from the desk; until the file exists here, read 1 prints
   PLIST: PENDING for the file and still asserts its bundle wiring.
   Read 3's profile half is a portal act owed at dispatch (see
   NATIVE-DOORS.md); it prints as OWED, never as a pass.

   Run: node native-config-check.mjs   (from store-build/)
   Exit 0 = every present-tense assertion holds. Exit 1 = a FAIL. */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");
let fails = 0;
function check(name, cond) {
  console.log((cond ? "PASS " : "FAIL ") + name);
  if (!cond) fails++;
}

const pbx = read("ios/App/App.xcodeproj/project.pbxproj");
const count = (hay, needle) => hay.split(needle).length - 1;

/* ---- READ 1: the plist ships inside the .app -------------------- */
check("READ 1 pbxproj carries the GoogleService-Info.plist file reference and group child", count(pbx, "AA10000500000000000000A5 /* GoogleService-Info.plist */") >= 2);
check("READ 1 pbxproj carries the plist build file in the Resources phase", count(pbx, "AA10000400000000000000A4 /* GoogleService-Info.plist in Resources */") >= 2);
const plistPath = join(root, "ios/App/App/GoogleService-Info.plist");
if (!existsSync(plistPath)) {
  console.log("PLIST: PENDING (GoogleService-Info.plist not in ios/App/App yet; the desk lands it from the console leg)");
} else {
  const plist = read("ios/App/App/GoogleService-Info.plist");
  const field = (key) => {
    const m = plist.match(new RegExp("<key>" + key + "</key>\\s*<string>([^<]+)</string>"));
    return m ? m[1] : null;
  };
  check("READ 1 plist carries BUNDLE_ID com.ilseplacencia.mealprep", field("BUNDLE_ID") === "com.ilseplacencia.mealprep");
  check("READ 1 plist carries CLIENT_ID", !!field("CLIENT_ID"));
  check("READ 1 plist carries REVERSED_CLIENT_ID", !!field("REVERSED_CLIENT_ID"));
  check("READ 1 plist carries PROJECT_ID meal-prep-c8bf7", field("PROJECT_ID") === "meal-prep-c8bf7");
}

/* ---- READ 2: the OAuth scheme in the shipped Info.plist --------- */
const info = read("ios/App/App/Info.plist");
check("READ 2 Info.plist carries a CFBundleURLTypes URL scheme entry", info.includes("CFBundleURLTypes") && info.includes("CFBundleURLSchemes"));
if (info.includes("MEALPREP_REVERSED_CLIENT_ID")) {
  console.log("NOTE READ 2 scheme still carries the MEALPREP_REVERSED_CLIENT_ID placeholder; the desk swaps in the plist's REVERSED_CLIENT_ID value when the plist lands");
}

/* ---- READ 3: applesignin in binary and profile ------------------ */
const ent = read("ios/App/App/App.entitlements");
check("READ 3 App.entitlements carries com.apple.developer.applesignin = Default", ent.includes("com.apple.developer.applesignin") && ent.includes("<string>Default</string>"));
check("READ 3 project.pbxproj wires CODE_SIGN_ENTITLEMENTS in both target configs", count(pbx, "CODE_SIGN_ENTITLEMENTS = App/App.entitlements;") === 2);
console.log("OWED READ 3 profile half: Sign in with Apple enabled on the App ID in the Apple Developer portal + the distribution profile refreshed to carry the capability (portal act at dispatch, Store Uploads side at build time; see NATIVE-DOORS.md)");

/* ---- READ 4: the plugin branch in the shipped code -------------- */
const pkg = JSON.parse(read("package.json"));
check("READ 4 package.json pins @capacitor-firebase/authentication at 8.5.2", pkg.dependencies && pkg.dependencies["@capacitor-firebase/authentication"] === "8.5.2");
const cap = JSON.parse(read("capacitor.config.json"));
const plugCfg = (cap.plugins || {}).FirebaseAuthentication || {};
check("READ 4 capacitor.config.json sets skipNativeAuth true with the google.com and apple.com providers", plugCfg.skipNativeAuth === true && Array.isArray(plugCfg.providers) && plugCfg.providers.includes("google.com") && plugCfg.providers.includes("apple.com"));
const nativeCap = JSON.parse(read("ios/App/App/capacitor.config.json"));
const nativePlugCfg = (nativeCap.plugins || {}).FirebaseAuthentication || {};
check("READ 4 the packaged native config carries skipNativeAuth true and the plugin class", nativePlugCfg.skipNativeAuth === true && (nativeCap.packageClassList || []).includes("FirebaseAuthenticationPlugin"));
const spm = read("ios/App/CapApp-SPM/Package.swift");
check("READ 4 CapApp-SPM Package.swift carries the CapacitorFirebaseAuthentication package and product", spm.includes('name: "CapacitorFirebaseAuthentication"') && spm.includes('.product(name: "CapacitorFirebaseAuthentication"'));
const appDelegate = read("ios/App/App/AppDelegate.swift");
check("READ 4 AppDelegate.swift carries the plugin's open url handler", appDelegate.includes("ApplicationDelegateProxy.shared.application(app, open: url, options: options)"));
for (const [label, path] of [["app tree", "../auth.js"], ["packaged public", "ios/App/App/public/auth.js"]]) {
  const src = read(path);
  check("READ 4 " + label + " auth.js carries the native branch (plugin credential handed to the JS auth, nonce verbatim)", src.includes("function nativeAuthPlugin()") && src.includes("ctx.auth.signInWithCredential(cred)") && src.includes("rawNonce: cred.nonce") && src.includes('var base = "vendor-firebase/";') && !src.includes("gstatic.com") && !src.includes("firebasejs/"));
}

console.log(fails ? "NATIVE CONFIG RESULT fail=" + fails : "NATIVE CONFIG RESULT all present-tense checks pass");
process.exit(fails ? 1 : 0);
