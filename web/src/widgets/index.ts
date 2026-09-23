// Entry point for the widget library's build target (vite.widgets.config.ts)
// -- importing this file registers every implemented custom element as a
// side effect, exactly what an adopting page's `<script type="module"
// src=".../authstar-widgets.js">` tag needs. Story 011 specifies six
// elements total; this slice implements two representative ones end to end
// (a static, no-fetch widget and a fetch-driven one with real
// loading/empty/error states) -- see TESTING.md for the other four's
// deferred status.
export { AuthstarUpgradeButton, defineAuthstarUpgradeButton } from './upgrade-button'
export { AuthstarSubscriptionStatus, defineAuthstarSubscriptionStatus, type SubscriptionInfo } from './subscription-status'

import { defineAuthstarUpgradeButton } from './upgrade-button'
import { defineAuthstarSubscriptionStatus } from './subscription-status'

defineAuthstarUpgradeButton()
defineAuthstarSubscriptionStatus()
