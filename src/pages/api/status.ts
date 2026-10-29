import handler from '../../launchpad/server/status';
import { toAstro } from '../../launchpad/server/adapt';

export const prerender = false;
export const ALL = toAstro(handler);
