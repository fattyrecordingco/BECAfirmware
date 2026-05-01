import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = resolve(root, "..", "..", ".beca-cache", "ui-verification");
const url = process.env.BECA_VERIFY_URL || "http://127.0.0.1:5173";
let devServer = null;

mkdirSync(artifactDir, { recursive: true });

async function canReach(targetUrl) {
  try {
    const response = await fetch(targetUrl, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer(targetUrl, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await canReach(targetUrl)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Timed out waiting for ${targetUrl}`);
}

async function ensureDevServer() {
  if (await canReach(url)) return;
  if (process.env.BECA_VERIFY_URL) {
    throw new Error(`BECA_VERIFY_URL is not reachable: ${url}`);
  }
  devServer = spawn(
    process.execPath,
    [resolve(root, "node_modules", "vite", "bin", "vite.js"), "--host", "127.0.0.1", "--port", "5173"],
    {
      cwd: root,
      stdio: "ignore",
      windowsHide: true
    }
  );
  devServer.unref();
  await waitForServer(url);
}

function cleanup() {
  if (devServer && !devServer.killed) {
    devServer.kill();
  }
}

process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});

function run(args, { allowFailure = false, input = "" } = {}) {
  const cli = resolve(root, "node_modules", "agent-browser", "bin", "agent-browser.js");
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root,
    encoding: "utf8",
    input
  });

  const output = `${result.stdout || ""}${result.stderr || ""}${result.error?.message || ""}`.trim();
  if (output) {
    console.log(output);
  }

  if (!allowFailure && result.status !== 0) {
    throw new Error(`agent-browser ${args.join(" ")} failed with exit ${result.status}`);
  }

  return output;
}

await ensureDevServer();

run(["open", url]);
run(["wait", "1000"]);
run(["screenshot", resolve(artifactDir, "setup.png")]);

const overlay = run(["eval", "--stdin"], {
  input: 'document.querySelector(".vite-error-overlay, #webpack-dev-server-client-overlay") ? "ERROR_OVERLAY" : "OK"'
});
if (!overlay.includes("OK")) {
  throw new Error("Vite error overlay detected.");
}

const content = run(["eval", "--stdin"], {
  input: 'document.body.innerText.trim().length > 0 ? "HAS_CONTENT" : "BLANK"'
});
if (!content.includes("HAS_CONTENT")) {
  throw new Error("Page rendered blank content.");
}

const layout = run(["eval", "--stdin"], {
  input: `JSON.stringify(Array.from(document.querySelectorAll(".setup-frame *")).filter((node) => {
    const style = getComputedStyle(node);
    if (node.classList.contains("sr-only") || node.classList.contains("support-hidden")) return false;
    if (style.visibility === "hidden" || style.display === "none" || node.offsetParent === null) return false;
    return node.scrollWidth > Math.ceil(node.clientWidth + 1);
  }).slice(0, 12).map((node) => ({
    tag: node.tagName.toLowerCase(),
    id: node.id,
    className: node.className,
    text: node.textContent.trim().slice(0, 48),
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth
  })))`
});
if (!layout.includes("[]")) {
  throw new Error(`Visible horizontal overflow detected: ${layout}`);
}

run(["snapshot", "-i"], { allowFailure: true });
run(["errors"], { allowFailure: true });
run(["console"], { allowFailure: true });

console.log(`UI browser verification complete. Artifacts: ${artifactDir}`);
cleanup();
