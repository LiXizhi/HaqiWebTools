export const HOME_BODY_PARTS=['hair','eye','ear','nose','mouth','arm','hand','leg','foot'];
export const HOME_BODY_ITEM='body-friend-picture';
export function homeBodyGroup(part){return HOME_BODY_PARTS.indexOf(part)<5?'face':'body';}
