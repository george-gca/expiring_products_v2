import type { InitOptions } from "i18next";
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import enUs from "../locales/en-us.json";
import ptBr from "../locales/pt-br.json";

// `initImmediate: false` forces synchronous initialization instead of deferring
// to next tick via setTimeout, which is necessary for resources to be immediately
// accessible via t() in this module scope before tests/components run.
i18n
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		resources: {
			"pt-BR": { translation: ptBr },
			"en-US": { translation: enUs },
		},
		fallbackLng: "pt-BR",
		interpolation: { escapeValue: false },
		initImmediate: false,
	} as InitOptions & { initImmediate?: boolean });

export default i18n;
