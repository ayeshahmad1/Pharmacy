# How to Run the Pharmacy POS System

## Prerequisites
- Node.js installed (v14 or higher)
- MongoDB installed and running, or MongoDB Atlas connection string
- npm or yarn package manager

---

## Step 1: Backend Setup

1. Navigate to the backend directory:
```bash
cd pharmacy-backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the `pharmacy-backend` directory with the following:
```env
PORT=5000
MONGO_URI=mongodb://localhost:27017
DB_NAME=pharmacy_pos
JWT_SECRET=your_secret_key_here
```

**Note:** If using MongoDB Atlas, use your connection string:
```env
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
```

4. Start the backend server:
```bash
# Development mode (with auto-restart)
npm run dev

# OR Production mode
npm start
```

The backend will run on `http://localhost:5000`

---

## Step 2: Frontend Setup

1. Open a new terminal and navigate to the frontend directory:
```bash
cd pharmacy-frontend1
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the `pharmacy-frontend1` directory:
```env
VITE_API_URL=http://localhost:5000/api
```

4. Start the frontend development server:
```bash
npm run dev
```

The frontend will typically run on `http://localhost:5173` (Vite default port)

---

## Step 3: Access the Application

1. Open your browser and go to: `http://localhost:5173`
2. You'll see the login page
3. Register a new account or login with existing credentials
4. Based on your role:
   - **Admin**: Can access dashboard, manage inventory, view sales
   - **Cashier**: Can access billing page to process sales

---

## Troubleshooting

### Backend won't start
- Make sure MongoDB is running (if using local MongoDB)
- Check that the `.env` file exists and has correct values
- Ensure port 5000 is not already in use

### Frontend can't connect to backend
- Verify backend is running on port 5000
- Check that `VITE_API_URL` in frontend `.env` is correct
- Make sure there are no CORS issues (cors middleware should handle this)

### MongoDB connection errors
- Verify MongoDB is running: `mongod` or check MongoDB service
- Double-check the `MONGO_URI` in backend `.env`
- If using MongoDB Atlas, ensure your IP is whitelisted

---

## Available Scripts

### Backend
- `npm run dev` - Start with nodemon (auto-restart on changes)
- `npm start` - Start production server

### Frontend
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build


