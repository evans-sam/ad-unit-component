/**
 * Contract for header bidding adapters (Prebid, apstag, etc.).
 *
 * Implementers subscribe to `<ad-unit>` lifecycle events (typically via
 * `document.addEventListener`) and coordinate auction state. The interface
 * does not prescribe event wiring — that is the adapter's concern. It exists
 * so publishers have a consistent activation shape and TypeScript consumers
 * get autocompletion.
 */
export interface HeaderBiddingAdapter {
  readonly name: string;
  init(config?: unknown): void | Promise<void>;
  destroy(): void | Promise<void>;
}

/**
 * Contract for ad server adapters (GAM, etc.).
 *
 * Structurally identical to `HeaderBiddingAdapter` today. Kept as a distinct
 * type so the two roles can diverge without a breaking change (e.g. ad
 * server adapters may later add a `setTargeting()` method referenced in the
 * parent PRD).
 */
export interface AdServerAdapter {
  readonly name: string;
  init(config?: unknown): void | Promise<void>;
  destroy(): void | Promise<void>;
}
