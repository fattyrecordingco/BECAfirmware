import { installControlTransport } from "./control-main.js";
import appearanceStyles from "./appearance.css?inline";
import { syncControlAppearance } from "./appearance.js";

let controlHtml = "";

async function loadControlHtml() {
  if (controlHtml) return controlHtml;
  const response = await window.fetch("./control.html");
  if (!response.ok) {
    throw new Error(`Failed to load control.html (${response.status})`);
  }
  controlHtml = await response.text();
  return controlHtml;
}

function createControlFrame(host) {
  host.innerHTML = "";
  const frame = document.createElement("iframe");
  frame.className = "control-surface-frame";
  frame.title = "BECA control surface";
  frame.setAttribute("loading", "eager");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.setAttribute("tabindex", "0");
  frame.style.width = "100%";
  frame.style.height = "100%";
  frame.style.border = "0";
  frame.style.background = "transparent";
  host.appendChild(frame);
  return frame;
}

function bindSettingsLink(frameWindow, onOpenSetup) {
  const settingsLink = frameWindow.document.querySelector('a[href="/setup"]');
  if (!settingsLink) return;
  settingsLink.href = "#";
  settingsLink.addEventListener("click", (event) => {
    event.preventDefault();
    onOpenSetup?.();
  });
}

function writeFrameHtml(frame, html, onOpenSetup) {
  const frameWindow = frame.contentWindow;
  const frameDocument = frameWindow?.document;
  if (!frameWindow || !frameDocument) {
    throw new Error("Control frame is unavailable.");
  }

  installControlTransport(frameWindow);
  frameDocument.open();
  frameDocument.write(html);
  frameDocument.close();
  const appearance = frameDocument.createElement("style");
  appearance.textContent = appearanceStyles;
  frameDocument.head.appendChild(appearance);
  syncControlAppearance(frame);
  bindSettingsLink(frameWindow, onOpenSetup);
}

export async function mountControlSurface(host, { onOpenSetup, onStatus, isCurrent = () => true } = {}) {
  if (!host) return;

  const html = await loadControlHtml();
  if (!isCurrent()) return null;
  const frame = createControlFrame(host);
  writeFrameHtml(frame, html, onOpenSetup);
  if (!isCurrent()) {
    frame.remove();
    return null;
  }
  frame.focus();

  onStatus?.("Control ready.");
  return frame;
}
