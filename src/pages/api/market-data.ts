import handler from '../../launchpad/server/market-data';
import { toAstro } from '../../launchpad/server/adapt';

export const prerender = false;
export const ALL = toAstro(handler);
