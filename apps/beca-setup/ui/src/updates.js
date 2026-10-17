import { icon } from "./icons.js";

export function installUpdateNotice({ invoke, host }) {
  let lastCheck = -Infinity, checking = false, offered = "";
  const notice = document.createElement("aside");
  notice.className = "app-update-notice"; notice.hidden = true;
  notice.setAttribute("aria-label", "App update");
  notice.innerHTML = `<span role="status"></span><button type="button" class="performance-button">${icon("download")}<span>Download update</span></button><button type="button" class="performance-button icon-button" aria-label="Dismiss update" title="Dismiss update">×</button>`;
  host.appendChild(notice);
  notice.querySelector("button").addEventListener("click", async () => {
    try { await invoke("open_app_update", { version: offered }); }
    catch { notice.querySelector("[role=status]").textContent = "Open github.com/fattyrecordingco/BECAfirmware/releases to download the update."; }
  });
  notice.querySelector("[aria-label='Dismiss update']").addEventListener("click", () => { notice.hidden = true; });
  async function check() {
    if (document.hidden || checking || Date.now() - lastCheck < 21600000) return;
    checking = true; lastCheck = Date.now();
    try {
      const update = await invoke("check_app_update");
      if (update?.version && update.version !== offered) {
        offered = update.version;
        notice.querySelector("[role=status]").textContent = `BECA ${offered} is available.`;
        notice.hidden = false;
      }
    } catch { /* Offline playing never depends on release checks. */ }
    finally { checking = false; }
  }
  document.addEventListener("visibilitychange", check);
  check();
}
