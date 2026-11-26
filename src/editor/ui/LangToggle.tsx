import { LANGS, setLang, useLang } from '@/i18n';
import { Segmented } from './Segmented';

/** The language switch (EN / RU / 中文): in the top bar and in the welcome window, so the first screen can already be read in the right language. */
export function LangToggle() {
  const lang = useLang();
  return <Segmented className="lang" label="Language" value={lang} onChange={setLang} options={LANGS} />;
}
