import { Feature } from "../feature";

type Operation = {
    op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test'
    from?: string
    path: string
    value: string
}

type StateToggle = 'enabled' | 'disabled'
export type WebCompatSettings = {
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
    }[]
}

export type WebCompatFeature<VersionType> = Feature<Partial<WebCompatSettings>, VersionType>;
