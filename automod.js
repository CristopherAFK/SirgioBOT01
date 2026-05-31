const config = require('./config');
const db = require('./database');
const audit = require('./audit');
const moderation = require('./moderation');
const { formatDuration } = require('./helpers');

const spamTracker = new Map();

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');
}

function containsBannedWord(content) {
  const norm = normalize(content);
  return config.automod.bannedWords.find((w) => norm.includes(normalize(w)));
}

function isGifAllowed(url) {
  const lower = url.toLowerCase();
  if (lower.endsWith('.gif')) return true;
  return config.automod.gifHosts.some((h) => lower.includes(h));
}

function hasBlockedLink(content) {
  const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|discord\.gg\/[^\s]+)/gi;
  const matches = content.match(urlRegex);
  if (!matches) return false;
  return matches.some((url) => !isGifAllowed(url));
}

function countLines(content) {
  return content.split('\n').length;
}

function trackSpam(userId) {
  const now = Date.now();
  const window = config.automod.spamWindowMs;
  let times = spamTracker.get(userId) || [];
  times = times.filter((t) => now - t < window);
  times.push(now);
  spamTracker.set(userId, times);
  return times.length >= config.automod.spamThreshold;
}

async function getMuteDurationMs(profile, type) {
  const key = type === 'spam' ? 'spamMuteLevel' : 'wordMuteLevel';
  const level = profile[key] || 0;
  const durations = config.automod.muteDurationsMs;
  const idx = Math.min(level, durations.length - 1);
  return { durationMs: durations[idx], newLevel: level + 1 };
}

async function processAutomodWarn(member, violationType, detail) {
  const profile = await db.getUserProfile(member.id);
  const warnKey = violationType === 'spam' ? 'automodSpamWarns' : 'automodWordWarns';
  const newWarns = (profile[warnKey] || 0) + 1;

  await db.updateUserProfile(member.id, { [warnKey]: newWarns });

  if (newWarns < config.automod.warnLimit) {
    const modCase = await moderation.executeSanction({
      guild: member.guild,
      targetUser: member.user,
      type: 'warn',
      reasonCategory: 'Automod',
      reasonDetail: `${detail} (Advertencia ${newWarns}/${config.automod.warnLimit})`,
      moderator: null,
      source: 'automod',
    });
    await moderation.notifySanction(member.guild, member.user, modCase);
    return;
  }

  const { durationMs, newLevel } = await getMuteDurationMs(profile, violationType);
  const levelKey = violationType === 'spam' ? 'spamMuteLevel' : 'wordMuteLevel';

  await db.updateUserProfile(member.id, {
    [warnKey]: 0,
    [levelKey]: newLevel,
  });

  const modCase = await moderation.executeSanction({
    guild: member.guild,
    targetUser: member.user,
    type: 'mute',
    reasonCategory: 'Automod',
    reasonDetail: `${detail} — Mute automático (${formatDuration(durationMs)})`,
    durationMs,
    moderator: null,
    source: 'automod',
  });

  await moderation.notifySanction(member.guild, member.user, modCase);
}

async function handleMessage(message) {
  if (message.author.bot || !message.guild || message.guild.id !== config.guildId) return false;
  if (message.member?.roles?.cache?.has(config.staffRoleId)) return false;
  if (message.member?.roles?.cache?.has(config.mutedRoleId)) return false;

  let violation = null;
  let detail = '';

  if (containsBannedWord(message.content)) {
    violation = 'word';
    detail = 'Palabra o frase prohibida detectada.';
  } else if (countLines(message.content) > config.automod.maxLines) {
    violation = 'word';
    detail = `Mensaje con más de ${config.automod.maxLines} líneas.`;
  } else if (hasBlockedLink(message.content)) {
    violation = 'word';
    detail = 'Enlaces no permitidos (solo GIFs están permitidos).';
  } else if (trackSpam(message.author.id)) {
    violation = 'spam';
    detail = 'Spam detectado (demasiados mensajes seguidos).';
    spamTracker.set(message.author.id, []);
  }

  if (!violation) return false;

  await audit.logStaffEvent('automod.violation', {
    guildId: message.guild.id,
    targetId: message.author.id,
    targetTag: message.author.tag,
    channelId: message.channel.id,
    messageId: message.id,
    source: 'automod',
    payload: {
      violationType: violation,
      detail,
      content: message.content?.slice(0, 1000) || null,
    },
  });

  await message.delete().catch(() => {});
  await processAutomodWarn(message.member, violation, detail);
  return true;
}

module.exports = { handleMessage };
