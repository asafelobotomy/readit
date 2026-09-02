# Coexistence

readit is designed to share the page with other extensions.

## uBlock Origin

Cosmetic filters and readit’s hide-noise CSS can both target promoted / recommended nodes. That is fine — duplicate `display: none` is harmless. Prefer uBlock for aggressive global ad blocking; use readit profiles for layout + reading workflow.

## Stylus / userstyles

Stylus injects page CSS outside readit’s Shadow DOM studio. Theme conflicts may occur if both set feed width or colors. Prefer readit CSS tokens for feed width/density; use Stylus for deep custom themes, or disable overlapping rules.

## Moderator Toolbox

If Toolbox is detected (`#tb-bottombar`, `.mod-toolbox`, `data-tb-active`), readit:

- Soft-disables overlapping Mod Desk modules (quick actions, usernote markers)
- Shows a one-line notice in the studio

Do not run both full mod UI stacks on the same actions. Pick Toolbox **or** Mod Desk for queue work until coexistence is refined.

## Old Reddit Redirect / RES

readit targets New Reddit only. If you redirect to `old.reddit.com`, readit content scripts will not apply (host match is `*.reddit.com`, but Old Reddit DOM selectors are unsupported and features will report degraded health).
