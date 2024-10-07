import { Feature, FeatureState, SiteException } from "../feature";

type CookieSettings = {
  trackerCookie: FeatureState;
  nonTrackerCookie: FeatureState;
  excludedCookieDomains: SiteException[];
  firstPartyTrackerCookiePolicy: {
    threshold: number;
    maxAge: number;
  };
  firstPartyCookiePolicy: {
    threshold: number;
    maxAge: number;
  };
  thirdPartyCookieNames?: string[];
  // Windows-specific key
  excludedCookieNames?: {
    domain: string;
    name: string;
    reason: string;
  }[];
};

export type CookieFeature<VersionType> = Feature<CookieSettings, VersionType>;
