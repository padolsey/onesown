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
	/** For each mark, the concatenated text it covers. */
	b: string;
	i: string;
	u: string;
}

const MARK: Record<string, keyof Omit<Semantics, 'text'>> = {
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
	const out: Semantics = { text: '', b: '', i: '', u: '' };
	const open: (keyof Omit<Semantics, 'text'>)[] = [];
	const emit = (s: string) => {
		out.text += s;
		for (const m of open) out[m] += s;
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
	out.text = out.text.replace(/\n$/, '');
	return out;
}

/** Meaning of a canonical draft string: what a reader of the rich rooms sees. */
export function semanticsOfDraft(draft: string, markersToHtml: (s: string) => string): Semantics {
	return semanticsOfHtml(markersToHtml(draft));
}

export function sameSemantics(a: Semantics, b: Semantics): boolean {
	return a.text === b.text && a.b === b.b && a.i === b.i && a.u === b.u;
}

export function describe(s: Semantics): string {
	return `text=${JSON.stringify(s.text)} b=${JSON.stringify(s.b)} i=${JSON.stringify(s.i)} u=${JSON.stringify(s.u)}`;
}
