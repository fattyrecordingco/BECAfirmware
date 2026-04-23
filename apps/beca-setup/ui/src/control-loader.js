import { installControlTransport } from "./control-main.js";

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
  bindSettingsLink(frameWindow, onOpenSetup);
}

export async function mountControlSurface(host, { onOpenSetup, onStatus } = {}) {
  if (!host) return;

  const html = await loadControlHtml();
  const frame = createControlFrame(host);
  writeFrameHtml(frame, html, onOpenSetup);

  onStatus?.("BECA unified surface loaded.");
}
