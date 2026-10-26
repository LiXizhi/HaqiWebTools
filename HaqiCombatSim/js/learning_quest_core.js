import {wordLanguage} from './word_lexicon_core.js';
export function learningQuestMatches(save,quest){return !quest?.learningLanguage||wordLanguage(save.languageLearning?.target)===quest.learningLanguage;}
