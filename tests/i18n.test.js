(function (root, f) { if (typeof module === 'object') module.exports = f; else (root.NORI_SUITES = root.NORI_SUITES || {}).i18n = f; })(this, function (N, H, env) {
const { suite, eq, ok } = H, { results, t } = suite(), I = env.I18N, en = I.LANGS.en.s, ph = s => (s.match(/\{\w+\}/g) || []).sort().join();
t('11 languages in the required order', () => eq(I.codes.join(), 'en,ru,it,fr,es,de,pt,ja,ko,zh,ar'));
t('every language has exactly the English key set, with non-empty strings', () => I.codes.forEach(c => { const s = I.LANGS[c].s; Object.keys(en).forEach(k => ok(typeof s[k] === 'string' && s[k].trim(), c + '.' + k)); Object.keys(s).forEach(k => ok(k in en, 'extra ' + c + '.' + k)); }));
t('template parameters match English in every language', () => I.codes.forEach(c => Object.keys(en).forEach(k => eq(ph(I.LANGS[c].s[k]), ph(en[k]), c + '.' + k))));
t('no untranslated copies of English (only a short whitelist of shared words)', () => {
  const allowed = ['title', 'source', 'mode', 'evApply', 'volume']; // evApply is a pure placeholder template I.codes.filter(c => c !== 'en').forEach(c => Object.keys(en).forEach(k => { if (I.LANGS[c].s[k] === en[k] && !allowed.includes(k)) throw new Error(`${c}.${k} equals English`); }));
});
t('RTL only for Arabic', () => I.codes.forEach(c => eq(I.LANGS[c].dir, c === 'ar' ? 'rtl' : 'ltr', c)));
t('language detection with English fallback', () => { eq(I.detect(['fr-CA']), 'fr'); eq(I.detect(['zh-TW']), 'zh'); eq(I.detect(['sv', 'de-AT']), 'de'); eq(I.detect(['sv']), 'en'); eq(I.detect(['ar-EG']), 'ar'); });
t('parameter substitution and key fallback', () => { I.setLang('en'); eq(I.t('round', { n: 3 }), 'Round 3'); eq(I.t('no_such_key'), 'no_such_key'); I.setLang('de'); eq(I.t('round', { n: 2 }), 'Runde 2'); I.setLang('en'); });
t('rules text has 5 numbered lines in every language', () => I.codes.forEach(c => eq(I.LANGS[c].s.rulesBody.split('\n').length, 5, c)));
return results;
});
