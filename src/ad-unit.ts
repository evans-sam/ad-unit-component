export class AdUnit extends HTMLDivElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <div>${this.children}</div>
    `;
  }
}

customElements.define("ad-unit", AdUnit, { extends: "div" });
