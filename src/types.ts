/**
 * Prebid.js type definitions for banner ad unit configuration
 *
 * @see https://docs.prebid.org/dev-docs/adunit-reference.html#adunitmediatypesbanner
 */

export interface BidParams {
  [key: string]: unknown;
}

export interface Bid {
  bidder: string;
  params: BidParams;
  labelAny?: string[];
  labelAll?: string[];
}

/**
 * OpenRTB page position values
 * @see https://docs.prebid.org/dev-docs/adunit-reference.html
 */
export enum BannerPosition {
  Unknown = 0,
  AboveTheFold = 1,
  BelowTheFold = 3,
  Header = 4,
  Footer = 5,
  Sidebar = 6,
  Fullscreen = 7,
}

/**
 * ORTB format object for flexible banner sizing
 * Used as alternative to sizes array
 */
export interface BannerFormat {
  w: number;
  h: number;
}

/**
 * Banner media type configuration
 * Either sizes or format must be provided
 */
export interface BannerMediaType {
  /** Banner sizes as array of [width, height] tuples */
  sizes?: number[][];
  /** Alternative to sizes - array of {w, h} format objects */
  format?: BannerFormat[];
  /** OpenRTB page position value */
  pos?: BannerPosition | number;
  /** Name for debugging/testing */
  name?: string;
}

/**
 * Media types object for ad unit
 * This base component only supports banner; extend for video/native
 */
export interface MediaTypes {
  banner?: BannerMediaType;
}

export interface Ortb2Imp {
  ext?: {
    gpid?: string;
    data?: Record<string, unknown>;
  };
}

export interface PrebidAdUnit {
  code: string;
  mediaTypes: MediaTypes;
  bids?: Bid[];
  ortb2Imp?: Ortb2Imp;
  labelAny?: string[];
  labelAll?: string[];
  ttlBuffer?: number;
  deferBilling?: boolean;
}

/**
 * Global pbjs type declaration
 */
declare global {
  interface Window {
    pbjs?: {
      que: Array<() => void>;
      addAdUnits?: (adUnits: PrebidAdUnit | PrebidAdUnit[]) => void;
      removeAdUnit?: (code: string) => void;
      // biome-ignore lint/suspicious/noExplicitAny: TODO add the rest of necessary prebid type
    } & any;
  }
}
