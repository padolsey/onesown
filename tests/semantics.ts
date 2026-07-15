/**
 * What a draft MEANS, as opposed to what it says.
 *
 * The codec's declared invariant is stability: serialize -> render -> serialize
 * must not change the string. That is necessary but not sufficient, and the gap
 * is not academic — `a*b<i>y</i>` serializes to `a*b*y*`, renders back as
 * `a<i>b</i>y*`, and re-serializes to `a*b*y*`. Stable. Also wrong: the italic
 * has moved off "y" and onto "b", and the plaintext changed too. The sweep
 * reports OK forever.
 *
 * So: compare meaning. Meaning is the plaintext a reader sees, plus — for each
 * mark — the text that mark covers. Coverage is captured as the covered TEXT
 * rather than character indices, so a comparison survives delimiters being
 * consumed (which shifts every index after them) and still notices a mark that
 * moved, shrank or vanished.
 *
 * Deliberately quotiented away, because the codec is not obliged to preserve
 * them and the browser invents them freely: <b> vs <strong>, <i> vs <em>, how
 * text nodes are split, nesting order, and adjacent same-mark elements
 * (<b>a</b><b>b</b> means what <b>ab</b> means).
 */

export interface Semantics {
	/** The plaintext a reader sees. */
	text: string;
	/**
	 * One character per character of `text`: the marks covering that position,
	 * sorted, or '-' for none. So "go go" with the first word bold is "bb---" and
	 * with the second bold is "---bb".
	 *
	 * Positions, not per-mark covered text. Recording only the covered text cannot
	 * tell those two apart — both say bold covers "go" — and a mark that MOVED is
	 * exactly what this is here to catch. Offsets are into the rendered plaintext
	 * of each side, so they are directly comparable: if the plaintext differs, the
	 * comparison has already failed on `text` and the marks don't matter; if it
	 * matches, the indices line up by construction.
	 */
	marks: string;
}

/** Build an expected `marks` string from half-open ranges over the plaintext. */
export function marksOver(text: string, ranges: { b?: [number, number][]; i?: [number, number][]; u?: [number, number][] }): string {
	const at: Set<string>[] = Array.from(text, () => new Set<string>());
	for (const mark of ['b', 'i', 'u'] as const) {
		for (const [start, end] of ranges[mark] ?? []) {
			if (start < 0 || end > text.length || start > end) throw new Error(`range ${start}..${end} outside ${JSON.stringify(text)}`);
			for (let i = start; i < end; i++) at[i].add(mark);
		}
	}
	return at.map((s) => [...s].sort().join('') || '-').join('');
}

/** The browser is free to emit either spelling; they mean the same thing. */
const MARK: Record<string, string> = {
	b: 'b',
	strong: 'b',
	i: 'i',
	em: 'i',
	u: 'u'
};

/**
 * Parse markersToHtml's output. That output is a closed, tiny grammar — <b>,
 * <i>, <u>, <br> and three entities — which is why this needs no DOM and can
 * run in CI beside the other unit tests. It is NOT a general HTML parser and
 * must not be used as one.
 */
export function semanticsOfHtml(html: string): Semantics {
	let text = '';
	const marks: string[] = [];
	const open: string[] = [];
	const emit = (s: string) => {
		const here = [...new Set(open)].sort().join('') || '-';
		for (const ch of s) {
			text += ch;
			marks.push(here);
		}
	};
	let i = 0;
	while (i < html.length) {
		if (html[i] === '<') {
			const close = html.indexOf('>', i);
			if (close === -1) throw new Error('unterminated tag in codec output: ' + html.slice(i));
			const raw = html.slice(i + 1, close);
			const tag = raw.replace(/^\//, '').toLowerCase();
			if (tag === 'br') {
				emit('\n');
			} else if (MARK[tag]) {
				if (raw.startsWith('/')) {
					const at = open.lastIndexOf(MARK[tag]);
					if (at === -1) throw new Error('unbalanced </' + tag + '> in codec output: ' + html);
					open.splice(at, 1);
				} else {
					open.push(MARK[tag]);
				}
			} else {
				throw new Error('unexpected tag <' + raw + '> in codec output: ' + html);
			}
			i = close + 1;
			continue;
		}
		if (html[i] === '&') {
			const semi = html.indexOf(';', i);
			const ent = semi === -1 ? '' : html.slice(i, semi + 1);
			const lit = ent === '&amp;' ? '&' : ent === '&lt;' ? '<' : ent === '&gt;' ? '>' : null;
			if (lit === null) throw new Error('unexpected entity in codec output: ' + html.slice(i, i + 8));
			emit(lit);
			i = semi + 1;
			continue;
		}
		emit(html[i]);
		i++;
	}
	if (open.length) throw new Error('unclosed ' + open.join(',') + ' in codec output: ' + html);
	// A draft ending in \n renders an explicit placeholder <br> mirroring the one
	// Chromium maintains. It is caret furniture, not content.
	if (text.endsWith('\n')) {
		text = text.slice(0, -1);
		marks.pop();
	}
	return { text, marks: marks.join('') };
}

export function sameSemantics(a: Semantics, b: Semantics): boolean {
	return a.text === b.text && a.marks === b.marks;
}

export function describe(s: Semantics): string {
	return `text=${JSON.stringify(s.text)} marks=${JSON.stringify(s.marks)}`;
}
