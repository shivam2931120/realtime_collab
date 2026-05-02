import nodemailer from 'nodemailer';
import 'dotenv/config';

// Gmail app passwords must NOT have spaces — the spaces in the app password display are for readability
// The actual password to use has all spaces removed
const rawPass = process.env.SMTP_PASS || "";
const pass = rawPass.replace(/\s+/g, ""); // strip ALL spaces/whitespace

console.log("Raw pass repr:", JSON.stringify(rawPass));
console.log("Cleaned pass repr:", JSON.stringify(pass));
console.log("Cleaned pass length:", pass.length); // should be 16

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: process.env.SMTP_USER, pass }
});

(async () => {
    try {
        await transporter.verify();
        console.log("✅ SMTP connected!");
    } catch (e: any) {
        console.error("❌ SMTP ERROR:", e.message);
    }
})();
