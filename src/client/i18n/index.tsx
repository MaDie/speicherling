import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { de, type MessageKey } from "./de";
import { en } from "./en";

export type Lang = "de" | "en";

const dictionaries = { de, en };

function initialLang(): Lang {
  const saved = localStorage.getItem("speicherling-lang");
  if (saved === "de" || saved === "en") return saved;
  return navigator.language.toLowerCase().startsWith("de") ? "de" : "en";
}

type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: MessageKey, vars?: Record<string, string>) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const value = useMemo<I18nValue>(() => {
    return {
      lang,
      setLang(next) {
        localStorage.setItem("speicherling-lang", next);
        setLangState(next);
      },
      t(key, vars) {
        let text: string = dictionaries[lang][key] ?? de[key];
        if (vars) {
          for (const [name, replacement] of Object.entries(vars)) {
            text = text.replaceAll(`{${name}}`, replacement);
          }
        }
        return text;
      },
    };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n outside provider");
  return value;
}

export function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang" role="group" aria-label={t("language")}>
      <button type="button" aria-pressed={lang === "de"} onClick={() => setLang("de")}>
        DE
      </button>
      <button type="button" aria-pressed={lang === "en"} onClick={() => setLang("en")}>
        EN
      </button>
    </div>
  );
}
