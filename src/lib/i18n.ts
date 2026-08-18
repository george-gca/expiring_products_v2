import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import enUs from "../locales/en-us.json";
import ptBr from "../locales/pt-br.json";

// Initialize with LanguageDetector and initReactI18next first, then init
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
	} as Record<string, unknown>);

export default i18n;
