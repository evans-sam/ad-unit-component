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
