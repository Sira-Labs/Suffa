/**
 * ESLint rule `suffa/no-hardcoded-ui-text` (story 16.3, ADR-0021): interface text belongs in
 * the i18n catalogues. Reports Latin-script text written straight into JSX: text children,
 * string children in braces, and the attributes people read (aria-label, title, placeholder,
 * alt, label).
 *
 * Not reported: Arabic-only text (the language being learned), numbers and symbols, and text
 * inside an element that names its language (`lang="…"`) or opts out of translation
 * (`translate="no"`), such as language names in the language picker or the brand name.
 */
const READ_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'alt', 'label']);
const LATIN = /[A-Za-zÀ-ÖØ-öø-ÿ]{2,}/;

/** True when an ancestor element carries lang="…" or translate="no". */
function exempt(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type !== 'JSXElement') continue;
    const exemptAttribute = current.openingElement.attributes.some(
      (a) =>
        a.type === 'JSXAttribute' &&
        (a.name.name === 'lang' ||
          (a.name.name === 'translate' && a.value && a.value.value === 'no'))
    );
    if (exemptAttribute) return true;
  }
  return false;
}

export const noHardcodedUiText = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Interface text comes from the i18n catalogues (useTranslation).',
    },
    messages: {
      text: 'Hard-coded interface text "{{text}}": put it in a catalogue and use t().',
    },
    schema: [],
  },
  create(context) {
    const report = (node, text) =>
      context.report({
        node,
        messageId: 'text',
        data: { text: text.trim().slice(0, 40) },
      });
    return {
      JSXText(node) {
        if (LATIN.test(node.value) && !exempt(node)) report(node, node.value);
      },
      JSXExpressionContainer(node) {
        const { expression } = node;
        if (node.parent.type === 'JSXAttribute') return;
        const text =
          expression.type === 'Literal' && typeof expression.value === 'string'
            ? expression.value
            : expression.type === 'TemplateLiteral' && expression.expressions.length === 0
              ? expression.quasis[0].value.cooked
              : null;
        if (text && LATIN.test(text) && !exempt(node)) report(node, text);
      },
      JSXAttribute(node) {
        if (!READ_ATTRIBUTES.has(node.name.name) || !node.value) return;
        const value =
          node.value.type === 'Literal'
            ? node.value.value
            : node.value.type === 'JSXExpressionContainer' &&
                node.value.expression.type === 'Literal'
              ? node.value.expression.value
              : null;
        if (typeof value === 'string' && LATIN.test(value) && !exempt(node)) {
          report(node, value);
        }
      },
    };
  },
};

export default { rules: { 'no-hardcoded-ui-text': noHardcodedUiText } };
