const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');

dotenv.config();
const app = express();
app.use(cookieParser());

// CORS for Vercel frontend
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://client-eight-rust.vercel.app',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' })); 
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/sites', require('./routes/siteRoutes'));
app.use('/api/workers', require('./routes/workerRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/salary', require('./routes/salaryRoutes'));

// Health check
app.get('/', (req, res) => res.json({ message: 'API Running' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ msg: 'Server error' });
});

const PORT = process.env.PORT || 5000;

// Start server only after DB connects
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });