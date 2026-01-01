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
    // biome-ignore lint/style/noNonNullAssertion: shadowRoot is always defined after attachShadow
    this.shadowRoot!.innerHTML = `
      <style>
        button { padding: 8px 16px; }
      </style>
      <button>${this.getAttribute("label") ?? "Click me"}</button>
    `;
  }
}

customElements.define("my-button", MyButton);
