# Build fix

Fixed the Next.js production build error caused by `useSearchParams()` in the shared AppShell and System Settings page. Both now read the query string only inside client-side effects using `window.location.search`, avoiding a `useSearchParams` CSR bailout during static prerendering.

The previous build reached successful compilation/type checking but failed prerendering multiple routes because AppShell mounted `useSearchParams()` on every page.
