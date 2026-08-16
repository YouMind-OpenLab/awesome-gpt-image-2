# 🛠️ Local Development Guide

## 📦 Prerequisites

- Node.js 20+
- pnpm (recommended) or npm
- Access to Payload CMS instance

## 🚀 Quick Start

### 1. Install Dependencies

```bash
pnpm install
# or
npm install
```

### 2. Configure Environment Variables

Copy the example file and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` and add your CMS credentials:

```env
# Required for README generation / CMS-backed image generation
CMS_HOST=https://your-cms-host.com
CMS_API_KEY=your-api-key-here

# Required for image generation (pnpm run image)
OPENAI_API_KEY=sk-...
```

### 3. Test README Generation

```bash
pnpm run generate
# or
npm run generate
```

This will:
- ✅ Load environment variables from `.env` automatically
- ✅ Fetch prompts from your CMS
- ✅ Generate `README.md` in the root directory

## 🧪 Testing Issue Sync (Optional)

If you want to test the Issue-to-CMS sync script locally:

### 1. Add GitHub Configuration to `.env`

```env
# Optional - only for testing sync script
GITHUB_TOKEN=ghp_your_personal_access_token
GITHUB_REPOSITORY=YouMind-OpenLab/awesome-gpt-image-2
ISSUE_NUMBER=123
ISSUE_BODY="### Prompt Title
My Awesome Prompt

### Prompt
Create a beautiful sunset...

### Description
This prompt generates stunning sunset images...
"
```

### 2. Get GitHub Personal Access Token

1. Go to [GitHub Settings → Tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Select scopes: `repo` (full control)
4. Copy the token to `.env`

### 3. Run Sync Script

```bash
pnpm run sync
# or
npm run sync
```

## 📝 Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| Generate README | `pnpm run generate` | Fetch prompts and generate README.md |
| Sync Issue to CMS | `pnpm run sync` | Parse issue and sync to CMS (local testing) |
| Generate Image | `pnpm run image ...` | Generate an image with `gpt-image-2` (see below) |
| Run Tests | `pnpm test` | Run unit tests for the utility helpers |

## 🎨 Image Generation

Generate images from prompts with OpenAI `gpt-image-2`. Only `OPENAI_API_KEY`
is required for the CMS-free paths (`--prompt`, `--no`); `--id`/`--list` also
need `CMS_HOST`/`CMS_API_KEY`.

```bash
# Free text — no CMS needed
pnpm run image --prompt "a cat astronaut, watercolor"

# From a README prompt by its "No." — no CMS needed
pnpm run image --no 5
pnpm run image --readme-list           # discover available No. values

# From a CMS prompt by id — needs CMS_HOST / CMS_API_KEY
pnpm run image --id 42
pnpm run image --list

# Options
#   --lang <locale>   use a localized README / CMS locale (default: en)
#   --size <s>        default 1024x1024
#   --quality <q>     low | medium | high | auto (default auto)
#   --n <count>       number of images (default 1)
#   --out <dir>       output directory (default output/)
#   --format <fmt>    png | webp | jpeg (default png)
#   --arg <text>      fill {argument...} placeholders in the prompt
```

Images are written to `output/` (git-ignored). Prompts flagged
`needReferenceImages` (image-editing prompts) are not supported and are skipped
with a warning.

## 🔧 How dotenv Works

Both scripts now automatically load `.env` via:

```typescript
import 'dotenv/config';
```

This happens **before** any code runs, so `process.env.CMS_HOST` is available immediately.

### Environment Variable Priority

1. **System environment variables** (highest priority)
2. **`.env` file** (loaded by dotenv)
3. **Default values** (in code, if any)

Example:
```bash
# This overrides .env for this command only
CMS_HOST=https://staging.cms.com pnpm run generate
```

## 🔐 Security Best Practices

### ✅ DO
- Keep `.env` in `.gitignore` (already configured)
- Use `.env.example` for documentation
- Store production secrets in GitHub Secrets
- Use different API keys for local/production

### ❌ DON'T
- Commit `.env` to git
- Share your `.env` file
- Use production credentials locally
- Hardcode credentials in code

## 🐛 Troubleshooting

### Error: "CMS API error: 401"
- Check `CMS_API_KEY` is correct
- Verify API key has required permissions
- Ensure CMS_HOST doesn't have trailing slash

### Error: "ISSUE_NUMBER not provided"
- Only needed for `pnpm run sync`
- Add `ISSUE_NUMBER=123` to `.env`
- Or run: `ISSUE_NUMBER=123 pnpm run sync`

### Error: "Failed to fetch image"
- Check image URL is publicly accessible
- Verify CMS media upload endpoint is working
- Try uploading manually to CMS first

## 📚 Project Structure

```
.
├── .env                  # Your local config (not in git)
├── .env.example          # Template for .env
├── scripts/
│   ├── generate-readme.ts    # Loads dotenv, generates README
│   ├── sync-approved-to-cms.ts  # Loads dotenv, syncs issues
│   └── utils/            # Utility modules
└── README.md             # Auto-generated (don't edit)
```

## 🎯 Workflow

### Local Development
```
Edit .env → Run script → Test locally
```

### Production (GitHub Actions)
```
Push code → Actions run → Secrets injected → Scripts run
```

## 💡 Tips

1. **Use different CMS instances**
   - Local: `CMS_HOST=http://localhost:3000`
   - Staging: `CMS_HOST=https://staging.cms.com`
   - Production: Set in GitHub Secrets

2. **Test with dummy data**
   - Create a test prompt in CMS
   - Mark it as featured
   - Run `pnpm run generate`
   - Check README output

3. **Debug mode**
   - Add console.logs to scripts
   - Use TypeScript debugger
   - Check CMS API responses

## 🆘 Need Help?

- 📖 Check [README_SETUP.md](../README_SETUP.md)
- 🏗️ Review [PROJECT_OVERVIEW.md](../PROJECT_OVERVIEW.md)
- 🐛 Report issues on GitHub
- 💬 Ask in Discussions

---

Happy coding! 🚀
