const { Client } = require('discord.js-selfbot-v13');
const axios = require('axios');

const TOKEN = process.env.DISCORD_TOKEN;
const CLAIM_SERVER_ID = process.env.CLAIM_SERVER_ID;
const CLAIM_GROUP_DM_ID = process.env.CLAIM_GROUP_DM_ID;
const SOURCE_SERVER_ID = process.env.SOURCE_SERVER_ID || CLAIM_SERVER_ID;
const EMBED_BOT_ID = process.env.EMBED_BOT_ID;

if (!TOKEN || !CLAIM_SERVER_ID || !CLAIM_GROUP_DM_ID) {
  console.error('Missing env variables. Check DISCORD_TOKEN, CLAIM_SERVER_ID, CLAIM_GROUP_DM_ID.');
  process.exit(1);
}

let lastWebhookDiscordUser = null;

const client = new Client({ checkUpdate: false });

client.on('ready', () => {
  console.log(`[CLAIM] Logged in as ${client.user.tag}`);
});

client.on('messageCreate', (msg) => {
  try {
    if (!msg.embeds?.length) return;
    const authorId = msg.author?.id;
    const webhookId = msg.webhookId;
    const guildId = msg.guild?.id;

    if (SOURCE_SERVER_ID && guildId !== SOURCE_SERVER_ID) return;

    if (
      EMBED_BOT_ID &&
      authorId !== EMBED_BOT_ID &&
      webhookId !== EMBED_BOT_ID
    ) {
      return;
    }

    const contentMatch = (msg.content || '').match(/discord:\s*([^\n]+)/i);
    if (contentMatch && contentMatch[1]) {
      const candidate = contentMatch[1].replace(/[*`]/g, '').trim();
      if (candidate) {
        lastWebhookDiscordUser = candidate;
        console.log(`[TRACKER] Stored tag from message content: ${lastWebhookDiscordUser}`);
        return;
      }
    }

    for (const embed of msg.embeds) {
      const embedData = embed?.data ?? embed;

      if (Array.isArray(embedData?.fields)) {
        for (const field of embedData.fields) {
          const name = (field.name || '').toLowerCase();
          if (!name.includes('discord')) continue;

          const value = String(field.value || '')
            .replace(/[*`]/g, '')
            .trim();

          if (value) {
            lastWebhookDiscordUser = value;
            console.log(`[TRACKER] Stored tag from embed field: ${lastWebhookDiscordUser}`);
            return;
          }
        }
      }

      const titleMatch = (embedData?.title || '').match(/discord:\s*([^\n]+)/i);
      if (titleMatch && titleMatch[1]) {
        const candidate = titleMatch[1].replace(/[*`]/g, '').trim();
        if (candidate) {
          lastWebhookDiscordUser = candidate;
          console.log(`[TRACKER] Stored tag from embed title: ${lastWebhookDiscordUser}`);
          return;
        }
      }

      const description = embedData?.description || '';
      const match = description.match(/\*\*Discord:\*\*\s*([^\n]+)/i);
      if (match && match[1]) {
        const candidate = match[1].replace(/[*`]/g, '').trim();
        if (candidate) {
          lastWebhookDiscordUser = candidate;
          console.log(`[TRACKER] Stored tag from embed description: ${lastWebhookDiscordUser}`);
          return;
        }
      }
    }
  } catch (err) {
    console.error('Tracker error:', err?.message || err);
  }
});

client.on('messageCreate', async (msg) => {
  try {
    if (!msg.guild) return;
    if (msg.guild.id !== CLAIM_SERVER_ID) return;

    const raw = (msg.content || '').trim();
    if (raw.toLowerCase() !== 'c') return;

    if (!lastWebhookDiscordUser) {
      console.log('[CLAIM] Nothing to claim yet.');
      return;
    }

    console.log(`[CLAIM] Discord tag: ${lastWebhookDiscordUser}`);

    console.log(`[CLAIM] Sending claim for ${lastWebhookDiscordUser} to ${CLAIM_GROUP_DM_ID}`);
    await axios.post(
      `https://discord.com/api/v9/channels/${CLAIM_GROUP_DM_ID}/messages`,
      { content: `${lastWebhookDiscordUser}` },
      { headers: { Authorization: TOKEN } }
    );

    console.log('[CLAIM] Claim sent. Resetting stored user.');
    lastWebhookDiscordUser = null;
  } catch (err) {
    console.error('Claim handler error:', err?.response?.data || err.message);
  }
});

client.login(TOKEN);
