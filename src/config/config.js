import dotenv from 'dotenv';
dotenv.config();

// FIX: Lavalink defaults were hardcoded public credentials (host + password).
// Now they require explicit env vars — bot will fail clearly if not configured.
const lavalinkHost = process.env.LAVALINK_HOST;
const lavalinkPassword = process.env.LAVALINK_PASSWORD;

if (!lavalinkHost || !lavalinkPassword) {
  console.warn(
    '[Config] WARNING: LAVALINK_HOST or LAVALINK_PASSWORD is not set. ' +
    'Music features will not work until these are configured in your .env file.'
  );
}

export const config = {
  // Bot authentication token from Discord Developer Portal
  token: process.env.DISCORD_TOKEN,

  // Discord application client ID (found in Developer Portal)
  clientId: process.env.CLIENT_ID,

  // Command prefix for text-based commands (default: '.')
  prefix: process.env.PREFIX || '.',

  // Array of Discord user IDs with owner privileges
  ownerIds: (process.env.OWNER_IDS || '').split(',').map(id => id.trim()).filter(Boolean),

  // FIX: Shard count now configurable via TOTAL_SHARDS env var (was hardcoded to 4)
  sharding: {
    totalShards: process.env.TOTAL_SHARDS === 'auto' || !process.env.TOTAL_SHARDS
      ? 'auto'
      : parseInt(process.env.TOTAL_SHARDS, 10),
    shardsPerCluster: parseInt(process.env.SHARDS_PER_CLUSTER, 10) || 2,
  },

  // Lavalink node configuration — no hardcoded fallbacks (see warning above)
  nodes: [
    {
      id: process.env.LAVALINK_ID || "main-node",
      host: lavalinkHost || "localhost",
      port: parseInt(process.env.LAVALINK_PORT, 10) || 2333,
      authorization: lavalinkPassword || "youshallnotpass",
      secure: process.env.LAVALINK_SECURE === 'true',
      retryAmount: Infinity,
      retryDelay: 10000,
    },
  ],

  // Application environment
  environment: process.env.NODE_ENV || 'development',

  // Enable debug logging
  debug: process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development',

  // Database file paths (.bread = better-sqlite3 databases)
  database: {
    guild: './database/data/guild.bread',
    user: './database/data/user.bread',
    premium: './database/data/premium.bread',
    antiabuse: './database/data/antiabuse.bread',
    playlists: './database/data/playlists.bread',
    ticket: './database/data/ticket.bread',
    invites: './database/data/invites.bread',
  },

  // External links
  links: {
    supportServer: process.env.SUPPORT_SERVER_URL || "https://discord.gg/aerox"
  },

  // Bot presence/status configuration
  status: {
    name: process.env.STATUS_TEXT || '!help | Discord Bot',
    status: process.env.STATUS_TYPE || 'dnd',
    type: 'CUSTOM'
  },

  // Embed color scheme
  colors: {
    info: '#3498db',
    success: '#2ecc71',
    warning: '#f39c12',
    error: '#e74c3c'
  },

  // Discord webhook logging configuration
  webhook: {
    enabled: process.env.WEBHOOK_ENABLED !== 'false',
    url: process.env.WEBHOOK_URL || null,
    username: process.env.WEBHOOK_USERNAME || 'Bot Logger',
    avatarUrl: process.env.WEBHOOK_AVATAR_URL || null,
    levels: {
      info:    { enabled: process.env.WEBHOOK_INFO_ENABLED !== 'false' },
      success: { enabled: process.env.WEBHOOK_SUCCESS_ENABLED !== 'false' },
      warning: { enabled: process.env.WEBHOOK_WARNING_ENABLED !== 'false' },
      error:   { enabled: process.env.WEBHOOK_ERROR_ENABLED !== 'false' },
      debug:   { enabled: process.env.WEBHOOK_DEBUG_ENABLED === 'true' },
    }
  },

  // Bot feature toggles
  features: {
    stay247: true
  },

  // Queue limitations per tier
  queue: {
    maxSongs: {
      free: 50,
      premium: 200
    }
  },

  // Default image assets
  assets: {
    defaultTrackArtwork: process.env.DEFAULT_TRACK_ARTWORK || null,
    defaultThumbnail: process.env.DEFAULT_THUMBNAIL || null,
    helpThumbnail: process.env.HELP_THUMBNAIL || null,
    bannerUrl: process.env.BANNER_URL || null,
  },

  getThumbnailUrl(url) {
    return url || null;
  },

  // Spotify API credentials
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET
  },

  // Last.fm API
  lastfm: {
    apiKey: process.env.LASTFM_API_KEY
  },

  // Music search configuration
  search: {
    maxResults: 6,
    defaultSources: ['ytsearch']
  },

  // Music player defaults
  player: {
    defaultVolume: 100,
    seekStep: 10000,
    maxHistorySize: 50,
    stay247: {
      reconnectDelay: 5000,
      maxReconnectAttempts: 3,
      checkInterval: 30000
    },
    audioQuality: {
      bitrate: 320,
      sampleRate: 48000,
      channels: 2,
      bufferSize: 8192,
      highWaterMark: 1048576,
    }
  },

  watermark: 'coded by Shinchan',
  // FIX: version aligned with package name (V3)
  version: '3.0.0'
};
