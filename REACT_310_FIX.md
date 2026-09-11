# React error #310 fix

The runtime crash was caused by a Rules of Hooks violation in `components/AppShell.tsx`.

`activeSetting` used `useState()` and `useEffect()` after the authentication loading guard. On one render AppShell returned the sign-in/loading view before those hooks ran; after authentication resolved, those hooks ran. That changes the number/order of hooks between renders and produces minified React error #310.

The fix moves the `activeSetting` state/effect above the conditional auth return so the same hooks execute on every render.

The Settings navigation remains in the main application sidebar. No secondary Settings sidebar is introduced.
