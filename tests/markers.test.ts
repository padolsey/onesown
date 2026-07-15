/**
 * Unit tests for the marker codec parser (markersToHtml is pure and
 * node-runnable; domToMarkers needs a real DOM and is covered by the E2E
 * idempotence sweep in tests/e2e.mjs).
 *
 * Run: pnpm test:unit
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markersToHtml, stripMarkers } from '../src/lib/markers.ts';
import { semanticsOfHtml, describe as describeSem, type Semantics } from './semantics.ts';

test('plain text passes through with HTML escaped', () => {
	assert.equal(markersToHtml('a & b <script> c'), 'a &amp; b &lt;script&gt; c');
});

test('bold, italic, underline basics', () => {
	assert.equal(markersToHtml('**bold**'), '<b>bold</b>');
	assert.equal(markersToHtml('*it*'), '<i>it</i>');
	assert.equal(markersToHtml('<u>under</u>'), '<u>under</u>');
});

test('nesting and interleaving produce well-formed HTML', () => {
	assert.equal(markersToHtml('**a *b* c**'), '<b>a <i>b</i> c</b>');
	assert.equal(markersToHtml('***x***'), '<b><i>x</i></b>');
	// Ambiguous hand-typed interleave: bold never closes → demoted to literal.
	assert.equal(markersToHtml('**a *b** c*'), '**a <i>b</i>* c*');
	// Serializer shape for <b>a<i>b</i></b><i>**c</i> — runs must re-pair
	// innermost-first so this is a fixed point, not an escape-growing loop.
	assert.equal(markersToHtml('**a*b****\\*\\*c*'), '<b>a<i>b</i></b><i>**c</i>');
});

test('flanking rule keeps lone asterisks in prose literal', () => {
	assert.equal(markersToHtml('a * b * c'), 'a * b * c');
	assert.equal(markersToHtml('2 * 3 = 6'), '2 * 3 = 6');
});

test('unclosed markers stay literal', () => {
	assert.equal(markersToHtml('*unclosed'), '*unclosed');
	assert.equal(markersToHtml('trailing**'), 'trailing**');
	assert.equal(markersToHtml('<u>no close'), '&lt;u&gt;no close');
});

test('backslash escapes produce literal characters', () => {
	assert.equal(markersToHtml('\\*not italic\\*'), '*not italic*');
	assert.equal(markersToHtml('*2\\*3 = 6*'), '<i>2*3 = 6</i>');
	assert.equal(markersToHtml('\\\\'), '\\');
	assert.equal(markersToHtml('\\<u>literal\\</u>'), '&lt;u&gt;literal&lt;/u&gt;');
});

test('newlines render as <br>; trailing newline gets a placeholder', () => {
	assert.equal(markersToHtml('a\nb'), 'a<br>b');
	assert.equal(markersToHtml('end\n'), 'end<br><br>');
	assert.equal(markersToHtml('a\n\nb'), 'a<br><br>b');
});

test('italic does not open across a newline boundary', () => {
	assert.equal(markersToHtml('aaa*\nbbb*'), 'aaa*<br>bbb*');
});

test('stripMarkers cleans filenames', () => {
	assert.equal(stripMarkers('**Make it count**'), 'Make it count');
	assert.equal(stripMarkers('<u>Meeting notes</u>'), 'Meeting notes');
	assert.equal(stripMarkers('2\\*3 = 6'), '2*3 = 6');
});

// ── Semantics: what the draft MEANS, not just what it says ───────────────────
//
// Everything above asserts the exact HTML. That pins the parser but says nothing
// about whether a draft still means what the writer wrote — and the tests that
// were supposed to cover that (the e2e idempotence sweep) only check that the
// string stops changing. A draft can be perfectly stable and still have quietly
// relocated a mark. These assert meaning: the plaintext, and the text each mark
// covers. See tests/semantics.ts.

/** Assert the meaning of a canonical draft as the rich rooms would render it. */
function meaning(draft: string, expected: Partial<Semantics>) {
	const got = semanticsOfHtml(markersToHtml(draft));
	const want: Semantics = { text: '', b: '', i: '', u: '', ...expected };
	assert.deepEqual(got, want, `${JSON.stringify(draft)} -> ${describeSem(got)}`);
}

test('a bold run means bold over exactly its own text', () => {
	meaning('**bold**', { text: 'bold', b: 'bold' });
	meaning('a **bold** b', { text: 'a bold b', b: 'bold' });
	meaning('**a** and **b**', { text: 'a and b', b: 'ab' });
	meaning('***x***', { text: 'x', b: 'x', i: 'x' });
	meaning('<u>u</u>', { text: 'u', u: 'u' });
});

test('a literal asterisk in prose stays text and marks nothing', () => {
	meaning('2 * 3 = 6', { text: '2 * 3 = 6' });
	meaning('a * b * c', { text: 'a * b * c' });
	// Escaped, so literal even hard up against a marker.
	meaning('2\\*3 and **bold**', { text: '2*3 and bold', b: 'bold' });
});

test('a space before a marker keeps a stray asterisk harmless', () => {
	// The flanking rule saves this: a closer must FOLLOW non-whitespace, so the
	// marker cannot close and the stray asterisk has nothing to pair with. This
	// is why ordinary prose survives, and it is the case worth protecting.
	meaning('2*3 and **bold**', { text: '2*3 and bold', b: 'bold' });
	meaning('note* and **bold**', { text: 'note* and bold', b: 'bold' });
});

test('a backslash inside a formatted run stays literal and keeps its mark', () => {
	// Regression: this dissolved the bold and ate the backslash before a8821ab.
	meaning('**C:\\\\**', { text: 'C:\\', b: 'C:\\' });
	meaning('*a\\\\*', { text: 'a\\', i: 'a\\' });
	meaning('<u>a\\\\</u>', { text: 'a\\', u: 'a\\' });
	meaning('**a\\\\\\\\**', { text: 'a\\\\', b: 'a\\\\' });
});

// ── Known limitation: stray delimiters re-pairing across a marker ────────────
//
// A stray `*` or trailing `\` in text, where a formatted run begins immediately
// after a NON-WHITESPACE character, lets the parser re-pair asterisk runs across
// the marker boundary: the stray delimiter steals an asterisk from the marker
// and the mark is destroyed. Reachable in real prose mainly via punctuation —
// `2*3 (**six**)`, `a*b "**quoted**"` — since a space before the marker makes it
// unable to close (see the test above).
//
// This is a parser defect. CommonMark forbids exactly this mis-parse via its
// "rule of 3" (a both-able delimiter cannot pair when the run lengths sum to a
// multiple of 3), and our parser matches 12/22 of the spec's asterisk examples
// where a rule-of-3 parser matches 22/22. It is NOT fixable in the parser alone:
// measured, rule-of-3 repairs 511 of 1236 sweep failures but introduces 5, and
// needs serializer changes to reach zero — so it is not an isolated, low-risk
// change. Recorded rather than fixed; see .claude/markers-investigation/.
//
// These are `todo`: they state the correct meaning, stay visible in the run, and
// flip green the day the parser is corrected. Don't "fix" them by asserting the
// broken output.
test('KNOWN: bold after "(" survives a stray asterisk', { todo: 'parser re-pairs runs across the marker' }, () => {
	meaning('2*3 (**six**)', { text: '2*3 (six)', b: 'six' });
});

test('KNOWN: bold after a quote survives a stray asterisk', { todo: 'parser re-pairs runs across the marker' }, () => {
	meaning('a*b "**quoted**"', { text: 'a*b "quoted"', b: 'quoted' });
});

test('KNOWN: bold mid-word survives a stray asterisk', { todo: 'parser re-pairs runs across the marker' }, () => {
	meaning('foo*bar**baz**', { text: 'foo*barbaz', b: 'baz' });
});

test('a correctly escaped backslash before a marker is parsed right', () => {
	// The parser is not at fault for `C:\` + bold: given the canonical the
	// serializer OUGHT to emit, it renders correctly. Both readings below are the
	// parser doing exactly the right thing.
	meaning('C:\\\\**backup**', { text: 'C:\\backup', b: 'backup' });
	// Under-escaped, the backslash consumes the marker's first asterisk — which is
	// what `\*` means. The defect is that domToMarkers emits THIS for the DOM
	// `C:\<b>backup</b>`. That needs a real DOM, so it lives in the e2e semantic
	// round trip, not here.
	meaning('C:\\**backup**', { text: 'C:*backup*', i: 'backup' });
});
