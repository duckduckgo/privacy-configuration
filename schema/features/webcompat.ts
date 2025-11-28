import { Feature, CSSInjectFeatureSettings, FeatureState } from '../feature';

type StateToggle = 'enabled' | 'disabled';
type FullWebCompatOptions = CSSInjectFeatureSettings<{
    cleanIframeValue: {
        state: StateToggle;
    };
    windowSizing: StateToggle;
    navigatorCredentials: StateToggle;
    safariObject: StateToggle;
    messageHandlers: {
        state: StateToggle;
        handlerStrategies: {
            polyfill: string[];
            reflect: string[];
            undefined: string[];
        };
    };
    notification: {
        state: StateToggle;
    };
    permissions: {
        state: StateToggle;
        validPermissionNames: string[];
        supportedPermissions: object;
    };
    mediaSession: StateToggle;
    presentation: StateToggle;
    webShare: StateToggle;
    viewportWidth:
        | StateToggle
        | {
              state: StateToggle;
              forcedDesktopValue: string;
              forcedMobileValue: string;
          };
    viewportWidthLegacy: StateToggle;
    screenLock: StateToggle;
    plainTextViewPort: StateToggle;
    modifyLocalStorage: {
        state: StateToggle;
        changes: {
            key: string;
            action: 'delete';
        }[];
    };
    modifyCookies: {
        state: StateToggle;
        changes: {
            key: string;
            action: 'delete';
            path?: string;
            domain?: string;
        }[];
    };
    enumerateDevices: StateToggle;
    webNotifications:
        | StateToggle
        | {
              state: StateToggle;
              nativeEnabled?: boolean;
          };
    additionalCheck?: FeatureState;
}>;
export type WebCompatSettings = Partial<FullWebCompatOptions>;

export type WebCompatFeature<VersionType> = Feature<WebCompatSettings, VersionType>;
