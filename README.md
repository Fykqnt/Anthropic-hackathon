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
