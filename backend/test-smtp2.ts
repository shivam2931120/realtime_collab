import nodemailer from 'nodemailer';
import 'dotenv/config';

// Log what dotenv actually reads to check for hidden chars
const pass = process.env.SMTP_PASS || "";
console.log("Pass length:", pass.length);
console.log("Pass chars:", [...pass].map(c => c.charCodeAt(0)));
console.log("Pass repr:", JSON.stringify(pass));
