import { startLightweightSync } from "../lib/sync";

export default defineBackground(() => {
  // Pull synced prefs on startup and when another device pushes; before this,
  // prefs were only ever pushed, so enabling sync had no effect.
  startLightweightSync();
});
