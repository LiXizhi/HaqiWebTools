// Entry-only confirmations; never persisted with a character save.
export function confirmDuoRole(selection, id, availableIds) {
    const next = selection.map(value => availableIds.includes(value) ? value : null);
    if (!availableIds.includes(id)) return next;
    const selected = next.indexOf(id);
    if (selected >= 0) next[selected] = null;
    else {
        const vacant = next.indexOf(null);
        if (vacant >= 0) next[vacant] = id;
    }
    return next;
}
