import nodemailer from 'nodemailer';
import 'dotenv/config';

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

(async () => {
    try {
        await transporter.verify();
        console.log("✅ SMTP connected successfully!");
        
        // Send a real test email
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: process.env.SMTP_USER, // send to self as test
            subject: "Test - Document Sharing Works",
            text: "SMTP is working correctly from your realtime-collab backend.",
            html: "<h2>✅ SMTP Working!</h2><p>Email notifications for document sharing are now active.</p>"
        });
        console.log("✅ Test email sent to", process.env.SMTP_USER);
    } catch (e: any) {
        console.error("❌ SMTP ERROR:", e.message);
    }
})();
