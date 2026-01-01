// src/my-button.ts
export class MyButton extends HTMLElement {
  static observedAttributes = ["label"];

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  attributeChangedCallback() {
    this.render();
  }

  connectedCallback() {
    this.render();
  }

  render() {
    if (!this.shadowRoot) return;

    this.shadowRoot.innerHTML = `
      <style>
        button { padding: 8px 16px; }
      </style>
      <button>${this.getAttribute("label") ?? "Click me"}</button>
    `;
  }
}

customElements.define("my-button", MyButton);
