const TRACKED_EVENTS = [
  "ad-unit:connected",
  "ad-unit:disconnected",
  "ad-unit:fetch",
  "ad-unit:render",
  "ad-unit:refresh",
] as const;

export class EventLog extends HTMLElement {
  #handlers = new Map<string, EventListener>();
  #list: HTMLOListElement;

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = `
      :host {
        display: block;
        font: 0.8125rem ui-monospace, SFMono-Regular, Menlo, monospace;
        background: #0f172a;
        color: #cbd5e1;
        border-radius: 6px;
        padding: 0.75rem 1rem;
        max-height: 300px;
        overflow-y: auto;
      }
      h3 {
        margin: 0 0 0.5rem;
        font: 600 0.75rem system-ui, sans-serif;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      ol {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      li {
        padding: 0.25rem 0;
        border-bottom: 1px solid #1e293b;
        white-space: pre-wrap;
      }
      li:last-child { border-bottom: none; }
      .type { color: #7dd3fc; }
      .code { color: #fcd34d; }
      .empty { color: #64748b; font-style: italic; }
    `;
    const heading = document.createElement("h3");
    heading.textContent = "Event log";
    this.#list = document.createElement("ol");
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "(waiting for ad-unit events…)";
    this.#list.appendChild(empty);
    root.append(style, heading, this.#list);
  }

  connectedCallback() {
    for (const type of TRACKED_EVENTS) {
      const handler: EventListener = (event) =>
        this.#log(type, (event as CustomEvent<{ code?: string }>).detail);
      this.#handlers.set(type, handler);
      document.addEventListener(type, handler);
    }
  }

  disconnectedCallback() {
    for (const [type, handler] of this.#handlers) {
      document.removeEventListener(type, handler);
    }
    this.#handlers.clear();
  }

  #log(type: string, detail: { code?: string } | undefined): void {
    const emptyPlaceholder = this.#list.querySelector(".empty");
    if (emptyPlaceholder) emptyPlaceholder.remove();

    const li = document.createElement("li");
    const timestamp = new Date().toISOString().slice(11, 23);
    const code = detail?.code ?? "—";

    const timeNode = document.createTextNode(`[${timestamp}] `);
    const typeSpan = document.createElement("span");
    typeSpan.className = "type";
    typeSpan.textContent = type;
    const codeSpan = document.createElement("span");
    codeSpan.className = "code";
    codeSpan.textContent = ` · ${code}`;
    li.append(timeNode, typeSpan, codeSpan);
    this.#list.prepend(li);
  }
}

if (!customElements.get("event-log")) {
  customElements.define("event-log", EventLog);
}
