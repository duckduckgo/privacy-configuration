#!/usr/bin/env node

/**
 * Generates tests/data/element-property-tables.json, the element property tables the
 * webDetection CI checks read (tests/web-detection-tests.js).
 *
 * For each element interface, and each interface an element interface inherits from, the
 * output lists the attributes it declares, in its partials from every spec and through its
 * mixins, and names the interface it inherits from. An interface's properties are its own and
 * its ancestors'. Each attribute maps to its IDL type, with typedefs resolved, enums written as
 * `DOMString`, and `unrestricted` kept on `double` and `float`. Tags map to their interfaces per
 * namespace.
 *
 * Attributes named like a reserved predicate key are listed in `reservedNameProperties`:
 * config can only test them through the long form `{"field": <name>, "is": ...}`.
 *
 * Usage: node scripts/generate-element-property-tables.mjs
 *
 * tests/web-detection-tests.js imports `buildTables` to check the checked-in output is current.
 */

import { writeFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const require = createRequire(import.meta.url);
const idl = require('@webref/idl');
const elements = require('@webref/elements');

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = join(rootDir, 'tests/data/element-property-tables.json');

/** Keys a predicate reserves at every level. */
const RESERVED_KEYS = [
    'any',
    'all',
    'none',
    'field',
    'is',
];

/** Element specs in @webref/elements, by namespace. SVG 1.1 is left out: SVG 2 and its modules supersede it. */
const NAMESPACE_SPECS = {
    html: [
        'html',
        'html-ruby-extensions',
        'fenced-frame',
        'geolocation-element',
        'install-element',
        'mediacapture-extensions',
        'model-element',
        'portals',
    ],
    svg: [
        'SVG2',
        'css-masking-1',
        'filter-effects-1',
        'svg-animations',
        'svg-paths',
    ],
    mathml: [
        'mathml-core',
    ],
};

/**
 * @typedef {{ type: string, generic: string, nullable: boolean, union: boolean, idlType: string | IdlType[] }} IdlType
 * @typedef {{ type: string, name?: string, idlType?: IdlType, special?: string }} IdlMember
 * @typedef {{ type: string, name: string, partial?: boolean, inheritance?: string | null, members?: IdlMember[], idlType?: IdlType, target?: string, includes?: string }} IdlDefinition
 */

/**
 * @returns {Promise<object>} the tables, as written to OUTPUT_PATH
 */
export async function buildTables() {
    /** @type {Record<string, IdlDefinition[]>} */
    const parsed = await idl.parseAll();
    const definitions = Object.values(parsed).flat();

    /** @type {Map<string, { inheritance: string | null, members: IdlMember[] }>} */
    const interfaces = new Map();
    /** @type {Map<string, IdlMember[]>} */
    const mixins = new Map();
    /** @type {Map<string, string[]>} */
    const includes = new Map();
    /** @type {Map<string, IdlType>} */
    const typedefs = new Map();
    /** @type {Set<string>} */
    const enums = new Set();

    for (const definition of definitions) {
        switch (definition.type) {
            case 'interface': {
                const entry = interfaces.get(definition.name) ?? { inheritance: null, members: [] };
                if (!definition.partial && definition.inheritance) entry.inheritance = definition.inheritance;
                entry.members.push(...(definition.members ?? []));
                interfaces.set(definition.name, entry);
                break;
            }
            case 'interface mixin': {
                const members = mixins.get(definition.name) ?? [];
                members.push(...(definition.members ?? []));
                mixins.set(definition.name, members);
                break;
            }
            case 'includes': {
                const target = /** @type {string} */ (definition.target);
                const list = includes.get(target) ?? [];
                list.push(/** @type {string} */ (definition.includes));
                includes.set(target, list);
                break;
            }
            case 'typedef':
                typedefs.set(definition.name, /** @type {IdlType} */ (definition.idlType));
                break;
            case 'enum':
                enums.add(definition.name);
                break;
        }
    }

    /**
     * @param {IdlType} type
     * @returns {string}
     */
    function typeToString(type) {
        const suffix = type.nullable ? '?' : '';
        if (type.union) {
            const members = /** @type {IdlType[]} */ (type.idlType).map(typeToString);
            return `(${members.join(' or ')})${suffix}`;
        }
        if (type.generic) {
            const members = /** @type {IdlType[]} */ (type.idlType).map(typeToString);
            return `${type.generic}<${members.join(', ')}>${suffix}`;
        }
        const name = /** @type {string} */ (type.idlType);
        if (enums.has(name)) return `DOMString${suffix}`;
        const typedef = typedefs.get(name);
        if (typedef) {
            const resolved = typeToString(typedef);
            // A nullable use of a nullable typedef stays singly nullable
            return type.nullable && !resolved.endsWith('?') ? `${resolved}?` : resolved;
        }
        return `${name}${suffix}`;
    }

    /**
     * Attributes an interface declares itself, in its partials and through its mixins.
     *
     * @param {string} name
     * @returns {Record<string, string>}
     */
    function ownAttributes(name) {
        /** @type {Record<string, string>} */
        const result = {};
        const members = [
            ...(interfaces.get(name)?.members ?? []),
            ...(includes.get(name) ?? []).flatMap((mixin) => mixins.get(mixin) ?? []),
        ];
        for (const member of members) {
            if (member.type !== 'attribute' || member.special === 'static' || !member.name || !member.idlType) continue;
            result[member.name] = typeToString(member.idlType);
        }
        return result;
    }

    /**
     * @param {string} name
     * @returns {string[]} the interface and its ancestors, nearest first
     */
    function chain(name) {
        const result = [];
        /** @type {string | null | undefined} */
        let current = name;
        while (current && interfaces.has(current)) {
            result.push(current);
            current = interfaces.get(current)?.inheritance;
        }
        return result;
    }

    // Every interface descending from Element, and its ancestors
    const elementInterfaces = new Set();
    for (const name of interfaces.keys()) {
        const ancestry = chain(name);
        if (ancestry.includes('Element')) {
            for (const ancestor of ancestry) elementInterfaces.add(ancestor);
        }
    }

    /** @type {Record<string, { inherits: string | null, properties: Record<string, string> }>} */
    const interfaceTable = {};
    /** @type {string[]} */
    const reservedNameProperties = [];
    for (const name of [
        ...elementInterfaces,
    ].sort()) {
        const properties = ownAttributes(name);
        const sorted = Object.fromEntries(
            Object.entries(properties).sort(
                (
                    [
                        a,
                    ],
                    [
                        b,
                    ],
                ) => (a < b ? -1 : a > b ? 1 : 0),
            ),
        );
        interfaceTable[name] = { inherits: interfaces.get(name)?.inheritance ?? null, properties: sorted };
        for (const property of Object.keys(properties)) {
            if (RESERVED_KEYS.includes(property)) reservedNameProperties.push(`${name}.${property}`);
        }
    }

    const allElements = await elements.listAll();
    /** @type {Record<string, Record<string, string>>} */
    const tags = {};
    for (const [
        namespace,
        specs,
    ] of Object.entries(NAMESPACE_SPECS)) {
        /** @type {Record<string, string>} */
        const tagTable = {};
        for (const spec of specs) {
            for (const element of allElements[spec]?.elements ?? []) {
                if (!element.interface || !interfaceTable[element.interface]) {
                    throw new Error(`<${element.name}> in ${spec} has no element interface in @webref/idl (${element.interface})`);
                }
                tagTable[element.name] = element.interface;
            }
        }
        tags[namespace] = Object.fromEntries(
            Object.entries(tagTable).sort(
                (
                    [
                        a,
                    ],
                    [
                        b,
                    ],
                ) => (a < b ? -1 : a > b ? 1 : 0),
            ),
        );
    }

    return {
        _meta: {
            description: 'Element interface attributes and types, and tag to interface maps, for the webDetection CI checks.',
            generatedBy: 'scripts/generate-element-property-tables.mjs',
            sources: {
                '@webref/idl': require('@webref/idl/package.json').version,
                '@webref/elements': require('@webref/elements/package.json').version,
            },
        },
        reservedNameProperties,
        tags,
        interfaces: interfaceTable,
    };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const tables = await buildTables();
    writeFileSync(OUTPUT_PATH, JSON.stringify(tables, null, 4) + '\n');
    console.log(`Wrote ${OUTPUT_PATH}`);
}
