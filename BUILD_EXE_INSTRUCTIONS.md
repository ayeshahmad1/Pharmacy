# How to Create PharmacyPOS.exe

This guide explains how to package your Pharmacy POS application into a single executable file.

## Prerequisites

1. **Node.js** installed (v18 or higher recommended)
2. **MongoDB** - Either:
   - Local MongoDB installed and running, OR
   - MongoDB Atlas connection string
3. All dependencies installed in both frontend and backend

---

## Step-by-Step Build Process

### Step 1: Build the Frontend

1. Navigate to the frontend directory:
```bash
cd pharmacy-frontend1
```

2. Build the frontend for production:
```bash
npm run build
```

This creates a `dist` folder with the production-ready frontend files.

### Step 2: Copy Frontend Build to Backend

1. Copy the contents of `pharmacy-frontend1/dist` to `pharmacy-backend/public`:
   - **Windows (PowerShell):**
     ```powershell
     Copy-Item -Path "pharmacy-frontend1\dist\*" -Destination "pharmacy-backend\public\" -Recurse -Force
     ```
   - **Windows (Command Prompt):**
     ```cmd
     xcopy /E /I /Y "pharmacy-frontend1\dist\*" "pharmacy-backend\public\"
     ```
   - **Linux/Mac:**
     ```bash
     cp -r pharmacy-frontend1/dist/* pharmacy-backend/public/
     ```

### Step 3: Ensure Backend Dependencies are Installed

1. Navigate to the backend directory:
```bash
cd pharmacy-backend
```

2. Install dependencies (if not already installed):
```bash
npm install
```

Make sure `pkg` is installed:
```bash
npm install --save-dev pkg
```

### Step 4: Create/Update .env File

Create a `.env` file in `pharmacy-backend` directory with your MongoDB connection:

```env
PORT=5000
MONGO_URI=mongodb://localhost:27017
DB_NAME=pharmacy_pos
JWT_SECRET=your_secret_key_here_change_this
```

**For MongoDB Atlas:**
```env
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
DB_NAME=pharmacy_pos
JWT_SECRET=your_secret_key_here_change_this
```

### Step 5: Build the Executable

Run the build command:
```bash
npm run build:exe
```

This will:
- Package the backend server
- Include the frontend files from `public` folder
- Create `PharmacyPOS.exe` in the `pharmacy-backend` directory

### Step 6: Prepare Distribution Package

To distribute your application, you need:

1. **PharmacyPOS.exe** - The main executable
2. **.env file** - Configuration file (users will need to edit this with their MongoDB connection)
3. **MongoDB** - Users must have MongoDB installed or use MongoDB Atlas

**Optional:** Create a README.txt with instructions for end users.

---

## Automated Build Script (Optional)

You can create a build script to automate steps 1-5. See `build-exe.bat` (Windows) or `build-exe.sh` (Linux/Mac) in the project root.

---

## Important Notes

### For End Users:

1. **MongoDB Required**: Users must have MongoDB running locally OR use MongoDB Atlas
2. **.env File**: Users need to edit the `.env` file with their MongoDB connection string
3. **First Run**: The application will create the database automatically on first run
4. **Port**: The application runs on port 5000 by default (can be changed in .env)

### Troubleshooting:

- **"Cannot find module" errors**: Make sure all dependencies are installed before building
- **Frontend not loading**: Ensure you copied the frontend build to `pharmacy-backend/public`
- **MongoDB connection errors**: Check the `.env` file has correct MongoDB URI
- **Large file size**: The .exe includes Node.js runtime, so it will be ~50-100MB

---

## Alternative: Using Electron (For Desktop App with UI)

If you want a more traditional desktop application with its own window (instead of opening in a browser), you can use Electron. This requires additional setup but provides a better desktop experience.

Would you like instructions for Electron setup?

