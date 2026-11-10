# LaunchOS™ — How to run it

## Folder layout
```
LaunchOS/
├── LaunchOS.html            Founder portal
├── LaunchOS_Admin.html      Admin portal
├── LaunchOS_Trainer.html    Trainer & Mentor portal
├── LaunchOS_Backend/launchos-node/   Node.js API (port 4000)
├── _archive/                old PHP backend + legacy code (not used, kept for reference)
└── LaunchOS_Audit_and_Roadmap.md     full audit + phased plan
```

## 1. Open the portals (works today, no server or database needed)
The portals must be opened through a local web server, **not** by double-clicking the file. Browsers block saving when a page is opened as a file.

```bash
npx --yes http-server@14.1.1 . -p 5500 -c-1
```
Then open:
- Founder → http://localhost:5500/LaunchOS.html
- Admin → http://localhost:5500/LaunchOS_Admin.html
- Trainer → http://localhost:5500/LaunchOS_Trainer.html

All work saves automatically **in this browser**. In the founder portal, use **💾 Backup** to download a copy of your work and **↺ Restore** to load it back. Until Phase 4 (backend connection), the three portals don't share data with each other.

## 2. Connect the backend to MongoDB Atlas
1. In MongoDB Atlas: **Database → Connect → Drivers** and copy the `mongodb+srv://…` string.
2. In Atlas, open **Network Access** and add your current IP address. Use `0.0.0.0/0` only for quick testing.
3. Open `LaunchOS_Backend/launchos-node/.env` in VS Code or Notepad and fill in:
   - `MONGO_URI=` paste the string, replacing `<password>` with your DB user's password and adding `/launchos` before the `?`
   - `ADMIN_EMAIL=` the email you'll log in with
   - `ADMIN_PASSWORD=` a strong password, 10+ characters

   `JWT_SECRET`, `JWT_REFRESH_SECRET` and `ADMIN_INVITE_KEY` are already filled with random values. Never share this file or paste it into chat.
4. Run these from `LaunchOS_Backend/launchos-node`:
```bash
npm run check-env
```
```bash
npm run setup
```
```bash
npm start
```
5. Check http://localhost:4000/health. It should show `"database":"connected"`.

`npm run setup` creates your admin account. In development mode it also creates demo trainers and founders (password `Founder@123` / `Trainer@123`).
