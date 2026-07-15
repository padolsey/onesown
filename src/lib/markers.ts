/**
 * The marker codec. The canonical draft is ONE plain string; rich rooms
 * render it with markersToHtml and serialize their DOM back with domToMarkers.
 *
 * Grammar: **bold**, *italic*, <u>underline</u>. A backslash escapes a literal
 * *, \ or < so characters typed inside formatted text survive round trips.
 * Delimiters follow a flanking rule (openers precede non-whitespace, closers
 * follow non-whitespace) so lone asterisks in prose stay literal; unclosed
 * markers render as literal text.
 *
 * INVARIANT (tests/markers.test.ts + the E2E idempotence sweep in
 * tests/e2e.mjs): domToMarkers
 * output must round-trip through markersToHtml back to an equivalent DOM — one
 * interpreting pass over hand-typed text is allowed, after which the canonical
 * string is stable.
 */

type Mark = 'b' | 'i' | 'u';

interface Tok {
	kind: 'text' | 'open' | 'close';
	mark?: Mark;
	value: string;
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function markersToHtml(md: string): string {
	const toks: Tok[] = [];
	let text = '';
	const flushText = () => {
		if (text !== '') {
			toks.push({ kind: 'text', value: text });
			text = '';
		}
	};
	const openAt: Partial<Record<Mark, number>> = {};
	const openOrder: Mark[] = [];

	let i = 0;
	while (i < md.length) {
		const c = md[i];
		if (c === '\\' && i + 1 < md.length && '*\\<'.includes(md[i + 1])) {
			text += md[i + 1];
			i += 2;
			continue;
		}
		if (c === '*') {
			// Consume the whole asterisk run and split it into closers (innermost
			// mark first, mirroring the serializer's nesting) then openers —
			// pairing char-by-char instead would mispair runs like `***` + `*`.
			let run = 0;
			while (md[i + run] === '*') run++;
			const prev = md[i - 1];
			const next = md[i + run];
			const canClose = prev !== undefined && !/\s/.test(prev);
			const canOpen = next !== undefined && !/\s/.test(next);
			let n = run;
			if (canClose) {
				for (;;) {
					const inner = [...openOrder].reverse().find((m) => m === 'b' || m === 'i');
					if (!inner) break;
					const cost = inner === 'b' ? 2 : 1;
					if (n < cost) break;
					flushText();
					toks.push({ kind: 'close', mark: inner, value: '*'.repeat(cost) });
					delete openAt[inner];
					openOrder.splice(openOrder.lastIndexOf(inner), 1);
					n -= cost;
				}
			}
			if (canOpen) {
				while (n > 0) {
					let mark: Mark | null = null;
					if (n >= 2 && openAt.b === undefined) mark = 'b';
					else if (openAt.i === undefined) mark = 'i';
					if (!mark) break;
					flushText();
					openAt[mark] = toks.length;
					openOrder.push(mark);
					toks.push({ kind: 'open', mark, value: '*'.repeat(mark === 'b' ? 2 : 1) });
					n -= mark === 'b' ? 2 : 1;
				}
			}
			if (n > 0) text += '*'.repeat(n);
			i += run;
			continue;
		}
		if (c === '<' && md.startsWith('<u>', i)) {
			if (openAt.u === undefined) {
				flushText();
				openAt.u = toks.length;
				openOrder.push('u');
				toks.push({ kind: 'open', mark: 'u', value: '<u>' });
			} else {
				text += '<u>';
			}
			i += 3;
			continue;
		}
		if (c === '<' && md.startsWith('</u>', i)) {
			if (openAt.u !== undefined) {
				flushText();
				toks.push({ kind: 'close', mark: 'u', value: '</u>' });
				delete openAt.u;
				openOrder.splice(openOrder.lastIndexOf('u'), 1);
			} else {
				text += '</u>';
			}
			i += 4;
			continue;
		}
		text += c;
		i++;
	}
	flushText();

	// Unclosed openers were never markers — demote them to literal text.
	for (const m of Object.keys(openAt) as Mark[]) {
		const idx = openAt[m]!;
		toks[idx] = { kind: 'text', value: toks[idx].value };
	}

	// Emit well-formed HTML even when hand-typed marks interleave: closing a
	// mark that isn't innermost closes and reopens the marks above it.
	let html = '';
	const stack: Mark[] = [];
	for (const t of toks) {
		if (t.kind === 'text') {
			html += escapeHtml(t.value).replace(/\n/g, '<br>');
		} else if (t.kind === 'open') {
			stack.push(t.mark!);
			html += `<${t.mark}>`;
		} else {
			const pos = stack.lastIndexOf(t.mark!);
			if (pos === -1) {
				html += escapeHtml(t.value);
				continue;
			}
			const reopen = stack.splice(pos + 1);
			for (let j = reopen.length - 1; j >= 0; j--) html += `</${reopen[j]}>`;
			html += `</${t.mark}>`;
			stack.pop();
			for (const m of reopen) {
				html += `<${m}>`;
				stack.push(m);
			}
		}
	}

	// A draft ending in \n gets an explicit placeholder <br>, mirroring the one
	// Chromium maintains — so the final empty line is visible and the
	// serializer's placeholder-skip is symmetric instead of eating content.
	if (md.endsWith('\n')) html += '<br>';
	return html;
}

function isBlock(n: Node): boolean {
	return n instanceof HTMLElement && (n.tagName === 'DIV' || n.tagName === 'P');
}

const FORMAT_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U']);

function isFormat(n: Node | undefined): boolean {
	return !!n && n instanceof HTMLElement && FORMAT_TAGS.has(n.tagName);
}

/**
 * Escape only where ambiguity is real: always inside a formatting element
 * (a literal * there would blur into the surrounding markers), otherwise only
 * where a text asterisk touches a formatted sibling's emitted markers. Plain
 * prose asterisks stay unescaped — the parser's flanking/demotion rules make
 * them a fixed point, so round trips stay stable without backslash noise.
 *
 * A backslash ending this text is left alone here: whether it needs escaping
 * depends on what gets concatenated after it, which only the caller knows —
 * see the dangling-escape guard in domToMarkers' `wrap`.
 */
function escapeText(s: string, inFormat: boolean, prevFormat: boolean, nextFormat: boolean): string {
	let t = s
		.replace(/\u00a0/g, ' ')
		.replace(/\\(?=[*\\<])/g, '\\\\')
		.replace(/<(?=\/?u>)/g, '\\<');
	if (inFormat) {
		t = t.replace(/\*/g, '\\*');
	} else {
		if (prevFormat) t = t.replace(/^\*+/, (m) => m.replace(/\*/g, '\\*'));
		if (nextFormat) t = t.replace(/\*+$/, (m) => m.replace(/\*/g, '\\*'));
	}
	return t;
}

export function domToMarkers(root: HTMLElement): string {
	const walk = (node: Node, isRoot: boolean, inFormat: boolean): string => {
		let out = '';
		const children = Array.from(node.childNodes);
		for (let i = 0; i < children.length; i++) {
			const n = children[i];
			if (n.nodeType === Node.TEXT_NODE) {
				out += escapeText(
					n.nodeValue ?? '',
					inFormat,
					isFormat(children[i - 1]),
					isFormat(children[i + 1])
				);
				continue;
			}
			if (!(n instanceof HTMLElement)) continue;
			const tag = n.tagName;
			if (tag === 'BR') {
				// The final <br> of the editor root or of a block is the browser's
				// caret placeholder, not content (blocks already separate with \n).
				if (!(i === children.length - 1 && (isRoot || isBlock(node)))) out += '\n';
			} else if (tag === 'B' || tag === 'STRONG') {
				out += wrap(n, '**', '**');
			} else if (tag === 'I' || tag === 'EM') {
				out += wrap(n, '*', '*');
			} else if (tag === 'U') {
				out += wrap(n, '<u>', '</u>');
			} else if (tag === 'DIV' || tag === 'P') {
				if (out !== '') out += '\n';
				out += walk(n, false, inFormat);
			} else {
				out += walk(n, false, inFormat);
			}
		}
		return out;
	};

	// execCommand can trap line breaks inside a formatting element
	// (aaa<i><br>bbb</i>) — hoist them out so markers never span a break, and
	// drop formatting spans left empty (bold toggled at a caret, nothing typed).
	const wrap = (n: HTMLElement, openM: string, closeM: string): string => {
		let inner = walk(n, false, true);
		const lead = inner.match(/^\n+/)?.[0] ?? '';
		const trail = inner.length > lead.length ? (inner.match(/\n+$/)?.[0] ?? '') : '';
		inner = inner.slice(lead.length, inner.length - trail.length);
		if (inner === '') return lead + trail;
		// A backslash left at the end of the run would escape the closing marker
		// we're about to concatenate — `C:\` in bold would emit `**C:\**`, whose
		// `**` then parses as an escaped asterisk, dissolving the bold and eating
		// the backslash. Double it so it stays a literal. escapeText can't do this:
		// it sees one text node and can't know a marker lands next, and hoisting
		// the trailing newlines above can make a backslash abut the marker that
		// didn't before — so it has to happen here, after the slice.
		const dangling = (inner.match(/\\*$/)?.[0].length ?? 0) % 2 === 1;
		return lead + openM + inner + (dangling ? '\\' : '') + closeM + trail;
	};

	return walk(root, true, false);
}

/** Strip marker syntax for human-facing uses (filenames). */
export function stripMarkers(s: string): string {
	// One pass: escaped characters become literal, marker syntax disappears.
	return s.replace(/\\([*\\<])|<\/?u>|\*+/g, (_, escaped: string | undefined) => escaped ?? '');
}
