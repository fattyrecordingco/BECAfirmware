const icons = {
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  play: '<path d="m9 5 11 7-11 7z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13m-8 3v7m4-7v7"/>'
};

function button(label, text, icon, action) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "action-button";
  element.title = label;
  element.setAttribute("aria-label", label);
  if (icon) element.innerHTML = `<svg class="control-icon" viewBox="0 0 24 24" aria-hidden="true">${icons[icon]}</svg>`;
  if (text) element.append(text);
  element.addEventListener("click", action);
  return element;
}

function timecode(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function initRecordings(recordings, prepareMidi) {
  const dialog = document.querySelector("#recordingsDialog");
  const list = document.querySelector("#recordingsList");
  const status = document.querySelector("#recordingStatus");
  const time = document.querySelector("#recordingTime");
  const libraryStatus = document.querySelector("#libraryStatus");
  const preview = document.querySelector("#recordingPreview");
  const open = document.querySelector("#openRecordings");
  const controls = [...document.querySelectorAll("[data-record]")];
  const labels = { audio: "Audio", midi: "MIDI", both: "Both" };
  let statusTimer;
  let previewURL;
  let previewGeneration = 0;
  let listGeneration = 0;

  function stopPreview() {
    previewGeneration++;
    preview.pause();
    preview.removeAttribute("src");
    preview.hidden = true;
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = null;
  }

  function renderRows(takes) {
    return takes.map((take) => {
      const row = document.createElement("li");
      const heading = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = new Date(take.date).toLocaleString([], { dateStyle: "medium", timeStyle: "medium" });
      const details = document.createElement("small");
      const formats = [take.frames ? "WAV" : "", take.mode !== "audio" ? "MIDI" : ""].filter(Boolean);
      details.textContent = [...formats, timecode(take.duration), take.complete ? "" : "Partial"].filter(Boolean).join(" · ");
      heading.append(title, details);
      const actions = document.createElement("div");
      actions.className = "recording-row-actions";
      const download = (format, label, text) => button(label, text, "download", async (event) => {
        const target = event.currentTarget;
        target.disabled = true;
        try {
          libraryStatus.textContent = "Preparing download…";
          const file = await recordings.export(take, format);
          const link = document.createElement("a");
          link.href = URL.createObjectURL(file);
          link.download = `${take.name}.${format}`;
          document.body.append(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(link.href), 120000);
          libraryStatus.textContent = globalThis.__BECA_NATIVE_THEME__ ? "Saving file…" : "Check your downloads.";
        } catch { libraryStatus.textContent = "Could not download. Try again."; }
        finally { target.disabled = false; }
      });
      if (take.frames) {
        actions.append(button("Play recording", "", "play", async () => {
          stopPreview();
          const generation = previewGeneration;
          try {
            const file = await recordings.export(take, "wav");
            if (generation !== previewGeneration || recordings.active) return;
            previewURL = URL.createObjectURL(file);
            preview.src = previewURL;
            preview.hidden = false;
            preview.focus();
            await preview.play().catch(() => {});
          } catch { libraryStatus.textContent = "Could not play recording. Try again."; }
        }), download("wav", "Download WAV", "WAV"));
      }
      if (take.mode !== "audio") actions.append(download("mid", "Download MIDI", "MIDI"));
      if (take.frames && take.mode === "both") actions.append(download("zip", "Download WAV and MIDI", "ZIP"));
      const remove = button("Delete recording", "", "trash", () => {
        actions.hidden = true;
        confirmation.hidden = false;
        cancel.focus();
      });
      actions.append(remove);
      const confirmation = document.createElement("div");
      confirmation.hidden = true;
      confirmation.className = "recording-row-actions";
      const cancel = button("Cancel", "Cancel", null, () => {
        confirmation.hidden = true;
        actions.hidden = false;
        remove.focus();
      });
      confirmation.append("Delete this take?", cancel, button("Delete take", "Delete", null, async (event) => {
        event.currentTarget.disabled = true;
        try { await recordings.store.remove(take.id); stopPreview(); await refresh(); dialog.querySelector("[autofocus]").focus(); }
        catch { libraryStatus.textContent = "Could not delete. Close Recordings and try again."; }
      }));
      row.append(heading, actions, confirmation);
      return row;
    });
  }

  async function refresh() {
    const generation = ++listGeneration;
    try {
      const takes = (await recordings.store.list()).filter((take) => take.id !== recordings.active?.info.id);
      if (generation !== listGeneration) return;
      list.replaceChildren(...renderRows(takes));
      libraryStatus.textContent = takes.length ? "Saved on this device" : "No recordings yet";
    } catch { libraryStatus.textContent = "Recording storage is unavailable."; }
  }

  open.addEventListener("click", () => {
    if (dialog.showModal) dialog.showModal();
    else {
      dialog.setAttribute("open", "");
      dialog.setAttribute("aria-modal", "true");
      dialog.querySelector("[autofocus]").focus();
    }
    refresh();
  });
  dialog.addEventListener("close", () => { stopPreview(); open.focus(); });
  function closeFallback() {
    dialog.removeAttribute("open");
    dialog.removeAttribute("aria-modal");
    stopPreview();
    open.focus();
  }
  dialog.querySelector("form").addEventListener("submit", (event) => {
    if (dialog.showModal) return;
    event.preventDefault();
    closeFallback();
  });
  dialog.addEventListener("keydown", (event) => {
    if (dialog.showModal) return;
    if (event.key === "Escape") closeFallback();
    if (event.key !== "Tab") return;
    const controls = [...dialog.querySelectorAll("button:not(:disabled), audio[controls]")]
      .filter((item) => item.getClientRects().length);
    const last = controls[controls.length - 1];
    const boundary = event.shiftKey ? controls[0] : last;
    if (document.activeElement !== boundary) return;
    event.preventDefault();
    (event.shiftKey ? last : controls[0])?.focus();
  });
  window.addEventListener("beca-download", ({ detail }) => { libraryStatus.textContent = detail; });
  controls.forEach((control) => control.addEventListener("click", () => {
    if (recordings.active) { recordings.stop(); return; }
    stopPreview();
    if (control.dataset.record === "midi") prepareMidi();
    recordings.start(control.dataset.record);
  }));
  function render(message) {
    const active = recordings.active;
    const capturing = active?.start !== undefined && !active.stopping;
    for (const control of controls) {
      const mode = control.dataset.record;
      const selected = active?.info.mode === mode;
      control.disabled = Boolean(active && (!selected || active.stopping));
      control.classList.toggle("recording", selected && !active.stopping);
      control.lastElementChild.textContent = selected && !active.stopping ? "Stop" : labels[mode];
      control.setAttribute("aria-label", selected && !active.stopping ? "Stop recording"
        : mode === "both" ? "Record audio and MIDI" : mode === "audio" ? "Record audio" : "Record MIDI");
    }
    if (message || capturing) status.textContent = message || `Recording ${active.info.mode === "both" ? "audio and MIDI" : active.info.mode === "midi" ? "MIDI" : "audio"}`;
    clearInterval(statusTimer);
    if (capturing) {
      const update = () => { time.textContent = timecode(performance.now() - active.start); };
      update();
      statusTimer = setInterval(update, 1000);
    } else time.textContent = "";
  }
  recordings.addEventListener("change", ({ detail }) => {
    render(detail);
    if (dialog.hasAttribute("open") && !recordings.active) refresh();
  });
}
