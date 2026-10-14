import "./appearance.css";

const STORAGE_KEY = "beca-appearance";
const normalize = value => value === "light" ? "light" : "dark";

export function currentAppearance() {
  return normalize(document.documentElement.dataset.theme);
}

export function syncControlAppearance(frame) {
  const root = frame?.contentDocument?.documentElement;
  if (root && root.dataset.theme !== currentAppearance()) root.dataset.theme = currentAppearance();
}

function applyAppearance(value) {
  const theme = normalize(value);
  if (document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme;
  document.querySelectorAll(".control-surface-frame").forEach(syncControlAppearance);
}

export function initializeAppearance() {
  let theme = "dark";
  try { theme = normalize(localStorage.getItem(STORAGE_KEY)); } catch { /* Storage is optional. */ }
  applyAppearance(theme);
}

export function createAppearanceSelector() {
  const label = document.createElement("label");
  label.className = "app-appearance";
  label.innerHTML = '<span>Appearance</span><select aria-label="Appearance"><option value="dark">Dark</option><option value="light">Light</option></select>';
  const select = label.querySelector("select");
  select.value = currentAppearance();
  select.addEventListener("change", () => {
    applyAppearance(select.value);
    try { localStorage.setItem(STORAGE_KEY, currentAppearance()); } catch { /* Keep the choice for this session. */ }
  });
  return label;
}
