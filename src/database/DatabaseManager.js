import { Guild } from "#db/Guild";
import { User } from "#db/User";
import { Playlists } from "#db/Playlists";
import { Premium } from "#db/Premium";
import { Moderation } from "#db/Moderation";
import { Ticket } from "#db/Ticket";
import { Invites } from "#db/Invites";
import { logger } from "#utils/logger";

export class DatabaseManager {
  constructor() {
    this.initDatabases();
  }

  initDatabases() {
    try {
      this.guild = new Guild();
      this.user = new User();
      this.premium = new Premium();
      this.playlists = new Playlists();
      this.moderation = new Moderation();
      this.ticket = new Ticket();
      this.invites = new Invites();
      logger.success("DatabaseManager", "All databases initialized successfully");
    } catch (error) {
      logger.error("DatabaseManager", "Failed to initialize databases", error);
      throw error;
    }
  }

  closeAll() {
    try {
      this.guild.close();
      this.user.close();
      this.premium.close();
      this.playlists.close();
      this.moderation.close();
      this.ticket.close();
      this.invites.close();
      logger.info("DatabaseManager", "All database connections closed");
    } catch (error) {
      logger.error("DatabaseManager", "Failed to close database connections", error);
    }
  }

  // ─── Guild ───────────────────────────────────────────────────────────────────
  getPrefixes(guildId) { return this.guild.getPrefixes(guildId); }
  setPrefixes(guildId, prefixes) { return this.guild.setPrefixes(guildId, prefixes); }
  isGuildBlacklisted(guildId) { return this.guild.isBlacklisted(guildId); }
  blacklistGuild(guildId, reason = "No reason provided") { return this.guild.blacklistGuild(guildId, reason); }
  unblacklistGuild(guildId) { return this.guild.unblacklistGuild(guildId); }

  // ─── User ────────────────────────────────────────────────────────────────────
  hasNoPrefix(userId) { return this.user.hasNoPrefix(userId); }
  setNoPrefix(userId, enabled, expiryTimestamp = null) { return this.user.setNoPrefix(userId, enabled, expiryTimestamp); }
  getUserPrefixes(userId) { return this.user.getUserPrefixes(userId); }
  setUserPrefixes(userId, prefixes) { return this.user.setUserPrefixes(userId, prefixes); }
  isUserBlacklisted(userId) { return this.user.isBlacklisted(userId); }
  blacklistUser(userId, reason = "No reason provided") { return this.user.blacklistUser(userId, reason); }
  unblacklistUser(userId) { return this.user.unblacklistUser(userId); }
  getUserData(userId) { return this.user.ensureUser(userId); }

  // ─── Premium ─────────────────────────────────────────────────────────────────
  isUserPremium(userId) { return this.premium.isUserPremium(userId); }
  isGuildPremium(guildId) { return this.premium.isGuildPremium(guildId); }
  hasAnyPremium(userId, guildId) { return this.premium.hasAnyPremium(userId, guildId); }
  grantUserPremium(userId, grantedBy, expiresAt = null, reason = "Premium granted") {
    return this.premium.grantUserPremium(userId, grantedBy, expiresAt, reason);
  }
  grantGuildPremium(guildId, grantedBy, expiresAt = null, reason = "Premium granted") {
    return this.premium.grantGuildPremium(guildId, grantedBy, expiresAt, reason);
  }
  revokeUserPremium(userId) { return this.premium.revokeUserPremium(userId); }
  revokeGuildPremium(guildId) { return this.premium.revokeGuildPremium(guildId); }

  // ─── Moderation ──────────────────────────────────────────────────────────────
  addMute(guildId, userId, moderatorId, reason, duration = null) {
    return this.moderation.addMute(guildId, userId, moderatorId, reason, duration);
  }
  removeMute(guildId, userId) { return this.moderation.removeMute(guildId, userId); }
  getActiveMute(guildId, userId) { return this.moderation.getActiveMute(guildId, userId); }
  getMuteHistory(guildId, userId) { return this.moderation.getMuteHistory(guildId, userId); }
  resetMutes(guildId, userId) { return this.moderation.resetMutes(guildId, userId); }
  addWarn(guildId, userId, moderatorId, reason) {
    return this.moderation.addWarn(guildId, userId, moderatorId, reason);
  }
  getWarns(guildId, userId) { return this.moderation.getWarns(guildId, userId); }
  getWarnCount(guildId, userId) { return this.moderation.getWarnCount(guildId, userId); }
  resetWarns(guildId, userId) { return this.moderation.resetWarns(guildId, userId); }
  addRemind(guildId, channelId, userId, message, remindAt) {
    return this.moderation.addRemind(guildId, channelId, userId, message, remindAt);
  }
  getReminders(userId) { return this.moderation.getReminders(userId); }
  getPendingReminders() { return this.moderation.getPendingReminders(); }
  markReminded(id) { return this.moderation.markReminded(id); }
  resetReminds(userId) { return this.moderation.resetReminds(userId); }
  getExpiredMutes() { return this.moderation.getExpiredMutes(); }

  // ─── Ticket ──────────────────────────────────────────────────────────────────
  getTicketCounter(guildId) { return this.ticket.getCounter(guildId); }
  incrementPanelCounter(guildId) { return this.ticket.incrementPanelCounter(guildId); }
  decrementPanelCounter(guildId) { return this.ticket.decrementPanelCounter(guildId); }
  incrementTicketCounter(guildId) { return this.ticket.incrementTicketCounter(guildId); }
  createTicketPanel(data) { return this.ticket.createPanel(data); }
  getTicketPanel(guildId, panelId) { return this.ticket.getPanel(guildId, panelId); }
  getAllTicketPanels(guildId) { return this.ticket.getAllPanels(guildId); }
  updateTicketPanel(guildId, panelId, updates) { return this.ticket.updatePanel(guildId, panelId, updates); }
  deleteTicketPanel(guildId, panelId) { return this.ticket.deletePanel(guildId, panelId); }
  createTicket(data) { return this.ticket.createTicket(data); }
  getTicket(channelId) { return this.ticket.getTicket(channelId); }
  getTicketById(guildId, ticketId) { return this.ticket.getTicketById(guildId, ticketId); }
  getUserTickets(guildId, userId) { return this.ticket.getUserTickets(guildId, userId); }
  getAllOpenTickets(guildId) { return this.ticket.getAllOpenTickets(guildId); }
  claimTicket(channelId, claimedBy) { return this.ticket.claimTicket(channelId, claimedBy); }
  closeTicket(channelId, closedBy) { return this.ticket.closeTicket(channelId, closedBy); }
  rateTicket(channelId, rating, feedback) { return this.ticket.rateTicket(channelId, rating, feedback); }
  getTicketStats(guildId) { return this.ticket.getTicketStats(guildId); }
  deleteTicket(channelId) { return this.ticket.deleteTicket(channelId); }

  // FIX: These 4 methods were called in ticketInteraction.js but were never
  //      exposed through DatabaseManager. They existed in Ticket.js — now wired up.
  isTranscriptSent(channelId) { return this.ticket.isTranscriptSent(channelId); }
  markTranscriptSent(channelId) { return this.ticket.markTranscriptSent(channelId); }
  isReviewSent(channelId) { return this.ticket.isReviewSent(channelId); }
  markReviewSent(channelId) { return this.ticket.markReviewSent(channelId); }

  // ─── Invites ─────────────────────────────────────────────────────────────────
  isInviteTrackingEnabled(guildId) { return this.invites.isTrackingEnabled(guildId); }
  setInviteTracking(guildId, enabled) { return this.invites.setTrackingEnabled(guildId, enabled); }
  getMemberInvites(guildId, userId) { return this.invites.getMemberInvites(guildId, userId); }
  getEffectiveInvites(memberData) { return this.invites.getEffectiveInvites(memberData); }
  addInvitesToMember(guildId, userId, amount) { return this.invites.addInvites(guildId, userId, amount); }
  resetMemberInvites(guildId, userId) { return this.invites.resetInvites(guildId, userId); }
  setMemberInviter(guildId, userId, inviterId, inviteCode) {
    return this.invites.setInviterData(guildId, userId, inviterId, inviteCode);
  }
  getInviteRanks(guildId) { return this.invites.getInviteRanks(guildId); }
  addInviteRank(guildId, roleId, invitesRequired) { return this.invites.addInviteRank(guildId, roleId, invitesRequired); }
  removeInviteRank(guildId, roleId) { return this.invites.removeInviteRank(guildId, roleId); }
  getEligibleInviteRanks(guildId, inviteCount) { return this.invites.getEligibleRanks(guildId, inviteCount); }
  getInviteLeaderboard(guildId, limit = 10) { return this.invites.getLeaderboard(guildId, limit); }
  importMemberInvites(guildId, userId, uses) { return this.invites.importInvites(guildId, userId, uses); }
}

export const db = new DatabaseManager();
