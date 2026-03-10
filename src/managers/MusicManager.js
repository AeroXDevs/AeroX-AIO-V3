import { LavalinkManager } from "lavalink-client";
import { logger } from "#utils/logger";
import { config } from "#config/config";
import { db } from "#database/DatabaseManager";

export class MusicManager {
  constructor(client) {
    this.client = client;
    this.initialized = false;
    this.eventsManager = null;
    this.init();
  }

  init() {
    try {
      this.lavalink = new LavalinkManager({
        nodes: config.nodes.map(node => ({
          ...node,
          sessionId: `session_${config.clientId || 'bot'}_${node.id}`,
          resumeKey: `resume_${config.clientId || 'bot'}_${node.id}`,
          resumeTimeout: 60000,
        })),
        sendToShard: (guildId, payload) => {
          if (this.client.cluster) {
            return this.client.cluster.broadcastEval(
              (client, context) => {
                const guild = client.guilds.cache.get(context.guildId);
                if (guild) {
                  guild.shard.send(context.payload);
                  return true;
                }
                return false;
              },
              { context: { guildId, payload } },
            );
          } else {
            return this.client.guilds.cache.get(guildId)?.shard?.send(payload);
          }
        },
        autoSkip: true,
        client: {
          id: config.clientId || this.client.user?.id,
          username: this.client.user?.username || "MusicBot",
        },
        autoSkipOnResolveError: true,
        emitNewSongsOnly: false,
        playerOptions: {
          maxErrorsPerTime: {
            threshold: 15_000,
            maxAmount: 5,
          },
          minAutoPlayMs: 10_000,
          applyVolumeAsFilter: false,
          clientBasedPositionUpdateInterval: 100,
          defaultSearchPlatform: "spsearch",
          onDisconnect: {
            autoReconnect: true,
            destroyPlayer: false,
          },
          onEmptyQueue: {
            destroyAfterMs: 300_000,
          },
          useUnresolvedData: true,
          requesterTransformer: (requester) => requester,
        },
        queueOptions: {
          maxPreviousTracks: config.player?.maxHistorySize || 50,
        },
        linksAllowed: true,
        linksBlacklist: [],
        linksWhitelist: [],
        advancedOptions: {
          maxFilterFixDuration: 600_000,
          debugOptions: {
            noAudio: false,
            playerDestroy: {
              dontThrowError: true,
            },
          },
        },
      });

      this.client.on("clientReady", async () => {
        logger.success(
          "MusicManager",
          `🎵 ${this.client.user.tag} music system is ready!`,
        );

        this.lavalink.init(this.client.user);
        this.initialized = true;
        logger.success("MusicManager", "Initialized successfully");
      });
    } catch (error) {
      logger.error("MusicManager", "Failed to initialize music system", error);
      this.initialized = false;
    }
  }

  formatMS_HHMMSS(ms) {
    if (!ms || ms === 0) return "0:00";

    const seconds = Math.floor(ms / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
    }
    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }

  async createPlayer(options) {
    if (!this.initialized) {
      logger.error("MusicManager", "Cannot create player – not initialized");
      return null;
    }

    try {
      const { guildId, textId, voiceId } = this.parsePlayerOptions(options);

      if (!guildId || !textId || !voiceId) {
        logger.error("MusicManager", "Missing IDs for player creation", { guildId, textId, voiceId });
        return null;
      }

      const existing = this.lavalink.getPlayer(guildId);
      if (existing) {
        logger.debug("MusicManager", `Player already exists for guild ${guildId}`);
        return existing;
      }

      let playerVolume = 100;
      try {
        if (db) {
          playerVolume = db.guild.getDefaultVolume(guildId);
        }
      } catch (error) {
        logger.warn("MusicManager", `Failed to get default volume for guild ${guildId}, using 100: ${error.message}`);
        playerVolume = 100;
      }

      if (isNaN(playerVolume) || playerVolume < 1 || playerVolume > 100) {
        logger.warn("MusicManager", `Invalid volume ${playerVolume}, using 100`);
        playerVolume = 100;
      }

      logger.info("MusicManager", `Creating player for guild ${guildId} with default volume ${playerVolume}`);

      const player = await this.lavalink.createPlayer({
        guildId,
        voiceChannelId: voiceId,
        textChannelId: textId,
        selfDeaf: true,
        selfMute: false,
        volume: playerVolume,
        instaUpdateFiltersFix: true,
        applyVolumeAsFilter: false,
      });

      if (!player) {
        logger.error("MusicManager", `Failed to create player for guild ${guildId}`);
        return null;
      }

      if (!player.connected) {
        await player.connect();
      }

      logger.success("MusicManager", `Player created and connected for guild ${guildId} (vol: ${playerVolume})`);
      return player;
    } catch (error) {
      logger.error("MusicManager", `Error creating player: ${error.message}`);
      return null;
    }
  }

  async search(query, options = {}) {
    if (!this.initialized) {
      logger.error("MusicManager", "Cannot search – not initialized");
      return null;
    }

    try {
      const { source = "spsearch", requester } = options;

      // FIX: guard against no connected nodes before searching
      const nodes = this.lavalink.nodeManager.leastUsedNodes("memory");
      if (!nodes || nodes.length === 0) {
        logger.warn("MusicManager", "No Lavalink nodes available for search");
        return null;
      }

      const node = nodes[0];
      const searchResult = await node.search({ query, source }, requester);

      if (!searchResult || !searchResult.tracks?.length) {
        logger.debug("MusicManager", `No tracks found for query: ${query}`);
        return null;
      }

      return searchResult;
    } catch (error) {
      logger.error("MusicManager", `Search error: ${error.message}`);
      return null;
    }
  }

  getPlayer(guildId) {
    if (!this.initialized) {
      logger.warn("MusicManager", "Attempted to get player before initialization.");
      return undefined;
    }
    return this.lavalink.getPlayer(guildId);
  }

  getDefaultVolume(guildId) {
    try {
      return db.guild.getDefaultVolume(guildId);
    } catch (error) {
      logger.warn("MusicManager", `Failed to get default volume for guild ${guildId}: ${error.message}`);
      return 100;
    }
  }

  setDefaultVolume(guildId, volume) {
    try {
      db.guild.setDefaultVolume(guildId, volume);
      logger.success("MusicManager", `Default volume set to ${volume} for guild ${guildId}`);
      return true;
    } catch (error) {
      logger.error("MusicManager", `Failed to set default volume for guild ${guildId}: ${error.message}`);
      return false;
    }
  }

  // FIX: was returning bare `return` (undefined) in both branches — now returns proper booleans
  async is247ModeEnabled(guildId) {
    try {
      const settings = db.guild.get247Settings(guildId);
      return settings.enabled === true;
    } catch (error) {
      logger.warn("MusicManager", `Failed to check 247 mode for guild ${guildId}: ${error.message}`);
      return false;
    }
  }

  parsePlayerOptions(options) {
    if (options.guildId && options.textChannelId && options.voiceChannelId) {
      return {
        guildId: options.guildId,
        textId: options.textChannelId,
        voiceId: options.voiceChannelId,
      };
    }

    if (options.guildId && options.textChannel && options.voiceChannel) {
      return {
        guildId: options.guildId,
        textId: options.textChannel.id,
        voiceId: options.voiceChannel.id,
      };
    }

    logger.error("MusicManager", "Invalid options for player creation", options);
    return {};
  }
}
