require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose  = require("mongoose");
const User      = require("../src/models/User");
const Programme = require("../src/models/Programme");

async function setup() {
  console.log("\n LaunchOS Backend Setup\n");
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not set in .env");
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  console.log("MongoDB connected:", mongoose.connection.host);

  await User.createIndexes();
  await Programme.createIndexes();
  const { Cohort, Session, Message, Notification } = require("../src/models/Cohort");
  await Cohort.createIndexes(); await Session.createIndexes();
  await Message.createIndexes(); await Notification.createIndexes();
  console.log("Indexes created");

  const adminEmail = process.env.ADMIN_EMAIL || "admin@launchos.in";
  const existing   = await User.findOne({ email: adminEmail });
  if (existing) {
    console.log("Admin exists:", adminEmail);
  } else {
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD in .env before running setup");
    await User.create({ name: process.env.ADMIN_NAME || "LaunchOS Admin", email: adminEmail, password: process.env.ADMIN_PASSWORD, role:"admin", status:"active" });
    console.log("Admin created:", adminEmail, "(password = ADMIN_PASSWORD from .env)");
  }

  if (process.env.NODE_ENV !== "production") {
    const count = await User.countDocuments({ role:"founder" });
    if (count === 0) {
      const t1 = await User.create({ name:"Dr Meera Iyer", email:"meera@launchos.in", password:"Trainer@123", role:"trainer", status:"active", city:"Bengaluru", trainerProfile:{ specialty:"Sales and SPARC", role:"mentor" } });
      const t2 = await User.create({ name:"Rajiv Nair",    email:"rajiv@launchos.in",  password:"Trainer@123", role:"trainer", status:"active", city:"Mumbai",    trainerProfile:{ specialty:"BMC and Offer Design", role:"trainer" } });
      const admin = await User.findOne({ role:"admin" });
      const cohort = await Cohort.create({ name:"Cohort 1 - March 2026", status:"active", capacity:10, trainers:[t1._id,t2._id], createdBy:admin._id, startDate:new Date("2026-03-01"), endDate:new Date("2026-08-31") });
      const founders = [
        { name:"Arjun Sharma", email:"arjun@startup.in",  city:"Hyderabad", founderProfile:{ businessName:"EdTech for Tier-2 cities",        businessType:"EdTech",    stage:6, cohortId:cohort._id, assignedTrainer:t1._id, enrolledAt:new Date() } },
        { name:"Divya Singh",  email:"divya@health.co",   city:"Delhi",     founderProfile:{ businessName:"Mental health app for corporates", businessType:"HealthTech",stage:5, cohortId:cohort._id, assignedTrainer:t1._id, enrolledAt:new Date() } },
        { name:"Priya Mehta",  email:"priya@ventures.co", city:"Mumbai",    founderProfile:{ businessName:"D2C organic skincare brand",       businessType:"D2C",       stage:9, cohortId:cohort._id, assignedTrainer:t2._id, enrolledAt:new Date() } },
        { name:"Rahul Gupta",  email:"rahul@scale.io",    city:"Bengaluru", founderProfile:{ businessName:"B2B SaaS for HR teams",           businessType:"SaaS B2B",  stage:4, cohortId:cohort._id, assignedTrainer:t2._id, enrolledAt:new Date() } },
      ];
      for (const fd of founders) {
        const u = await User.create({ ...fd, password:"Founder@123", role:"founder", status:"active" });
        await Programme.create({ founderId: u._id });
        await Cohort.findByIdAndUpdate(cohort._id, { $push:{ founders:u._id } });
      }
      console.log("\nDemo data created:");
      console.log("  Startup founder: arjun@startup.in / Founder@123");
      console.log("  Trainer/mentor:  meera@launchos.in / Trainer@123");
      console.log("  Admin:           admin@launchos.in / (from .env)");
    }
  }

  await mongoose.connection.close();
  console.log("\nSetup complete! Run: npm start");
}

setup().catch(err => { console.error(err); process.exit(1); });
