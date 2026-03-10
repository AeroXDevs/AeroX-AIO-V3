import { logger } from "#utils/logger";

// FIX: Clean up inviteCache when bot leaves a guild to prevent memory leak.
// Previously, invite cache entries were never removed when the bot left a guild.
export default {
  name: "guildDelete",
  async execute(guild, client) {
    if (client.inviteCache?.has(guild.id)) {
      client.inviteCache.delete(guild.id);
      logger.debug("GuildDelete", `Cleaned invite cache for guild ${guild.id} (${guild.name})`);
    }
  },
};
