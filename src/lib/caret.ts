/**
 * Measure the caret's viewport Y position inside a textarea by mirroring its
 * text up to the caret into a hidden, identically-styled element. Used by
 * typewriter scrolling; the contenteditable editor gets this for free from
 * Range.getBoundingClientRect().
 */
const MIRROR_PROPS = [
	'direction',
	'boxSizing',
	'fontFamily',
	'fontSize',
	'fontWeight',
	'fontStyle',
	'letterSpacing',
	'lineHeight',
	'paddingTop',
	'paddingRight',
	'paddingBottom',
	'paddingLeft',
	'borderTopWidth',
	'borderRightWidth',
	'borderBottomWidth',
	'borderLeftWidth',
	'textIndent',
	'textTransform',
	'whiteSpace',
	'wordSpacing',
	'overflowWrap',
	'tabSize'
] as const;

export function caretViewportTop(ta: HTMLTextAreaElement): number {
	const mirror = document.createElement('div');
	const cs = getComputedStyle(ta);
	for (const prop of MIRROR_PROPS) {
		mirror.style.setProperty(
			prop.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()),
			cs.getPropertyValue(prop.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()))
		);
	}
	mirror.style.position = 'fixed';
	mirror.style.top = '0';
	mirror.style.left = '-9999px';
	mirror.style.visibility = 'hidden';
	mirror.style.overflow = 'hidden';
	mirror.style.height = 'auto';
	mirror.style.width = ta.clientWidth + 'px';
	mirror.textContent = ta.value.slice(0, ta.selectionEnd ?? ta.value.length);
	const marker = document.createElement('span');
	marker.textContent = '​';
	mirror.appendChild(marker);
	document.body.appendChild(mirror);
	const offset = marker.offsetTop;
	mirror.remove();
	return ta.getBoundingClientRect().top + offset;
}
