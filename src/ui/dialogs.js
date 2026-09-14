/**
 * Modal chrome: confirm, text prompt, help, examples, welcome.
 * App owns the callbacks; this module only opens/closes dialogs.
 */
export class FolioDialogs {
  /** @param {Document} doc */
  constructor(doc) {
    this.doc = doc;
    /** @type {((ok: boolean) => void) | null} */
    this._confirmDone = null;
    /** @type {((value: string | null) => void) | null} */
    this._dialogDone = null;
  }

  bind() {
    this.#el("confirm-form")?.addEventListener("submit", (e) => {
      const btn = /** @type {HTMLButtonElement | null} */ (e.submitter);
      this._confirmDone?.(btn?.value === "ok");
      this._confirmDone = null;
    });
    this.#el("confirm-dialog")?.addEventListener("close", () => {
      if (this._confirmDone) {
        this._confirmDone(false);
        this._confirmDone = null;
      }
    });
    this.#el("text-form")?.addEventListener("submit", (e) => {
      const btn = /** @type {HTMLButtonElement | null} */ (e.submitter);
      const input = this.#el("dialog-input");
      if (btn?.value === "ok" && input instanceof HTMLInputElement) {
        this._dialogDone?.(input.value.trim() || input.defaultValue || null);
      } else {
        this._dialogDone?.(null);
      }
      this._dialogDone = null;
    });
    this.#el("text-dialog")?.addEventListener("close", () => {
      if (this._dialogDone) {
        this._dialogDone(null);
        this._dialogDone = null;
      }
    });
  }

  /**
   * @param {string} label
   * @param {string} fallback
   * @param {(value: string | null) => void} done
   */
  askText(label, fallback, done) {
    const dialog = this.#el("text-dialog");
    const lab = this.#el("dialog-label");
    const input = this.#el("dialog-input");
    if (!(dialog instanceof HTMLDialogElement) || !(input instanceof HTMLInputElement)) {
      done(this.doc.defaultView?.prompt(label, fallback) ?? null);
      return;
    }
    if (lab) lab.textContent = label;
    input.value = fallback || "";
    this._dialogDone = done;
    dialog.showModal();
    input.focus();
    input.select();
  }

  /**
   * @param {string} message
   * @param {string} [okLabel]
   * @returns {Promise<boolean>}
   */
  askConfirm(message, okLabel = "确定") {
    const dialog = this.#el("confirm-dialog");
    const msg = this.#el("confirm-msg");
    const okBtn = this.#el("confirm-ok");
    if (msg) msg.textContent = message;
    if (okBtn) okBtn.textContent = okLabel;
    if (!(dialog instanceof HTMLDialogElement)) {
      return Promise.resolve(this.doc.defaultView?.confirm(message) !== false);
    }
    return new Promise((resolve) => {
      this._confirmDone = resolve;
      try {
        dialog.showModal();
      } catch {
        resolve(this.doc.defaultView?.confirm(message) !== false);
      }
    });
  }

  openHelp() {
    this.#setOpen("help-dialog", true);
  }

  closeHelp() {
    this.#setOpen("help-dialog", false);
  }

  openExamples() {
    this.#setOpen("examples-dialog", true);
  }

  closeExamples() {
    this.#setOpen("examples-dialog", false);
  }

  openWelcome() {
    this.#setOpen("welcome-dialog", true);
  }

  closeWelcome() {
    this.#setOpen("welcome-dialog", false);
  }

  /**
   * @param {string} id
   * @param {boolean} open
   */
  #setOpen(id, open) {
    const d = this.#el(id);
    if (d instanceof HTMLDialogElement) {
      try {
        if (open) {
          if (!d.open) d.showModal();
        } else {
          d.close();
        }
        return;
      } catch {
        /* some embedded browsers reject showModal / close */
      }
    }
    if (d instanceof HTMLElement) {
      if (open) {
        d.setAttribute("open", "");
        d.classList.add("open");
      } else {
        d.removeAttribute("open");
        d.classList.remove("open");
      }
    }
  }

  /** @param {string} id */
  #el(id) {
    return this.doc.getElementById(id);
  }
}
