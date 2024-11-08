import { Feature } from "../feature";

type Operation = {
    op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test'
    from?: string
    path: string
    value: any
}

type StateToggle = 'enabled' | 'disabled'
type FullWebCompatOptions = {
    windowSizing: StateToggle;
    navigatorCredentials: StateToggle;
    safariObject: StateToggle;
    messageHandlers: {
        state: StateToggle;
        handlerStrategies: {
            polyfill: string[];
            reflect: string[];
            undefined: string[];
        }
    }
    notification: {
        state: StateToggle;
    }
    permissions: {
        state: StateToggle;
        validPermissionNames: string[];
        supportedPermissions: object;
    }
    mediaSession: StateToggle;
    presentation: StateToggle;
    webShare: StateToggle;
    viewportWidth: StateToggle | {
        state: StateToggle;
        forcedDesktopValue: string;
        forcedMobileValue: string;
    }
    screenLock: StateToggle;
    plainTextViewPort: StateToggle;
    domains: {
        domain: string | string[];
        patchSettings: Operation[];
    }[],
    modifyLocalStorage: {
        state: StateToggle,
        changes: any[]
    }
}
export type WebCompatSettings = Partial<FullWebCompatOptions>

export type WebCompatFeature<VersionType> = Feature<WebCompatSettings, VersionType>;
