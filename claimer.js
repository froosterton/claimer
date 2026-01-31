console.log('[CLAIM] Script starting...');

const { Client } = require('discord.js-selfbot-v13');
const axios = require('axios');

// Patch ClientUserSettingManager to handle missing/null data from Discord READY payload
const clientUserSettingsPath = require.resolve(
  'discord.js-selfbot-v13/src/managers/ClientUserSettingManager'
);
const ClientUserSettingManager = require(clientUserSettingsPath);
const originalPatch = ClientUserSettingManager.prototype._patch;
ClientUserSettingManager.prototype._patch = function (data = {}) {
  const safe = {
    ...data,
    friend_source_flags: data.friend_source_flags ?? {},
    guild_folders: data.guild_folders ?? [],
    guild_positions: data.guild_positions ?? [],
    muted_channels: data.muted_channels ?? [],
    mute_config: data.mute_config ?? {},
    user_guild_settings: data.user_guild_settings ?? {},
    user_settings: data.user_settings ?? {},
  };
  return originalPatch.call(this, safe);
};

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLAIM_AUTH_TOKEN = process.env.CLAIM_AUTH_TOKEN || DISCORD_TOKEN;
const CLAIM_SERVER_ID = process.env.CLAIM_SERVER_ID;
const CLAIM_GROUP_DM_ID = process.env.CLAIM_GROUP_DM_ID;
const SOURCE_SERVER_ID = process.env.SOURCE_SERVER_ID || CLAIM_SERVER_ID;
const EMBED_BOT_ID = process.env.EMBED_BOT_ID;

if (!CLAIM_AUTH_TOKEN || !CLAIM_SERVER_ID || !CLAIM_GROUP_DM_ID) {
  console.error('Missing env variables. Check CLAIM_AUTH_TOKEN (or DISCORD_TOKEN), CLAIM_SERVER_ID, CLAIM_GROUP_DM_ID.');
  process.exit(1);
}

console.log('[CLAIM] Env OK. Connecting to Discord...');

let lastWebhookDiscordUser = null;

const client = new Client({ checkUpdate: false });

client.on('ready', () => {
  console.log(`[CLAIM] Logged in as ${client.user.tag}`);
});

client.on('messageCreate', (msg) => {
  try {
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

    // Check message content first (even if no embeds)
    const content = msg.content || '';
    if (content.toLowerCase().includes('discord:')) {
      // Try to extract Discord tag from various formats
      // Format: "Discord: User Ratted Successfully! ✅ Target : Azome (crimgonspin)"
      // Extract the part after "Target :" or just the Discord tag
      let candidate = null;
      
      // Try pattern: "Target : username (discordtag)" or "Target : discordtag"
      const targetMatch = content.match(/target\s*:\s*([^(]+)\s*\(([^)]+)\)/i);
      if (targetMatch && targetMatch[2]) {
        candidate = targetMatch[2].trim();
      } else {
        // Try pattern: "Discord: ... Target : username"
        const targetMatch2 = content.match(/target\s*:\s*([^\n✅]+)/i);
        if (targetMatch2 && targetMatch2[1]) {
          candidate = targetMatch2[1].trim();
        } else {
          // Fallback: extract everything after "Discord:"
          const discordMatch = content.match(/discord:\s*([^\n]+)/i);
          if (discordMatch && discordMatch[1]) {
            candidate = discordMatch[1].replace(/[*`✅]/g, '').trim();
          }
        }
      }
      
      if (candidate) {
        lastWebhookDiscordUser = candidate;
        console.log(`[TRACKER] Stored tag from message content: ${lastWebhookDiscordUser}`);
        return;
      }
    }

    // Check embeds if they exist
    if (!msg.embeds?.length) return;

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

// Log Discord tag whenever any message is sent in claim server
client.on('messageCreate', (msg) => {
  try {
    if (!msg.guild) return;
    if (msg.guild.id !== CLAIM_SERVER_ID) return;
    if (msg.author?.bot) return;

    if (lastWebhookDiscordUser) {
      console.log(`[CLAIM] Discord tag: ${lastWebhookDiscordUser}`);
    }
  } catch (err) {
    console.error('Message logger error:', err?.message || err);
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

    console.log(`[CLAIM] Sending claim for ${lastWebhookDiscordUser} to ${CLAIM_GROUP_DM_ID}`);
    await axios.post(
      `https://discord.com/api/v9/channels/${CLAIM_GROUP_DM_ID}/messages`,
      { content: `${lastWebhookDiscordUser}` },
      { headers: { Authorization: CLAIM_AUTH_TOKEN } }
    );

    console.log('[CLAIM] Claim sent. Resetting stored user.');
    lastWebhookDiscordUser = null;
  } catch (err) {
    console.error('Claim handler error:', err?.response?.data || err.message);
  }
});

client.login(CLAIM_AUTH_TOKEN).catch((err) => {
  console.error('[CLAIM] Login failed:', err?.message || err);
  process.exit(1);
});
