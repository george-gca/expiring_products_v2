import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import enUs from "../locales/en-us.json";
import ptBr from "../locales/pt-br.json";

i18n
	.use(LanguageDetector)
	.use(initReactI18next)
	.init({
		resources: {
			"pt-br": { translation: ptBr },
			"en-us": { translation: enUs },
		},
		fallbackLng: "pt-br",
		interpolation: { escapeValue: false },
		initImmediate: false,
	});

export default i18n;
