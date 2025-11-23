const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/db');
const { startExpiryCron } = require('./cron/expiryCron');

dotenv.config();

console.log("SMTP_USER:", process.env.SMTP_USER);
console.log("ADMIN_EMAIL:", process.env.ADMIN_EMAIL);

const app = express();
app.use(cookieParser());

// CORS for Vercel frontend
app.use(cors({
  origin: process.env.FRONTEND_URL,
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

app.use('/api', require('./routes/testEmailRoute'));   
app.get('/', (req, res) => res.json({ message: 'API Running' }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ msg: 'Server error' });
});

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    // start cron after DB is ready
    startExpiryCron();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  });
