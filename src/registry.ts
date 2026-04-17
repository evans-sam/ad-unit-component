import type { AdServerAdapter, HeaderBiddingAdapter } from "./adapters.js";

export class AdapterRegistry<T extends { readonly name: string }> {
  readonly #label: string;
  readonly #adapters = new Map<string, T>();

  constructor(label: string) {
    this.#label = label;
  }

  /**
   * Registers `adapter` under `name`. Duplicate names emit a single
   * `console.warn` and overwrite the previous entry — this supports dev-time
   * hot-reload without failing loud in production.
   *
   * The warn message is stable so adapter authors can grep for it:
   *
   * ```text
   * [AdServerRegistry] adapter "gam" already registered; overwriting
   * ```
   */
  register(name: string, adapter: T): void {
    if (this.#adapters.has(name)) {
      console.warn(
        `[${this.#label}] adapter "${name}" already registered; overwriting`,
      );
    }
    this.#adapters.set(name, adapter);
  }

  get(name: string): T | undefined {
    return this.#adapters.get(name);
  }

  getAll(): Map<string, T> {
    return new Map(this.#adapters);
  }
}

export const AdServerRegistry = new AdapterRegistry<AdServerAdapter>(
  "AdServerRegistry",
);
export const HeaderBiddingRegistry = new AdapterRegistry<HeaderBiddingAdapter>(
  "HeaderBiddingRegistry",
);
