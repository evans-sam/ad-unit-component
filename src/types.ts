/**
 * Prebid.js type definitions for ad unit configuration
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

export interface BannerMediaType {
  sizes: number[][];
  pos?: number;
  name?: string;
}

export interface VideoMediaType {
  context: "instream" | "outstream" | "adpod";
  playerSize?: number[];
  mimes?: string[];
  protocols?: number[];
  playbackmethod?: number[];
  minduration?: number;
  maxduration?: number;
  w?: number;
  h?: number;
  startdelay?: number;
  skip?: number;
  pos?: number;
}

export interface NativeMediaType {
  ortb?: {
    assets: unknown[];
  };
}

export interface MediaTypes {
  banner?: BannerMediaType;
  video?: VideoMediaType;
  native?: NativeMediaType;
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
      addAdUnits: (adUnits: PrebidAdUnit | PrebidAdUnit[]) => void;
      removeAdUnit: (code: string) => void;
    };
  }
}
