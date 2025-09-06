## AI Image Generator (Next.js App Router)

This app generates images using Google AI Studio (Gemini API) from a text prompt.

### Setup

1) Install dependencies:

```bash
npm install
```

2) Add your API key to `.env.local`:

```bash
GEMINI_API_KEY=your_key_here
```

Create an API key in Google AI Studio.

3) Start the dev server:

```bash
npm run dev
```

Open http://localhost:3000.

### How it works

- API route: `src/app/api/generate-image/route.ts` uses `@google/generative-ai` with a Gemini model and `tools.image_generation`.
- UI: `src/app/page.tsx` posts the prompt to `/api/generate-image` and renders the returned base64 image.

### Notes

- Ensure your key/region has access to image generation.
- API returns a data URL suitable for `<img>`.

---

### LINE minimal start (2x2 image deferred)

This repo includes a LINE webhook at `POST /api/line` that verifies the `x-line-signature`, stores the last image per user in memory, and returns a minimal guidance + treatment selection quick reply. Image editing is performed with Gemini; the result is published under a temporary CDN endpoint and pushed back to the user. The 2x2 grid output is intentionally out of scope for now.

Steps
- Set env vars (e.g., `.env.local` during development):
  - `LINE_CHANNEL_SECRET=<from LINE Developers>`
  - `LINE_CHANNEL_ACCESS_TOKEN=<from LINE Developers>`
  - `PUBLIC_BASE_URL=https://<your-public-host>`
- Run: `pnpm dev`
- Tunnel (optional): `ngrok http 3000`, set LINE Webhook URL to `<PUBLIC_BASE_URL>/api/line`.
- Verify in LINE: add bot → send face image → receive treatment quick reply → pick one → get single edited image + rating quick reply.

Notes
- Webhook returns 200 for valid requests; invalid signature returns 401.
- In-memory store and CDN are TTL-based and ephemeral.
