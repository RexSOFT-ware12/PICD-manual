# DUF Preview customization

The Appearance & Navigation page now includes a dedicated **DUF Preview workspace** section separate from Visual Theme.

Supported settings:
- Workspace title
- Independent DUF Studio color theme (dark Daz Studio-style palette by default)
- Default inspector tab
- Show/hide top toolbar
- Show/hide status bar
- Show/hide viewport toolbar
- Scene and Inspector default open/closed state
- Scene and Inspector panel widths
- Default viewport toggles: Skeleton, Mesh, Wireframe, See-through joints, Fingers and face, Grid, and Invert pose rotation

These settings are persisted in browser local storage so they work with older PICD API deployments that reject unknown navigation fields. Saving Appearance & Navigation applies them immediately to an open DUF Preview workspace.

### Default DUF Studio palette

The DUF Preview uses its own dark palette and does not inherit the main PICD dashboard colors. Appearance & Navigation exposes the DUF colors for background, panels, controls, borders, text, accent, viewport, success, warning, and error states. Changes are stored locally with the DUF customization so they apply only to the DUF Preview workspace.
