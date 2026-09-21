const PLATFORMS = [
  { id: "android",               label: "Android",                    file: "android-config.json" },
  { id: "ios",                   label: "iOS",                        file: "ios-config.json" },
  { id: "macos",                 label: "macOS",                      file: "macos-config.json" },
  { id: "windows",               label: "Windows",                    file: "windows-config.json" },
  { id: "extension",             label: "Extension (base)",           file: "extension-config.json" },
  { id: "extension-chrome",      label: "Extension — Chrome",         file: "extension-chrome-config.json" },
  { id: "extension-firefox",     label: "Extension — Firefox",        file: "extension-firefox-config.json" },
  { id: "extension-brave",       label: "Extension — Brave",          file: "extension-brave-config.json" },
  { id: "extension-edge",        label: "Extension — Edge",           file: "extension-edge-config.json" },
  { id: "extension-edg",         label: "Extension — Edge (legacy)",  file: "extension-edg-config.json" },
  { id: "extension-chromemv3",   label: "Extension — Chrome MV3",     file: "extension-chromemv3-config.json" },
  { id: "extension-bravemv3",    label: "Extension — Brave MV3",      file: "extension-bravemv3-config.json" },
  { id: "extension-edgmv3",     label: "Extension — Edge MV3",       file: "extension-edgmv3-config.json" },
  { id: "extension-safarimv3",   label: "Extension — Safari MV3",     file: "extension-safarimv3-config.json" },
];

export async function loadConfig(platformId) {
  const platform = PLATFORMS.find((p) => p.id === platformId);
  if (!platform) throw new Error(`Unknown platform: ${platformId}`);

  const url = `../v5/${platform.file}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

/**
 * Extract a flat list of subfeature rows from a config object.
 * Each row: { feature, subfeature, state, rollout, cohorts, minSupportedVersion }
 */
export function extractSubfeatures(config) {
  const rows = [];

  for (const [featureKey, feature] of Object.entries(config.features)) {
    const subs = feature.features;
    if (!subs) continue;

    for (const [subKey, sub] of Object.entries(subs)) {
      rows.push({
        feature: featureKey,
        subfeature: subKey,
        state: sub.state ?? "unknown",
        rollout: sub.rollout ?? null,
        cohorts: sub.cohorts ?? null,
        minSupportedVersion: sub.minSupportedVersion ?? null,
      });
    }
  }

  return rows;
}

export { PLATFORMS };
