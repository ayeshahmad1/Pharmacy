# Troubleshooting "Cannot GET" Error

## The Problem
If you see "Cannot GET /" or "Cannot GET /register" in your browser, it means:

1. **Frontend dev server is NOT running**, OR
2. **You're accessing the wrong URL**, OR
3. **Backend is serving the page but frontend isn't built**

## Solution: Run Frontend Dev Server

### Step 1: Make sure you're in the frontend directory
```powershell
cd pharmacy-frontend1
```

### Step 2: Start the frontend dev server
```powershell
npm run dev
```

### Step 3: Look for output like this:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### Step 4: Open the correct URL
- Open your browser
- Go to: **http://localhost:5173** (NOT port 5000!)

---

## Quick Checklist

✅ **Frontend running?**
- Open a terminal in `pharmacy-frontend1` folder
- Run: `npm run dev`
- Should see: "Local: http://localhost:5173"

✅ **Backend running?** (needed for API calls)
- Open another terminal in `pharmacy-backend` folder
- Run: `npm run dev`
- Should see: "Server on http://localhost:5000"

✅ **Accessing correct port?**
- Frontend: http://localhost:5173 (Vite dev server)
- Backend: http://localhost:5000 (Express API - don't open in browser)

---

## If Still Not Working

### Check if frontend dependencies are installed:
```powershell
cd pharmacy-frontend1
npm install
```

### Check if port 5173 is already in use:
- Close other apps using port 5173
- Or stop other terminal windows running `npm run dev`

### Check browser console for errors:
- Press F12 in browser
- Look at Console tab for errors
- Look at Network tab to see if requests are failing

---

## Common Errors

### Error: "Port 5173 already in use"
**Solution:** Kill the process using port 5173 or use a different port:
```powershell
npm run dev -- --port 3000
```

### Error: "Cannot find module"
**Solution:** Install dependencies:
```powershell
cd pharmacy-frontend1
npm install
```

### Error: "Connection refused" when trying to login
**Solution:** Make sure backend is running on port 5000:
```powershell
cd pharmacy-backend
npm run dev
```

---

## Need Both Servers Running

**Terminal 1 (Backend):**
```powershell
cd pharmacy-backend
npm run dev
```
- Should show: "Server on http://localhost:5000"

**Terminal 2 (Frontend):**
```powershell
cd pharmacy-frontend1
npm run dev
```
- Should show: "Local: http://localhost:5173"

**Then open:** http://localhost:5173 in your browser

