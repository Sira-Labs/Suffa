/** The lint rule that keeps new interface text out of the code (story 16.3). */
import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import { noHardcodedUiText } from '../../eslint/no-hardcoded-ui-text.js';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
});

tester.run('no-hardcoded-ui-text', noHardcodedUiText, {
  valid: [
    'const a = <p>{t("settings.title")}</p>;',
    'const a = <span lang="ar">الصُّفَّة</span>;',
    'const a = <p>الصُّفَّة · 42 ✓</p>;',
    'const a = <option value="en" lang="en">English</option>;',
    'const a = <span translate="no">Suffa</span>;',
    'const a = <img alt="" src="/x.svg" />;',
    'const a = <input aria-label={t("account.email")} />;',
    'const a = <div className="row card" data-x="Some value" />;',
  ],
  invalid: [
    { code: 'const a = <p>Einstellungen</p>;', errors: [{ messageId: 'text' }] },
    { code: 'const a = <p>{"Speichern"}</p>;', errors: [{ messageId: 'text' }] },
    { code: 'const a = <p>{`Weiter`}</p>;', errors: [{ messageId: 'text' }] },
    { code: 'const a = <input aria-label="E-Mail" />;', errors: [{ messageId: 'text' }] },
    { code: 'const a = <button title={"Löschen"} />;', errors: [{ messageId: 'text' }] },
    {
      code: 'const a = <input placeholder="du@example.com" />;',
      errors: [{ messageId: 'text' }],
    },
  ],
});
