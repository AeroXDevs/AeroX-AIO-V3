import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  AttachmentBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { db } from "#database/DatabaseManager";
import emoji from "#config/emoji";
import { logger } from "#utils/logger";

function parseEmoji(emojiString) {
  if (!emojiString) return null;
  
  const customEmojiMatch = emojiString.match(/<(a)?:(\w+):(\d+)>/);
  if (customEmojiMatch) {
    return {
      animated: !!customEmojiMatch[1],
      name: customEmojiMatch[2],
      id: customEmojiMatch[3],
    };
  }
  
  return emojiString;
}

async function handleTicketCreate(interaction, client, panelId, categoryIndex) {
  const panel = db.getTicketPanel(interaction.guild.id, panelId);

  if (!panel) {
    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle(`${emoji.get("cross")} Panel Not Found`)
      .setDescription("This ticket panel configuration was not found.");

    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  const existingTickets = db.getUserTickets(
    interaction.guild.id,
    interaction.user.id
  );
  if (existingTickets.length >= 3) {
    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle(`${emoji.get("cross")} Ticket Limit Reached`)
      .setDescription("You already have 3 open tickets. Please close some before creating a new one.");

    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }

  const category = panel.categories[categoryIndex] || {
    name: "General",
    description: "General support ticket",
  };

  const ticketId = db.incrementTicketCounter(interaction.guild.id);
  const channelName = `ticket-${ticketId}`;

  try {
    const permissionOverwrites = [
      {
        id: interaction.guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
        ],
      },
    ];

    for (const roleId of panel.supportRoles) {
      const role = interaction.guild.roles.cache.get(roleId);
      if (role) {
        permissionOverwrites.push({
          id: roleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.AttachFiles,
            PermissionFlagsBits.ManageMessages,
          ],
        });
      }
    }

    const ticketChannel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: panel.categoryOpen,
      permissionOverwrites: permissionOverwrites,
    });

    db.createTicket({
      guildId: interaction.guild.id,
      channelId: ticketChannel.id,
      userId: interaction.user.id,
      panelId: panelId,
      ticketId: ticketId,
      category: category.name,
    });

    const welcomeEmbed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle(`${emoji.get("ticketOpen")} Ticket #${ticketId} Created`)
      .setDescription(
        `Welcome ${interaction.user}!\n\n` +
        `**Category:** ${category.name}\n` +
        `**Created:** <t:${Math.floor(Date.now() / 1000)}:R>\n\n` +
        `Please describe your issue and our support team will assist you shortly.`
      );

    const claimEmoji = parseEmoji(emoji.get("ticketClaim")) || "👤";
    const closeEmoji = parseEmoji(emoji.get("ticketClose")) || "🔒";
    const transcriptEmoji = parseEmoji(emoji.get("ticketTranscript")) || "📄";

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_claim_${ticketChannel.id}`)
        .setLabel("Claim")
        .setEmoji(claimEmoji)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`ticket_close_${ticketChannel.id}`)
        .setLabel("Close")
        .setEmoji(closeEmoji)
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`ticket_transcript_${ticketChannel.id}`)
        .setLabel("Transcript")
        .setEmoji(transcriptEmoji)
        .setStyle(ButtonStyle.Secondary)
    );

    await ticketChannel.send({
      content: `${interaction.user} ${panel.supportRoles.map((r) => `<@&${r}>`).join(" ")}`,
      embeds: [welcomeEmbed],
      components: [actionRow],
    });

    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle(`${emoji.get("check")} Ticket Created`)
      .setDescription(`Your ticket has been created: ${ticketChannel}`);

    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  } catch (error) {
    logger.error("TicketInteraction", "Failed to create ticket:", error);

    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle(`${emoji.get("cross")} Failed to Create Ticket`)
      .setDescription(`An error occurred while creating your ticket: ${error.message}`);

    return interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }
}

async function handleTicketClaim(interaction, client, channelId) {
  const ticketData = db.getTicket(channelId);

  if (!ticketData) {
    return interaction.reply({
      content: "This ticket no longer exists.",
      ephemeral: true,
    });
  }

  if (ticketData.claimed_by) {
    return interaction.reply({
      content: `This ticket is already claimed by <@${ticketData.claimed_by}>.`,
      ephemeral: true,
    });
  }

  const panel = db.getTicketPanel(interaction.guild.id, ticketData.panel_id);
  if (!panel) {
    return interaction.reply({
      content: "Panel configuration not found.",
      ephemeral: true,
    });
  }

  const hasPermission =
    interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
    panel.supportRoles.some((roleId) =>
      interaction.member.roles.cache.has(roleId)
    );

  if (!hasPermission) {
    return interaction.reply({
      content: "You don't have permission to claim tickets.",
      ephemeral: true,
    });
  }

  db.claimTicket(channelId, interaction.user.id);

  if (panel.categoryClaimed) {
    try {
      const channel = interaction.guild.channels.cache.get(channelId);
      if (channel) {
        await channel.setParent(panel.categoryClaimed);
      }
    } catch (error) {
      logger.error("TicketInteraction", "Failed to move ticket:", error);
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x000000)
    .setTitle(`${emoji.get("ticketClaim")} Ticket Claimed`)
    .setDescription(`This ticket has been claimed by ${interaction.user}.`);

  return interaction.reply({ embeds: [embed] });
}


// FIX: HTML escape helper to prevent XSS when rendering message content in transcripts
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
    .replace(/\n/g, '<br>');
}

async function generateHTMLTranscript(channel, ticketData, panel, client) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ticket #${ticketData.ticket_id} Transcript</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #36393f; color: #dcddde; padding: 20px; }
    .header { background: #2f3136; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
    .header h1 { color: #fff; font-size: 24px; margin-bottom: 10px; }
    .header p { color: #b9bbbe; font-size: 14px; }
    .messages { background: #36393f; }
    .message { display: flex; padding: 8px 16px; }
    .message:hover { background: #32353b; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; margin-right: 16px; background: #5865f2; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: bold; }
    .content { flex: 1; }
    .author { font-weight: 600; color: #fff; margin-right: 8px; }
    .timestamp { color: #72767d; font-size: 12px; }
    .text { margin-top: 4px; line-height: 1.4; word-wrap: break-word; }
    .attachment { margin-top: 8px; padding: 10px; background: #2f3136; border-radius: 4px; }
    .attachment a { color: #00aff4; text-decoration: none; }
    .footer { margin-top: 20px; padding: 20px; background: #2f3136; border-radius: 8px; text-align: center; color: #72767d; font-size: 12px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Ticket #${ticketData.ticket_id} - ${ticketData.category || "General"}</h1>
    <p>Created by User ID: ${ticketData.user_id}</p>
    <p>Transcript generated on ${new Date().toLocaleString()}</p>
  </div>
  <div class="messages">
    ${sortedMessages.map(msg => `
      <div class="message">
        <div class="avatar">${msg.author.username.charAt(0).toUpperCase()}</div>
        <div class="content">
          <span class="author">${msg.author.tag}</span>
          <span class="timestamp">${msg.createdAt.toLocaleString()}</span>
          <div class="text">${msg.content || ""}</div>
          ${msg.attachments.size > 0 ? `
            <div class="attachment">
              ${msg.attachments.map(att => `<a href="${att.url}" target="_blank">${att.name}</a>`).join("<br>")}
            </div>
          ` : ""}
        </div>
      </div>
    `).join("")}
  </div>
  <div class="footer">
    <p>Generated by Ticket System</p>
  </div>
</body>
</html>`;

  return html;
}

async function handleTicketClose(interaction, client, channelId) {
  const ticketData = db.getTicket(channelId);

  if (!ticketData) {
    return interaction.reply({
      content: "This ticket no longer exists.",
      ephemeral: true,
    });
  }

  const panel = db.getTicketPanel(interaction.guild.id, ticketData.panel_id);
  if (!panel) {
    return interaction.reply({
      content: "Panel configuration not found.",
      ephemeral: true,
    });
  }

  const hasPermission =
    interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
    panel.supportRoles.some((roleId) =>
      interaction.member.roles.cache.has(roleId)
    ) ||
    interaction.user.id === ticketData.user_id;

  if (!hasPermission) {
    return interaction.reply({
      content: "You don't have permission to close this ticket.",
      ephemeral: true,
    });
  }

  await interaction.deferReply();

  try {
    let channel = interaction.guild.channels.cache.get(channelId);
    if (!channel) {
      try {
        channel = await interaction.guild.channels.fetch(channelId);
      } catch {
        channel = null;
      }
    }

    if (!channel) {
      return interaction.editReply({
        content: "Could not find the ticket channel.",
      });
    }

    const alreadySentTranscript = db.isTranscriptSent(channelId);

    if (!alreadySentTranscript && panel.transcriptChannel) {
      const html = await generateHTMLTranscript(channel, ticketData, panel, client);
      const buffer = Buffer.from(html, "utf-8");
      const attachment = new AttachmentBuilder(buffer, {
        name: `ticket-${ticketData.ticket_id}-transcript.html`,
      });

      const transcriptChannel = interaction.guild.channels.cache.get(panel.transcriptChannel);
      if (transcriptChannel) {
        const transcriptEmbed = new EmbedBuilder()
          .setColor(0x000000)
          .setTitle(`${emoji.get("ticketTranscript")} Ticket Transcript`)
          .setDescription(
            `**Ticket:** #${ticketData.ticket_id}\n` +
            `**Category:** ${ticketData.category || "General"}\n` +
            `**Created By:** <@${ticketData.user_id}>\n` +
            `**Closed By:** ${interaction.user}\n` +
            `**Closed At:** <t:${Math.floor(Date.now() / 1000)}:F>`
          );

        await transcriptChannel.send({
          embeds: [transcriptEmbed],
          files: [attachment],
        });
        
        db.markTranscriptSent(channelId);
      }
    }

    db.closeTicket(channelId, interaction.user.id);

    if (panel.categoryClosed) {
      try {
        await channel.setParent(panel.categoryClosed);
      } catch (error) {
        logger.error("TicketInteraction", "Failed to move ticket:", error);
      }
    }

    try {
      await channel.permissionOverwrites.edit(ticketData.user_id, {
        SendMessages: false,
      });
    } catch (error) {
      logger.error("TicketInteraction", "Failed to update permissions:", error);
    }

    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle(`${emoji.get("ticketClose")} Ticket Closed`)
      .setDescription(
        `This ticket has been closed by ${interaction.user}.\n\n` +
        `Transcript has been saved${panel.transcriptChannel ? ` to <#${panel.transcriptChannel}>` : ""}.\n` +
        `Use the \`delete\` command to permanently delete this ticket.`
      );

    await interaction.editReply({ embeds: [embed] });

    const alreadySentReview = db.isReviewSent(channelId);
    
    if (!alreadySentReview) {
      try {
        const user = await client.users.fetch(ticketData.user_id);

        const reviewEmbed = new EmbedBuilder()
          .setColor(0x000000)
          .setTitle(`${emoji.get("ticketStar")} Rate Your Support Experience`)
          .setDescription(
            `Your ticket **#${ticketData.ticket_id}** in **${ticketData.category || "General"}** has been closed.\n\n` +
            `How would you rate your support experience?\n\n` +
            `Would you like to leave a review comment?`
          );

        const ratingRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket_rate_${channelId}_1`)
            .setLabel("1")
            .setEmoji("⭐")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`ticket_rate_${channelId}_2`)
            .setLabel("2")
            .setEmoji("⭐")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`ticket_rate_${channelId}_3`)
            .setLabel("3")
            .setEmoji("⭐")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`ticket_rate_${channelId}_4`)
            .setLabel("4")
            .setEmoji("⭐")
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId(`ticket_rate_${channelId}_5`)
            .setLabel("5")
            .setEmoji("⭐")
            .setStyle(ButtonStyle.Primary)
        );

        const reviewActionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket_review_yes_${channelId}`)
            .setLabel("Yes, leave a comment")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`ticket_review_no_${channelId}`)
            .setLabel("No, skip")
            .setStyle(ButtonStyle.Secondary)
        );

        await user
          .send({
            embeds: [reviewEmbed],
            components: [ratingRow, reviewActionRow],
          })
          .then(() => {
            db.markReviewSent(channelId);
          })
          .catch(() => {});
      } catch (error) {
        logger.error("TicketInteraction", "Failed to send review DM:", error);
      }
    }
  } catch (error) {
    logger.error("TicketInteraction", "Failed to close ticket:", error);
    return interaction.editReply({
      content: `Failed to close ticket: ${error.message}`,
    });
  }
}

async function handleTicketRate(interaction, client, channelId, rating) {
  db.rateTicket(channelId, rating);
  
  const ticketData = db.getTicket(channelId);

  if (ticketData) {
    const panel = db.getTicketPanel(ticketData.guild_id, ticketData.panel_id);
    if (panel && panel.reviewChannel) {
      const guild = client.guilds.cache.get(ticketData.guild_id);
      if (guild) {
        const reviewChannel = guild.channels.cache.get(panel.reviewChannel);
        if (reviewChannel) {
          const reviewEmbed = new EmbedBuilder()
            .setColor(0x000000)
            .setTitle(`${emoji.get("ticketStar")} Ticket Rating`)
            .setDescription(
              `**Ticket:** #${ticketData.ticket_id}\n` +
              `**Category:** ${ticketData.category || "General"}\n` +
              `**User:** ${interaction.user}\n` +
              `**Rating:** ${rating}/5 ⭐`
            )
            .setTimestamp();

          try {
            await reviewChannel.send({ embeds: [reviewEmbed] });
          } catch (error) {
            logger.error("TicketInteraction", "Failed to send rating to channel:", error);
          }
        }
      }
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x000000)
    .setTitle(`${emoji.get("check")} Thank You!`)
    .setDescription(
      `Thank you for rating your support experience **${rating}/5** stars!\n\nYour feedback helps us improve.`
    );

  return interaction.update({
    embeds: [embed],
    components: [],
  });
}

async function handleReviewYes(interaction, client, channelId) {
  const modal = new ModalBuilder()
    .setCustomId(`ticket_review_modal_${channelId}`)
    .setTitle("Leave a Review Comment");

  const reviewInput = new TextInputBuilder()
    .setCustomId("review_comment")
    .setLabel("Your Review Comment")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Share your experience with our support team...")
    .setRequired(true)
    .setMaxLength(1000);

  const actionRow = new ActionRowBuilder().addComponents(reviewInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);
}

async function handleReviewNo(interaction, client, channelId) {
  const embed = new EmbedBuilder()
    .setColor(0x000000)
    .setTitle(`${emoji.get("check")} Thank You!`)
    .setDescription("Thank you for using our ticket system!");

  return interaction.update({
    embeds: [embed],
    components: [],
  });
}

async function handleReviewModalSubmit(interaction, client, channelId) {
  const reviewComment = interaction.fields.getTextInputValue("review_comment");
  const ticketData = db.getTicket(channelId);

  if (ticketData) {
    db.rateTicket(channelId, ticketData.rating || 0, reviewComment);
  }

  let guild = null;
  let panel = null;

  if (ticketData && ticketData.guild_id) {
    guild = client.guilds.cache.get(ticketData.guild_id);
    if (guild) {
      panel = db.getTicketPanel(ticketData.guild_id, ticketData.panel_id);
    }
  }

  if (!guild && ticketData) {
    for (const [, g] of client.guilds.cache) {
      const p = db.getTicketPanel(g.id, ticketData.panel_id);
      if (p && p.reviewChannel) {
        guild = g;
        panel = p;
        break;
      }
    }
  }

  if (guild && panel && panel.reviewChannel) {
    const reviewChannel = guild.channels.cache.get(panel.reviewChannel);
    if (reviewChannel) {
      const reviewEmbed = new EmbedBuilder()
        .setColor(0x000000)
        .setTitle(`${emoji.get("ticketStar")} New Ticket Review`)
        .setDescription(
          `**Ticket:** #${ticketData?.ticket_id || "Unknown"}\n` +
          `**Category:** ${ticketData?.category || "General"}\n` +
          `**User:** ${interaction.user}\n` +
          `**Rating:** ${ticketData?.rating || "Not rated"}/5 ⭐\n\n` +
          `**Review Comment:**\n${reviewComment}`
        )
        .setTimestamp();

      try {
        await reviewChannel.send({ embeds: [reviewEmbed] });
      } catch (error) {
        logger.error("TicketInteraction", "Failed to send review to channel:", error);
      }
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x000000)
    .setTitle(`${emoji.get("check")} Review Submitted!`)
    .setDescription("Thank you for your feedback! Your review has been submitted.");

  return interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}

async function handleTicketTranscript(interaction, client, channelId) {
  const ticketData = db.getTicket(channelId);

  if (!ticketData) {
    return interaction.reply({
      content: "This ticket no longer exists in the database.",
      ephemeral: true,
    });
  }

  const panel = db.getTicketPanel(interaction.guild.id, ticketData.panel_id);
  if (!panel) {
    return interaction.reply({
      content: "Panel configuration not found.",
      ephemeral: true,
    });
  }

  const hasPermission =
    interaction.member.permissions.has(PermissionFlagsBits.ManageChannels) ||
    panel.supportRoles.some((roleId) =>
      interaction.member.roles.cache.has(roleId)
    ) ||
    interaction.user.id === ticketData.user_id;

  if (!hasPermission) {
    return interaction.reply({
      content: "You don't have permission to generate transcripts.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    let channel = interaction.guild.channels.cache.get(channelId);
    if (!channel) {
      try {
        channel = await interaction.guild.channels.fetch(channelId);
      } catch {
        channel = null;
      }
    }
    
    if (!channel) {
      return interaction.editReply({
        content: "Could not find the ticket channel. It may have been deleted.",
      });
    }

    const html = await generateHTMLTranscript(channel, ticketData, panel, client);
    const buffer = Buffer.from(html, "utf-8");
    const attachment = new AttachmentBuilder(buffer, {
      name: `ticket-${ticketData.ticket_id}-transcript.html`,
    });

    if (panel.transcriptChannel) {
      const transcriptChannel = interaction.guild.channels.cache.get(panel.transcriptChannel);
      if (transcriptChannel) {
        const transcriptEmbed = new EmbedBuilder()
          .setColor(0x000000)
          .setTitle(`${emoji.get("ticketTranscript")} Ticket Transcript`)
          .setDescription(
            `**Ticket:** #${ticketData.ticket_id}\n` +
            `**Category:** ${ticketData.category || "General"}\n` +
            `**Created by:** <@${ticketData.user_id}>\n` +
            `**Generated by:** ${interaction.user}\n` +
            `**Generated at:** <t:${Math.floor(Date.now() / 1000)}:F>`
          );

        await transcriptChannel.send({
          embeds: [transcriptEmbed],
          files: [attachment],
        });
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle(`${emoji.get("check")} Transcript Generated`)
      .setDescription(
        `The transcript has been generated successfully!${panel.transcriptChannel ? `\n\nIt has been sent to <#${panel.transcriptChannel}>.` : ""}`
      );

    return interaction.editReply({
      embeds: [embed],
      files: [attachment],
    });
  } catch (error) {
    logger.error("TicketInteraction", "Failed to generate transcript:", error);

    return interaction.editReply({
      content: `Failed to generate transcript: ${error.message}`,
    });
  }
}

export default {
  name: "interactionCreate",
  async execute(interaction, client) {
    if (interaction.isModalSubmit()) {
      const customId = interaction.customId;
      if (customId.startsWith("ticket_review_modal_")) {
        const channelId = customId.replace("ticket_review_modal_", "");
        await handleReviewModalSubmit(interaction, client, channelId);
      }
      return;
    }

    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    const customId = interaction.customId;

    if (customId.startsWith("ticket_create_")) {
      if (interaction.isStringSelectMenu()) {
        const [panelId, categoryIndex] = interaction.values[0].split("_");
        await handleTicketCreate(
          interaction,
          client,
          parseInt(panelId),
          parseInt(categoryIndex)
        );
      } else if (interaction.isButton()) {
        const parts = customId.split("_");
        const panelId = parseInt(parts[2]);
        const categoryIndex = parseInt(parts[3]);
        await handleTicketCreate(interaction, client, panelId, categoryIndex);
      }
    } else if (customId.startsWith("ticket_claim_")) {
      const channelId = customId.replace("ticket_claim_", "");
      await handleTicketClaim(interaction, client, channelId);
    } else if (customId.startsWith("ticket_close_")) {
      const channelId = customId.replace("ticket_close_", "");
      await handleTicketClose(interaction, client, channelId);
    } else if (customId.startsWith("ticket_transcript_")) {
      const channelId = customId.replace("ticket_transcript_", "");
      await handleTicketTranscript(interaction, client, channelId);
    } else if (customId.startsWith("ticket_rate_")) {
      const parts = customId.split("_");
      const channelId = parts[2];
      const rating = parseInt(parts[3]);
      await handleTicketRate(interaction, client, channelId, rating);
    } else if (customId.startsWith("ticket_review_yes_")) {
      const channelId = customId.replace("ticket_review_yes_", "");
      await handleReviewYes(interaction, client, channelId);
    } else if (customId.startsWith("ticket_review_no_")) {
      const channelId = customId.replace("ticket_review_no_", "");
      await handleReviewNo(interaction, client, channelId);
    }
  },
};
