# Garment Extractor: PICD backend work

The frontend now expects the PICD backend to store FabricNow credentials and proxy image uploads. The frontend does not save the API key in local storage, return it from a read endpoint, or call FabricNow with the key from browser code.

## Configuration endpoints

Add these authenticated routes to the PICD backend:

### `GET /monitor/system/fabricnow-config`

Require the same administrator session and `system.read` permission as other system settings. Return only non-secret values and a key status:

```json
{
  "api_url": "https://stream-sell.de.r.appspot.com",
  "company_id": "",
  "google_client_id": "644454908483-j1p3b4kehp0f5mnad7ptn5nvio4i3kmf.apps.googleusercontent.com",
  "api_key_configured": false
}
```

Never include the API key in the response.

### `POST /monitor/system/fabricnow-config`

Require an administrator session, `system.read` permission, and the existing CSRF check. Accept:

```json
{
  "api_url": "https://stream-sell.de.r.appspot.com",
  "company_id": "",
  "google_client_id": "644454908483-j1p3b4kehp0f5mnad7ptn5nvio4i3kmf.apps.googleusercontent.com",
  "api_key": "optional new key",
  "clear_api_key": false
}
```

An omitted or empty `api_key` must preserve the existing key. `clear_api_key: true` removes it. Respond with the same shape as GET, including only `api_key_configured`, never the key itself.

Persist URL, company ID, and Google client ID in the PICD settings database. Store the API key in a server-side secret manager, or encrypt it at rest with a separately managed encryption key. Do not write it to logs, audit-event details, plaintext configuration files, or UI customization records. Restrict URL updates to HTTPS and the approved FabricNow host unless additional hosts are explicitly needed.

## Extraction proxy

Add `POST /monitor/fabricnow/garment-extractor` and protect it with the authenticated administrator session, CSRF validation, and the `workspace.read` permission used by the frontend sidebar entry. If extraction should have a narrower permission, add that permission to both the frontend and admin permission-management flow.

The route should:

1. Accept one multipart file under the field name `file`.
2. Validate PNG, JPEG, or WebP. Confirm and enforce the deployed FabricNow size limit with the API operator; the supplied integration reference does not state one.
3. Read the configured API URL, API key, and optional company ID from server-side storage.
4. Forward the file to `POST {api_url}/api/garment-tool/process` using `Authorization: Bearer <key>` and, when configured, `X-Company-ID: <company_id>`. Let the multipart library set the request content type and boundary.
5. Apply a finite request timeout and avoid logging request headers or the key.
6. Preserve the upstream status and response body. Forward `Content-Type` and `Content-Disposition` so the frontend can render JSON or download a returned package. For errors, return a safe detail string without credentials.

Because the frontend calls the PICD API cross-origin with credentials, add `Content-Disposition` to the CORS exposed headers so the browser can read the package filename.

The API key must be accepted as a bearer credential by FabricNow. The integration reference says this is not confirmed; verify it with the FabricNow API operator before production use. Also confirm whether `X-Company-ID`, extra form fields, and any asynchronous job behavior are required.

## Frontend configuration

The PICD settings page sends a new key only when an administrator saves it. It clears the input after the request and only displays whether a key is configured. The default FabricNow API URL and supplied Google client ID are prefilled; the frontend uses the PICD backend URL separately for authenticated settings and upload requests.

This repository uses Next.js, not Vite. The supplied `VITE_API_URL` is therefore prefilled as the FabricNow default instead of being read as a Vite environment variable. Optional build-time overrides in this frontend use `NEXT_PUBLIC_FABRICNOW_API_URL` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

The documented extractor endpoint uses a server-side bearer API key. The Google client ID is public and is stored as a setting because it was supplied, but it is not used by the documented extraction request. Add a separate Google OAuth flow only if the FabricNow operator provides the required scopes and token audience.

## Backend checks before release

- Only authorized administrators can read or update settings or run extraction.
- A stored key is never returned by GET, included in logs, or sent back to the browser.
- Replacing and clearing the key updates the server-side secret store.
- A valid image is proxied with the correct multipart name and auth headers.
- JSON responses remain JSON; package responses retain their content type and filename.
- Unauthorized, CSRF, invalid upload, upstream authentication, timeout, and upstream error cases return useful safe errors.
