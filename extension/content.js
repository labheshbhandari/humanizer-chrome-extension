// ─── Humanizer Content Script ─────────────────────────────────────────────────
(function () {
  "use strict";

  // Guard: if the extension context is invalidated (e.g. after a reload),
  // bail out silently instead of throwing "Extension context invalidated".
  function isChromeAlive() {
    try { return !!chrome.runtime?.id; } catch (_) { return false; }
  }

  let floatingBtn = null;
  let toastEl = null;

  // ── Editable context detection ────────────────────────────────────────────
  function isInEditableContext() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return false;

    // 1. Standard inputs / textareas
    const active = document.activeElement;
    if (active) {
      const tag = active.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT") return true;
      if (active.isContentEditable) return true;
      if (active.getAttribute("contenteditable") === "true") return true;
    }

    // 2. Walk the selection's ancestor chain for contenteditable
    let node = sel.anchorNode;
    while (node && node !== document.body) {
      if (node.nodeType === 1) {
        const ce = node.getAttribute && node.getAttribute("contenteditable");
        if (ce === "true" || ce === "") return true;
        if (node.getAttribute && node.getAttribute("role") === "textbox") return true;
      }
      node = node.parentNode;
    }

    // 3. Google Docs / Slides — detect the editor shell
    if (document.querySelector(".docs-editor, .kix-appview-editor, .docs-texteventtarget-iframe")) {
      return true;
    }

    return false;
  }

  // ── Button ────────────────────────────────────────────────────────────────
  function createButton() {
    if (floatingBtn) return;
    floatingBtn = document.createElement("div");
    floatingBtn.id = "humanizer-btn";
    floatingBtn.innerHTML = `<span class="humanizer-icon">✦</span><span class="humanizer-label">Humanize</span>`;
    floatingBtn.addEventListener("mousedown", handleHumanize);
    document.body.appendChild(floatingBtn);
  }

  function removeButton() {
    if (floatingBtn) { floatingBtn.remove(); floatingBtn = null; }
  }

  function positionButton(rect) {
    if (!floatingBtn) return;
    const sx = window.scrollX || window.pageXOffset;
    const sy = window.scrollY || window.pageYOffset;
    let top  = rect.top  + sy - 48;
    let left = rect.left + sx + rect.width / 2 - 70;
    if (top  < sy + 8) top = rect.bottom + sy + 8;
    if (left < 8)      left = 8;
    if (left + 140 > window.innerWidth + sx - 8) left = window.innerWidth + sx - 148;
    floatingBtn.style.top  = `${top}px`;
    floatingBtn.style.left = `${left}px`;
    floatingBtn.style.display = "flex";
  }

  // ── Selection listeners ───────────────────────────────────────────────────
  function checkSelection() {
    if (!isChromeAlive()) return;
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : "";
    if (!text || text.length < 10) { removeButton(); return; }
    if (!isInEditableContext())    { removeButton(); return; }
    try {
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      // rect can be empty on Google Docs (canvas) — show button near mouse instead
      if (rect.width === 0 && rect.height === 0) {
        createButton();
        floatingBtn.style.top  = `${(lastMouseY || 100) - 48 + window.scrollY}px`;
        floatingBtn.style.left = `${(lastMouseX || 100) - 70  + window.scrollX}px`;
        floatingBtn.style.display = "flex";
      } else {
        createButton();
        positionButton(rect);
      }
    } catch (_) { removeButton(); }
  }

  let lastMouseX = 0, lastMouseY = 0;
  document.addEventListener("mousemove", (e) => { lastMouseX = e.clientX; lastMouseY = e.clientY; });
  document.addEventListener("mouseup",  () => setTimeout(checkSelection, 60));
  document.addEventListener("keyup",    (e) => {
    if (e.shiftKey || e.key === "a") setTimeout(checkSelection, 60);
  });
  document.addEventListener("mousedown", (e) => {
    if (floatingBtn && !floatingBtn.contains(e.target)) removeButton();
  });

  // ── Humanize ──────────────────────────────────────────────────────────────
  async function handleHumanize(e) {
    e.preventDefault();
    e.stopPropagation();

    if (!isChromeAlive()) {
      showToast("⚠ Please reload the page — extension was updated.", true);
      removeButton();
      return;
    }

    const sel = window.getSelection();
    const selectedText = sel ? sel.toString().trim() : "";
    if (!selectedText) return;

    floatingBtn.innerHTML = `<span class="humanizer-spinner"></span><span class="humanizer-label">Humanizing…</span>`;
    floatingBtn.classList.add("loading");

    try {
      const config = await getConfig();
      const backendUrl = (config.backendUrl || "http://localhost:3000").replace(/\/$/, "");

      const res = await fetch(`${backendUrl}/humanize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-office-secret": config.officeSecret || "" },
        body: JSON.stringify({ text: selectedText }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Server error ${res.status}`);
      }

      const { humanized } = await res.json();
      replaceSelectedText(humanized);
      showToast("✦ Text humanized!");
    } catch (err) {
      console.error("[Humanizer]", err);
      showToast("⚠ " + (err.message || "Something went wrong"), true);
    } finally {
      removeButton();
    }
  }

  // ── Text replacement ──────────────────────────────────────────────────────
  function replaceSelectedText(newText) {
    const active = document.activeElement;

    // Standard textarea / input
    if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT")) {
      const s = active.selectionStart, en = active.selectionEnd;
      active.value = active.value.substring(0, s) + newText + active.value.substring(en);
      active.selectionStart = s;
      active.selectionEnd   = s + newText.length;
      ["input", "change"].forEach(t => active.dispatchEvent(new Event(t, { bubbles: true })));
      return;
    }

    // contentEditable (Gmail, Notion, Outlook, LinkedIn…)
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      try {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(newText);
        range.insertNode(node);
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      } catch (_) {}
    }

    // Last resort — execCommand (Google Docs hidden textarea, etc.)
    document.execCommand("insertText", false, newText);
  }

  // ── Toast ──────────────────────────────────────────────────────────────────
  function showToast(msg, isError = false) {
    if (toastEl) toastEl.remove();
    toastEl = document.createElement("div");
    toastEl.id = "humanizer-toast";
    toastEl.textContent = msg;
    if (isError) toastEl.classList.add("error");
    document.body.appendChild(toastEl);
    setTimeout(() => {
      if (toastEl) toastEl.classList.add("fade-out");
      setTimeout(() => toastEl && toastEl.remove(), 400);
    }, 3000);
  }

  // ── Config ─────────────────────────────────────────────────────────────────
  function getConfig() {
    return new Promise((resolve) =>
      chrome.storage.sync.get({ backendUrl: "http://localhost:3000", officeSecret: "" }, resolve)
    );
  }
})();