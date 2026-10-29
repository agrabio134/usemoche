import handler from '../../launchpad/server/rpc';
import { toAstro } from '../../launchpad/server/adapt';

export const prerender = false;
export const ALL = toAstro(handler);
