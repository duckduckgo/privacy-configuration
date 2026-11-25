import { expect } from 'chai';
import fs from 'fs';
import { RULES } from './validator/context.js';

const DOCS = new URL('../../docs/web-detection/', import.meta.url);

/**
 * The anchor GitHub gives a Markdown heading.
 *
 * @param {string} heading
 * @returns {string}
 */
const slug = (heading) =>
    heading
        .trim()
        .toLowerCase()
        .replace(/[^\p{L}\p{N} _-]/gu, '')
        .replace(/ /g, '-');

/**
 * The anchors of the headings under each page's `## Authoring rules` section.
 *
 * @param {string} page
 * @returns {string[]}
 */
const ruleAnchors = (page) => {
    const anchors = [];
    let inRules = false;
    for (const line of fs.readFileSync(new URL(page, DOCS), 'utf8').split('\n')) {
        const heading = /^(#+) (.*)$/.exec(line);
        if (!heading) continue;
        if (heading[1] === '##') inRules = heading[2] === 'Authoring rules';
        else if (inRules && heading[1] === '###') anchors.push(slug(heading[2]));
    }
    return anchors;
};

describe('webDetection config tests', () => {
    describe('authoring rule links', () => {
        for (const [
            rule,
            link,
        ] of Object.entries(RULES)) {
            it(`${rule} links to a heading under Authoring rules`, () => {
                const [
                    page,
                    anchor,
                ] = link.split('#');
                expect(ruleAnchors(page)).to.include(anchor);
            });
        }
    });
});
