import { installControlTransport } from "./control-main.js";

let controlTemplate = null;
let controlStyleInstalled = false;

function localizeControlStyles(styleText) {
  return styleText
    .replace(/\bbody::before\b/g, ".control-surface::before")
    .replace(/\bbody::after\b/g, ".control-surface::after")
    .replace(/\bbody\b/g, ".control-surface");
}

function extractTemplate(doc) {
  const style = doc.querySelector("style")?.textContent || "";
  const classicScripts = Array.from(doc.querySelectorAll("script")).filter(
    (script) => !script.type || script.type === "text/javascript"
  );
  const scriptText = classicScripts.map((script) => script.textContent || "").join("\n");
  const body = doc.body.cloneNode(true);
  body.querySelectorAll("script").forEach((script) => script.remove());
  return {
    styleText: localizeControlStyles(style),
    bodyMarkup: body.innerHTML,
    scriptText
  };
}

async function loadTemplate() {
  if (controlTemplate) return controlTemplate;
  const html = await window.fetch("./control.html").then((response) => response.text());
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  controlTemplate = extractTemplate(doc);
  return controlTemplate;
}

function installStyle(styleText) {
  if (controlStyleInstalled) return;
  const style = document.createElement("style");
  style.id = "beca-control-surface-style";
  style.textContent = styleText;
  document.head.appendChild(style);
  controlStyleInstalled = true;
}

function buildDocumentFacade(root) {
  return {
    body: root,
    createElement: (...args) => document.createElement(...args),
    getElementById: (id) => root.querySelector(`#${CSS.escape(id)}`),
    querySelector: (...args) => root.querySelector(...args),
    querySelectorAll: (...args) => root.querySelectorAll(...args),
    addEventListener: (...args) => document.addEventListener(...args),
    removeEventListener: (...args) => document.removeEventListener(...args)
  };
}

function bindSettingsLink(root, onOpenSetup) {
  const settingsLink = root.querySelector('a[href="/setup"]');
  if (!settingsLink) return;
  settingsLink.href = "#";
  settingsLink.addEventListener("click", (event) => {
    event.preventDefault();
    onOpenSetup?.();
  });
}

export async function mountControlSurface(host, { onOpenSetup, onStatus } = {}) {
  if (!host) return;

  installControlTransport();
  const template = await loadTemplate();
  installStyle(template.styleText);

  host.innerHTML = `<div class="control-surface">${template.bodyMarkup}</div>`;
  const root = host.firstElementChild;
  bindSettingsLink(root, onOpenSetup);

  const documentFacade = buildDocumentFacade(root);
  const runner = new Function("document", "window", "console", template.scriptText);
  runner(documentFacade, window, console);

  onStatus?.("BECA control surface loaded.");
}
