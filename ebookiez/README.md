# Ebookiez – Skincare eBook Store

A full-stack React + Node.js eBook store with Razorpay integration (test mode).

## 🧠 Features
- Sample skincare eBooks with images & prices
- Secure Razorpay Checkout (test mode)
- Express backend for order creation
- Tailwind CSS UI

## 🚀 Setup
1. Clone or unzip this project.
2. Install dependencies:
   ```bash
   cd client && npm install
   cd ../server && npm install
   ```
3. Create `.env` files from `.env.example` and add Razorpay test keys.
4. Run backend:
   ```bash
   cd server
   node server.js
   ```
5. Run frontend:
   ```bash
   cd client
   npm start
   ```

Visit http://localhost:3000 to test the app.

## 🧾 Deployment
- Frontend: Netlify or Vercel
- Backend: Render or Railway
- Update `REACT_APP_API_BASE` to your deployed backend URL.
