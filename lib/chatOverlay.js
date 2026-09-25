"use strict";

const path = require("path");
const OVERLAY_MARKER = Symbol.for("evejs.fourModeAsteroidBelts.chatOverlay");
const OVERLAY_VERSION = "0.12.9-final-1";
const SOURCE_ANCHORS = Object.freeze([
  "const AVAILABLE_SLASH_COMMANDS = [",
  "const COMMANDS_HELP_TEXT = [",
  "function executeChatCommand(session, rawMessage, chatHub, options = {})",
  "module.exports = {",
  "  AVAILABLE_SLASH_COMMANDS,",
  "  COMMANDS_HELP_TEXT,",
  "  executeChatCommand,",
]);

function count(source, needle) {
  let result = 0;
  let offset = 0;
  while ((offset = source.indexOf(needle, offset)) >= 0) {
    result++;
    offset += needle.length;
  }
  return result;
}

function validateSource(source) {
  if (typeof source !== "string") throw new TypeError("chat overlay source must be a string");
  const normalized = source.replace(/\r\n/g, "\n");
  for (const anchor of SOURCE_ANCHORS) {
    const matches = count(normalized, anchor);
    if (matches === 0) throw new Error(`chat overlay: required semantic anchor missing: ${anchor}`);
    if (matches !== 1) throw new Error(`chat overlay: semantic anchor is ambiguous: ${anchor}`);
  }
  for (const command of ["beltmode", "beltvolume"]) {
    if (normalized.includes(`"${command}"`) || normalized.includes(`/${command}`)) {
      throw new Error(`chat overlay: conflicting Four command seam detected: ${command}`);
    }
  }
  return true;
}

function propertyCanBeAssigned(object, property) {
  const descriptor = Object.getOwnPropertyDescriptor(object, property);
  return Boolean(descriptor && (descriptor.writable === true || typeof descriptor.set === "function"));
}

function install(upstream, options) {
  if (!upstream || typeof upstream.executeChatCommand !== "function") throw new Error("CHAT_COMMAND_EXPORT_INVALID");
  const existingOverlay = upstream[OVERLAY_MARKER];
  if (existingOverlay) {
    if (existingOverlay.version === OVERLAY_VERSION && existingOverlay.wrapped === upstream.executeChatCommand) {
      throw new Error("FOUR_MODE_CHAT_OVERLAY_ALREADY_INSTALLED");
    }
    throw new Error("FOUR_MODE_CHAT_OVERLAY_CONFLICT");
  }
  if (!options || !options.commands || typeof options.commands.handleMode !== "function" || typeof options.commands.handleVolume !== "function") {
    throw new Error("FOUR_MODE_CHAT_COMMAND_HANDLERS_INVALID");
  }
  const { normalizeRoleValue, ROLEMASK_VIEW } = require(path.join(options.runtimeRoot, "server/src/services/account/accountRoleProfiles"));
  const original = upstream.executeChatCommand;
  const commandNames = upstream.AVAILABLE_SLASH_COMMANDS;
  if (!Array.isArray(commandNames)) throw new Error("CHAT_COMMAND_LIST_INVALID");
  if (!Object.isExtensible(commandNames)) throw new Error("CHAT_COMMAND_LIST_NOT_EXTENSIBLE");
  if (!propertyCanBeAssigned(upstream, "COMMANDS_HELP_TEXT") || !propertyCanBeAssigned(upstream, "executeChatCommand") || !Object.isExtensible(upstream)) {
    throw new Error("CHAT_COMMAND_EXPORT_NOT_MUTABLE");
  }
  for (const command of ["beltmode", "beltvolume"]) {
    if (commandNames.includes(command)) throw new Error(`FOUR_MODE_CHAT_COMMAND_CONFLICT:${command}`);
  }
  const help = String(upstream.COMMANDS_HELP_TEXT || "");
  if (/\/(?:beltmode|beltvolume)\b/i.test(help)) throw new Error("FOUR_MODE_CHAT_HELP_CONFLICT");
  commandNames.push("beltmode", "beltvolume");
  upstream.COMMANDS_HELP_TEXT = `${help}\n/beltmode <retail|evejs-fixed|pre-scarcity|pre-scarcity-enriched> [refresh] (staff/admin only)\n/beltvolume <0.01..1000> [refresh] (staff/admin only)`;
  function feedback(session, chatHub, callOptions, message) {
    if (chatHub && session && callOptions.emitChatFeedback !== false) chatHub.sendSystemMessage(session, message, callOptions.feedbackChannel || callOptions.channel || null);
    return { handled: true, message };
  }
  function wrapped(session, rawMessage, chatHub, callOptions = {}) {
    const trimmed = String(rawMessage || "").trim();
    const helpMatch = trimmed.match(/^[/.](help|commands|commandlist)\s*$/i);
    if (helpMatch) {
      const upstreamResult = original(session, rawMessage, chatHub, { ...callOptions, emitChatFeedback: false });
      const roleMask = normalizeRoleValue(session && (session.accountRole ?? session.role ?? session.rolesAtAll), 0n);
      const suffix = (roleMask & ROLEMASK_VIEW) !== 0n
        ? "\n/beltmode <retail|evejs-fixed|pre-scarcity|pre-scarcity-enriched> [refresh] (staff/admin only)\n/beltvolume <0.01..1000> [refresh] (staff/admin only)"
        : "";
      return feedback(session, chatHub, callOptions, `${upstreamResult && upstreamResult.message || ""}${suffix}`);
    }
    const match = trimmed.match(/^[/.](beltmode|beltvolume)(?:\s+([\s\S]*))?$/i);
    if (!match) return original(session, rawMessage, chatHub, callOptions);
    const roleMask = normalizeRoleValue(session && (session.accountRole ?? session.role ?? session.rolesAtAll), 0n);
    if ((roleMask & ROLEMASK_VIEW) === 0n) return feedback(session, chatHub, callOptions, `${match[1].toUpperCase()} requires a staff/admin role.`);
    const result = match[1].toLowerCase() === "beltmode" ? options.commands.handleMode(session, match[2] || "") : options.commands.handleVolume(session, match[2] || "");
    return feedback(session, chatHub, callOptions, result.message);
  }
  upstream.executeChatCommand = wrapped;
  Object.defineProperty(upstream, OVERLAY_MARKER, { value: Object.freeze({ version: OVERLAY_VERSION, original, wrapped }), enumerable: false });
  return upstream;
}

module.exports = { OVERLAY_MARKER, OVERLAY_VERSION, SOURCE_ANCHORS, validateSource, install };
