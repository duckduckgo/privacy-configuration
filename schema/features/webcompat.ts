import { Feature, CSSInjectFeatureSettings, FeatureState } from '../feature';

type FullWebCompatOptions = CSSInjectFeatureSettings<{
    cleanIframeValue: {
        state: FeatureState;
    };
    windowSizing: FeatureState;
    navigatorCredentials: FeatureState;
    safariObject: FeatureState;
    messageHandlers: {
        state: FeatureState;
        handlerStrategies: {
            polyfill: string[];
            reflect: string[];
            undefined: string[];
        };
    };
    notification: {
        state: FeatureState;
    };
    permissions: {
        state: FeatureState;
        validPermissionNames: string[];
        supportedPermissions: object;
    };
    permissionsPresent: {
        state: FeatureState;
    };
    mediaSession: FeatureState;
    presentation: FeatureState;
    webShare: FeatureState;
    viewportWidth:
        | FeatureState
        | {
              state: FeatureState;
              forcedDesktopValue: string;
              forcedMobileValue: string;
          };
    viewportWidthLegacy: FeatureState;
    screenLock: FeatureState;
    plainTextViewPort: FeatureState;
    modifyLocalStorage: {
        state: FeatureState;
        changes: {
            key: string;
            action: 'delete';
        }[];
    };
    modifyCookies: {
        state: FeatureState;
        changes: {
            key: string;
            action: 'delete';
            path?: string;
            domain?: string;
        }[];
    };
    enumerateDevices: FeatureState;
    webNotifications:
        | FeatureState
        | {
              state: FeatureState;
              nativeEnabled?: boolean;
          };
    additionalCheck?: FeatureState;
}>;
export type WebCompatSettings = Partial<FullWebCompatOptions>;

export type WebCompatFeature<VersionType> = Feature<WebCompatSettings, VersionType>;
