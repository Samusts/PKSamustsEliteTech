# ⚡ EliteTech — Premium Tech Store v4.0

> Ultra-premium AI-powered ecommerce marketplace & professional service platform
> Hosted on GitHub Pages + Cloudflare Workers

---

## 🚀 Live Site
**https://samusts.github.io/PKSamustsEliteTech**

## ⚙️ Tech Stack
- **Frontend:** Vanilla HTML/CSS/JS (PWA-ready)
- **Backend:** Cloudflare Workers (serverless)
- **Database:** GitHub JSON (real-time sync)
- **AI:** Anthropic Claude (via Cloudflare Worker)
- **Hosting:** GitHub Pages

---

## 📁 Files

| File | Purpose |
|------|---------|
| `index.html` | Main storefront (3,800+ lines) |
| `worker.js` | Cloudflare Worker — API gateway |
| `sw.js` | Service Worker — PWA + offline |
| `manifest.json` | PWA manifest |
| `db.json` | Live database (auto-updated) |

---

## 🔧 Setup

### 1. Cloudflare Worker
1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. **Compute → Workers → Create**
3. Name it `elitetech-proxy`
4. Paste contents of `worker.js`
5. **Settings → Variables & Secrets:**
   - `GITHUB_TOKEN` = your GitHub token (ghp_...)
   - `ANTHROPIC_KEY` = your Anthropic key (sk-ant-...)
6. Deploy

### 2. GitHub Pages
1. Push all files to your repo
2. Settings → Pages → Deploy from main branch

### 3. Admin Access
- Mobile: Tap footer logo **5 times** within 3 seconds
- Desktop: Press **Ctrl + Shift + A**
- Password: `elitetech2025`

---

## ✨ Features

### Products
- 15+ categories (dynamic, expandable)
- 7 condition types
- Multi-image galleries
- AI spec generation
- Real-time inventory
- Featured + trending

### Services
- 8 built-in services
- Unlimited custom services via admin
- WhatsApp booking integration
- Service availability control

### Admin Dashboard (7 tabs)
- 📦 Products — manage inventory
- ➕ Add — add new products
- 🔧 Services — manage services
- 📁 Categories — manage categories
- 📊 Analytics — view stats
- 📋 Activity — audit logs
- ⚙️ Settings — store config + flash sales

### AI System
- Real-time AI chat via Cloudflare Worker
- AI product recommendations
- AI spec generation
- Review moderation
- Rate-limited & secure

### Security
- SHA-256 password hashing
- Brute-force protection (5 attempts, 15min lockout)
- 30-minute session timeout
- Input sanitization (XSS protection)
- Rate limiting in Cloudflare Worker
- Database write validation

### PWA
- Installable as mobile app
- Offline support via service worker
- Background sync
- Push notifications

---

## 🔄 Real-time Sync
Every change you make in admin automatically:
1. Saves to GitHub db.json via Cloudflare Worker
2. All visitors refresh every 10 seconds
3. Changes appear globally within ~10 seconds

---

## 📞 Contact
**WhatsApp:** +234 903 600 6553  
**Location:** Maiduguri, Borno State, Nigeria
