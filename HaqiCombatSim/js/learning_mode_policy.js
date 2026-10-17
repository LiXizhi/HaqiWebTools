// URL policy belongs to the browser layer, never to persisted save validation.
export function learningModeForced(search = '') {
    return new URLSearchParams(search).has('forceBilingual');
}

export function enforceLearningMode(save, forced) {
    if (forced && save?.languageLearning) save.languageLearning.enabled = true;
}
