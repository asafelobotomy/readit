/**
 * Compact Nav compatibility layer — implementation lives in nav-rail.ts.
 */
export {
  classifyNavSection,
  mountNavCompactObserver,
  mountNavRail,
  modelFingerprint,
  NAV_COMPACT_MAX_PX,
  NAV_RAIL_ID,
  refreshNavRail,
  scrapeNavModel,
  unmountNavCompactObserver,
  unmountNavRail,
} from "./nav-rail.js";
export type {
  NavItem,
  NavItemKind,
  NavModel,
  NavSection,
  NavSectionId,
} from "./nav-rail.js";
