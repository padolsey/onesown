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
