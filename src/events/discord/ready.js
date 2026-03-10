import { ActivityType, ContainerBuilder, TextDisplayBuilder, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags } from "discord.js";
import { logger } from "#utils/logger";
import { config } from "#config/config";
import { db } from "#database/DatabaseManager";
import { antiAbuse } from "#utils/AntiAbuse";
import fs from "fs";
import path from "path";
import { AttachmentBuilder } from "discord.js";
import emoji from "#config/emoji";

export default {
  name: "clientReady",
  once: true,
  async execute(client) {
    logger.info("Bot", "Scheduling database backups every 30 minutes");

    const { user, guilds } = client;
    logger.success("Bot", `Logged in as ${user.tag}`);
    logger.info("Bot", `Serving ${guilds.cache.size} guilds`);

    if (config.features.stay247) {
      logger.info(
        "Bot",
        "Waiting 10 seconds for Lavalink to be ready before initializing 24/7 mode...",
      );
      setTimeout(async () => {
        await initialize247Mode(client);

        setInterval(
          () => check247Connections(client),
          config.player.stay247.checkInterval,
        );
      }, 10000);
    }

    const updateStatus = () => {
      user.setActivity({
        name: config.status.name,
        type: getStatusType(config.status.type),
      });
    };

    updateStatus();
    setInterval(updateStatus, 10 * 60 * 1000);
    user.setStatus(config.status.status || "dnd");

    logger.info("Bot", "Starting reminder scheduler (every 30 seconds)");
    setInterval(() => checkReminders(client), 30000);

    logger.info("Bot", "Starting anti-abuse data cleanup (every 24 hours)");
    setInterval(async () => {
      try {
        antiAbuse.cleanupOldData();
        logger.debug("Bot", "Anti-abuse data cleanup completed");
      } catch (e) {
        logger.error("Bot", "Anti-abuse cleanup failed:", e);
      }
    }, 24 * 60 * 60 * 1000);
    checkReminders(client);

    logger.info("Bot", "Initializing invite cache for all guilds...");
    await initializeInviteCache(client);
  },
};

async function initializeInviteCache(client) {
  try {
    client.inviteCache = new Map();
    
    for (const [guildId, guild] of client.guilds.cache) {
      try {
        db.invites.ensureGuildSettings(guildId);
        db.invites.setTrackingEnabled(guildId, true);
        
        const invites = await guild.invites.fetch({ cache: false }).catch(() => null);
        if (invites) {
          const cacheMap = new Map();
          for (const [code, invite] of invites) {
            cacheMap.set(code, { uses: invite.uses, inviterId: invite.inviter?.id });
          }
          client.inviteCache.set(guildId, cacheMap);
        }
      } catch (error) {
        logger.debug("InviteCache", `Could not cache invites for guild ${guildId}: ${error.message}`);
      }
    }
    
    logger.success("Bot", `Invite cache initialized for ${client.inviteCache.size} guilds`);
  } catch (error) {
    logger.error("Bot", "Failed to initialize invite cache:", error);
  }
}

function getStatusType(type) {
  const types = {
    PLAYING: ActivityType.Playing,
    STREAMING: ActivityType.Streaming,
    LISTENING: ActivityType.Listening,
    WATCHING: ActivityType.Watching,
    COMPETING: ActivityType.Competing,
    CUSTOM: ActivityType.Custom,
  };
  return types[type] || ActivityType.Custom;
}

async function checkReminders(client) {
  try {
    const pendingReminders = db.getPendingReminders();
    
    if (pendingReminders.length === 0) return;
    
    logger.debug("Reminders", `Found ${pendingReminders.length} pending reminder(s)`);
    
    for (const reminder of pendingReminders) {
      try {
        const user = await client.users.fetch(reminder.user_id).catch(() => null);
        
        if (user) {
          const container = new ContainerBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(`${emoji.get("remind")} **Reminder!**`)
            )
            .addSeparatorComponents(
              new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
            )
            .addSectionComponents(
              new SectionBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                  `You asked me to remind you:\n\n` +
                  `**Message:** ${reminder.message}\n` +
                  `**Set at:** <t:${Math.floor(reminder.created_at / 1000)}:R>`
                )
              )
            );
          
          await user.send({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
          }).catch((err) => {
            logger.warn("Reminders", `Could not DM user ${reminder.user_id}: ${err.message}`);
          });
          
          logger.debug("Reminders", `Sent reminder DM to user ${reminder.user_id}`);
        }
        
        db.markReminded(reminder.id);
      } catch (error) {
        logger.error("Reminders", `Failed to process reminder ${reminder.id}:`, error);
        db.markReminded(reminder.id);
      }
    }
  } catch (error) {
    logger.error("Reminders", "Failed to check reminders:", error);
  }
}

async function waitForLavalink(client, maxAttempts = 30) {
  logger.info("247Mode", "Checking Lavalink connection status...");

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      if (client.music && client.music.lavalink) {
        const nodes = client.music.lavalink.nodeManager.nodes;

        if (nodes) {
          logger.success(
            "247Mode",
            `Lavalink ready! ${nodes.length} node(s) connected`,
          );
          return true;
        }
      }

      logger.debug(
        "247Mode",
        `Lavalink not ready yet, attempt ${attempt}/${maxAttempts}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      logger.warn(
        "247Mode",
        `Error checking Lavalink status (attempt ${attempt}):${error.message}`,
      );
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  logger.error("247Mode", "Lavalink failed to connect within timeout period");
  return false;
}

async function initialize247Mode(client) {
  try {
    const lavalinkReady = await waitForLavalink(client);
    if (!lavalinkReady) {
      logger.error(
        "247Mode",
        "Cannot initialize 24/7 mode - Lavalink not available",
      );
      return;
    }

    const guilds247 = db.guild.getValid247Guilds();
    logger.info(
      "247Mode",
      `Found ${guilds247.length} guilds with valid 24/7 configuration`,
    );

    if (guilds247.length === 0) {
      logger.info("247Mode", "No guilds with 24/7 mode enabled");
      return;
    }

    const connectionPromises = guilds247.map((guildData, index) => {
      return new Promise((resolve) => {
        setTimeout(async () => {
          try {
            await connect247Guild(client, guildData);
            resolve();
          } catch (error) {
            logger.error(
              "247Mode",
              `Failed to connect guild ${guildData.id}:`,
              error,
            );
            resolve();
          }
        }, index * 2000);
      });
    });

    await Promise.all(connectionPromises);
    logger.success("247Mode", "24/7 mode initialization completed");
  } catch (error) {
    logger.error("247Mode", "Failed to initialize 247 mode:", error);
  }
}

async function connect247Guild(client, guildData) {
  try {
    const guild = client.guilds.cache.get(guildData.id);
    if (!guild) {
      logger.warn(
        "247Mode",
        `Guild ${guildData.id} not found, removing from 24/7 list`,
      );
      db.guild.set247Mode(guildData.id, false);
      return;
    }

    const voiceChannel = guild.channels.cache.get(
      guildData.stay_247_voice_channel,
    );
    if (!voiceChannel || voiceChannel.type !== 2) {
      logger.warn(
        "247Mode",
        `Invalid voice channel for guild ${guild.name}, disabling 24/7 mode`,
      );
      db.guild.set247Mode(guild.id, false);
      return;
    }

    let textChannel = null;
    if (guildData.stay_247_text_channel) {
      textChannel = guild.channels.cache.get(guildData.stay_247_text_channel);
      if (!textChannel || (textChannel.type !== 0 && textChannel.type !== 5)) {
        logger.warn(
          "247Mode",
          `Invalid text channel for guild ${guild.name}, using voice channel as fallback`,
        );
        textChannel = voiceChannel;
      }
    } else {
      textChannel = voiceChannel;
    }

    const existingPlayer = client.music?.getPlayer(guild.id);
    if (existingPlayer && existingPlayer.voiceChannelId) {
      logger.debug(
        "247Mode",
        `Player already exists for guild ${guild.name}, updating 24/7 flags`,
      );
      existingPlayer.set("247Mode", true);
      existingPlayer.set("247VoiceChannel", voiceChannel.id);
      existingPlayer.set("247TextChannel", textChannel.id);
      return;
    }

    const botMember = guild.members.cache.get(client.user.id);
    if (!voiceChannel.permissionsFor(botMember).has(["Connect", "Speak"])) {
      logger.warn(
        "247Mode",
        `Missing permissions for voice channel ${voiceChannel.name} in guild ${guild.name}`,
      );
      return;
    }

    logger.info(
      "247Mode",
      `Connecting to 24/7 channel ${voiceChannel.name} in guild ${guild.name}`,
    );

    const player = client.music.createPlayer({
      guildId: guild.id,
      textChannelId: textChannel.id,
      voiceChannelId: voiceChannel.id,
      selfMute: false,
      selfDeaf: true,
      volume: db.guild.getDefaultVolume(guild.id),
    });
    
    
    player.set("247Mode", true);
    player.set("247VoiceChannel", voiceChannel.id);
    player.set("247TextChannel", textChannel.id);
    player.set("247LastConnected", Date.now());

    logger.success(
      "247Mode",
      `Connected to 24/7 channel ${voiceChannel.name} in guild ${guild.name}`,
    );
  } catch (error) {
    logger.error(
      "247Mode",
      `Error connecting 24/7 for guild ${guildData.id}:`,
      error,
    );
  }
}

async function check247Connections(client) {
  try {
    const guilds247 = db.guild.getValid247Guilds();

    for (const guildData of guilds247) {
      try {
        await checkSingle247Connection(client, guildData);
      } catch (error) {
        logger.error("247Mode", `Error checking guild ${guildData.id}:`, error);
      }
    }
  } catch (error) {
    logger.error("247Mode", "Error in 247 connection check:", error);
  }
}

async function checkSingle247Connection(client, guildData) {
  const guild = client.guilds.cache.get(guildData.id);
  if (!guild) {
    logger.warn(
      "247Mode",
      `Guild ${guildData.id} not found, disabling 24/7 mode`,
    );
    db.guild.set247Mode(guildData.id, false);
    return;
  }

  const voiceChannel = guild.channels.cache.get(
    guildData.stay_247_voice_channel,
  );
  if (!voiceChannel || voiceChannel.type !== 2) {
    logger.warn(
      "247Mode",
      `Voice channel ${guildData.stay_247_voice_channel} no longer exists in guild ${guild.name}`,
    );
    db.guild.set247Mode(guild.id, false);
    return;
  }

  const player = client.music?.getPlayer(guild.id);

  if (
    !player ||
    !player.voiceChannelId ||
    player.voiceChannelId !== voiceChannel.id
  ) {
    logger.info(
      "247Mode",
      `Reconnecting to 24/7 channel ${voiceChannel.name} in guild ${guild.name}`,
    );

    try {
      if (
        player &&
        player.voiceChannelId &&
        player.voiceChannelId !== voiceChannel.id
      ) {
        await player.destroy();
      }

      let textChannel = guild.channels.cache.get(
        guildData.stay_247_text_channel,
      );
      if (!textChannel || (textChannel.type !== 0 && textChannel.type !== 5)) {
        textChannel = voiceChannel;
      }

      const newPlayer = client.music.createPlayer({
        guildId: guild.id,
        textChannelId: textChannel.id,
        voiceChannelId: voiceChannel.id,
        selfMute: false,
        selfDeaf: true,
        volume: db.guild.getDefaultVolume(guild.id),
      });
      if (!newPlayer.connected) {
        await newPlayer.connect();
      }
      newPlayer.set("247Mode", true);
      newPlayer.set("247VoiceChannel", voiceChannel.id);
      newPlayer.set("247TextChannel", textChannel.id);
      newPlayer.set("247LastReconnected", Date.now());

      logger.success(
        "247Mode",
        `Reconnected to 24/7 channel ${voiceChannel.name} in guild ${guild.name}`,
      );
    } catch (error) {
      logger.error(
        "247Mode",
        `Failed to reconnect 24/7 in guild ${guild.name}:`,
        error,
      );
    }
  } else {
    player.set("247Mode", true);
    player.set("247VoiceChannel", voiceChannel.id);
    if (guildData.stay_247_text_channel) {
      player.set("247TextChannel", guildData.stay_247_text_channel);
    }
  }
}
