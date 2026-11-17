import { svgEl } from './dom.js';

// Shared startup mark: inline vector, available before any artwork downloads.
export function createEntryEmblem(extraClass = '') {
    const mark = svgEl('svg', {
        class: `entry-emblem ${extraClass}`.trim(),
        viewBox: '0 0 80 80',
        'aria-hidden': 'true',
    });
    mark.innerHTML = '<circle cx="40" cy="40" r="35" fill="none" stroke="currentColor" opacity=".3"/><circle cx="40" cy="40" r="29" fill="none" stroke="currentColor" opacity=".5"/><path d="M40 13 47 33 67 40 47 47 40 67 33 47 13 40 33 33Z" fill="currentColor"/><path d="m40 29 11 11-11 11-11-11Z" fill="#234c49"/>';
    return mark;
}
