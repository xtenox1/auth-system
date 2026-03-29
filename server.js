const axios = require("axios");
const mongoose = require("mongoose");

mongoose.connect("process.env.MONGO_URI")
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.log("❌ DB Error:", err));

const express = require("express");
const nodemailer = require("nodemailer");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
app.use(bodyParser.json());
app.use(cors());

// 🔥 عرض الموقع
app.use(express.static(__dirname));

let otps = {};
let ipAttempts = {};
let blockedIPs = {};

// 📧 إعداد Gmail
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "cysabbas18@gmail.com",
    pass: "stxo jwzn qwjt kdlt"
  }
});

// 🧱 Models
const UserSchema = new mongoose.Schema({
  email: String,
  password: String
});
const User = mongoose.model("User", UserSchema);

const LogSchema = new mongoose.Schema({
  type: String,
  message: String,
  email: String,
  time: String
});
const Log = mongoose.model("Log", LogSchema);

// 📝 دالة تسجيل اللوق
async function addLog(type, message, email) {
  try {
    await Log.create({
      type,
      message,
      email,
      time: new Date().toLocaleString()
    });
    console.log("LOG SAVED ✅");
  } catch (err) {
    console.log("LOG ERROR ❌", err);
  }
}

// 📝 Register
app.post("/register", async (req, res) => {
  const { email, password } = req.body;

  const existing = await User.findOne({ email });
  if (existing) {
    return res.json({ message: "User already exists" });
  }

  const user = new User({ email, password });
  await user.save();

  await transporter.sendMail({
    from: "cysabbas18@gmail.com",
    to: email,
    subject: "Welcome 🎉",
    text: "You have successfully registered!"
  });

  res.json({ message: "User registered & email sent" });
});

// 🔐 Login
app.post("/login", async (req, res) => {
  try {
    const email = req.body.email.toLowerCase();
    const password = req.body.password;

    // 🌐 جلب IP
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0] ||
      req.socket.remoteAddress ||
      req.ip;

    const now = Date.now();

    // 📊 تتبع المحاولات
    if (!ipAttempts[ip]) {
      ipAttempts[ip] = [];
    }

    ipAttempts[ip] = ipAttempts[ip].filter(t => now - t < 60000);

    const user = await User.findOne({ email });

    // ❌ خطأ تسجيل الدخول
    if (!user || user.password !== password) {

      ipAttempts[ip].push(now);

      await addLog("FAILED_LOGIN", "Invalid login attempt", email);

      // 🚨 كشف الهجوم
      if (ipAttempts[ip].length >= 5) {

        let lat = null;
        let lon = null;

        try {
          const response = await axios.get("http://ip-api.com/json/");
          lat = response.data.lat;  0;
          lon = response.data.lon;  0;
        } catch (err) {
          console.log("IP LOCATION ERROR ❌");
        }

        await addLog(
          "ATTACK",
          `IP: ${ip} | LAT: ${lat} | LON: ${lon},
          email`
        );

        return res.status(429).json({
          message: "Too many attempts! Attack detected 🚨"
        });
      }

      return res.status(400).json({
        message: "Invalid credentials"
      });
    }

    // ✅ نجاح تسجيل الدخول
    await addLog("LOGIN_SUCCESS", "User logged in", email);

    // 🔢 إنشاء OTP
    const otp = Math.floor(100000 + Math.random() * 900000);
    otps[email] = otp;

    console.log("OTP for", email, ":", otp);

    // 📧 إرسال OTP
    await transporter.sendMail({
      from: "cysabbas18@gmail.com",
      to: email,
      subject: "OTP Code",
      text: `Your code is: ${otp}`   // ✅ تم التصحيح
    });

    return res.json({
      message: "OTP sent",
      email: email
    });

  } catch (err) {
    console.log("LOGIN ERROR ❌", err);
    return res.status(500).json({
      message: "Server error"
    });
  }
});

app.get("/check-logs", async (req, res) => {
  const logs = await Log.find();
  res.json(logs);
});
// 🔢 Verify OTP
app.post("/verify", async (req, res) => {
  try {
    const { email, otp } = req.body;

    console.log("VERIFY REQUEST:", email, otp);

    // ✅ OTP صحيح
    if (otps[email] == otp) {
      delete otps[email];

      await addLog("OTP_SUCCESS", "Correct OTP", email);

      return res.json({ message: "Login successful" });

    } 
    // ❌ OTP خطأ
    else {
      await addLog("OTP_FAILED", "Wrong OTP", email);

      return res.status(400).json({ message: "Invalid OTP" });
    }

  } catch (err) {
    console.log("VERIFY ERROR ❌", err);
    return res.status(500).json({ message: "Server error" });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});
