// Shared inline symbols keep the instrument usable offline and at any scale.
const paths = {
  knobs: '<path d="M5 3v7m0 4v7M12 3v11m0 4v3M19 3v2m0 4v12"/><path d="M2 10h6v4H2zm7 4h6v4H9zm7-9h6v4h-6z"/>',
  learn: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 6a8 8 0 0 1 13 2L20 12M4 12l.9 4a8 8 0 0 0 13 2"/>',
  focus: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/><path d="M8 12h8m-4-4v8"/>',
  mute: '<path d="M11 4L6 8H2v8h4l5 4zM16 9l6 6m0-6-6 6"/>',
  previous: '<path d="M15 5l-7 7 7 7"/>', next: '<path d="M9 5l7 7-7 7"/>',
  undo: '<path d="M9 4L3 10l6 6M3 10h11a7 7 0 0 1 7 7v3"/>',
  save: '<path d="M4 3h13l4 4v14H3V3zM7 3v6h10V3M7 21v-8h10v8"/>',
  setup: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
  control: '<circle cx="12" cy="12" r="8"/><path d="M12 12l4-5M5 20l2-3m12 3-2-3"/>',
  performance: '<path d="M4 17V7m5 14V3m6 15V6m5 9V9"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>'
};
export function icon(name) {
  return `<svg class="beca-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.knobs}</svg>`;
}
