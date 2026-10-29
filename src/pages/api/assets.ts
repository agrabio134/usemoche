import handler from '../../launchpad/server/assets';
import { toAstro } from '../../launchpad/server/adapt';

export const prerender = false;
export const ALL = toAstro(handler);
