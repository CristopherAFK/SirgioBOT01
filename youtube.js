const { EmbedBuilder } = require('discord.js');
const config = require('./config');
const db = require('./database');

let clientRef = null;
let pollTimer = null;

function decodeXml(text) {
  if (!text) return '';
  return text
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'");
}

function extractHashtag(text) {
  const match = text?.match(/#[\wáéíóúñ]+/i);
  return match ? match[0] : null;
}

function parseLatestFromRss(xml) {
  const entryMatch = xml.match(/<entry>([\s\S]*?)<\/entry>/);
  if (!entryMatch) return null;

  const entry = entryMatch[1];
  const videoId = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
  if (!videoId) return null;

  const title = decodeXml(entry.match(/<title>([^<]*)<\/title>/)?.[1] || 'Nuevo video');
  let link =
    entry.match(/<link[^>]+href="([^"]+)"/)?.[1] ||
    `https://www.youtube.com/watch?v=${videoId}`;
  if (link.includes('/shorts/') || link.includes('shorts')) {
    link = `https://www.youtube.com/shorts/${videoId}`;
  }

  const description = decodeXml(entry.match(/<media:description>([\s\S]*?)<\/media:description>/)?.[1] || '');
  const thumbnail =
    entry.match(/<media:thumbnail[^>]+url="([^"]+)"/)?.[1] ||
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;

  return { videoId, title, link, description, thumbnail };
}

async function fetchLatestVideo(youtubeChannelId) {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${youtubeChannelId}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SirgioBOT/1.0 (Discord Bot)' },
  });
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  const xml = await res.text();
  return parseLatestFromRss(xml);
}

function buildNotificationEmbed(video, channelDisplayName) {
  const notice = `¡Sirgio subio nuevo video en ${channelDisplayName}! vayan a verlo`;
  const hashtag = extractHashtag(video.description);
  const descLines = [hashtag, notice, video.link].filter(Boolean);

  return new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle(`🎬 ${video.title}`)
    .setDescription(descLines.join('\n'))
    .setImage(video.thumbnail);
}

async function sendVideoNotification(video, channelDisplayName) {
  let discordChannel = clientRef?.channels.cache.get(config.youtube.notifyChannelId);
  if (!discordChannel) {
    discordChannel = await clientRef.channels.fetch(config.youtube.notifyChannelId).catch(() => null);
  }
  if (!discordChannel?.isTextBased()) {
    console.error('Canal de notificaciones YouTube no encontrado');
    return;
  }

  const roleMention = `<@&${config.youtube.notifyRoleId}>`;
  const notice = `¡Sirgio subio nuevo video en ${channelDisplayName}! vayan a verlo`;
  const content = `${roleMention}\n${notice}\n${video.link}`;
  const embed = buildNotificationEmbed(video, channelDisplayName);

  await discordChannel.send({ content, embeds: [embed] });
  console.log(`📺 Notificación YouTube [${channelDisplayName}]: ${video.title}`);
}

async function checkChannel(channelConfig) {
  const latest = await fetchLatestVideo(channelConfig.channelId);
  if (!latest) return;

  const state = await db.getYoutubeState(channelConfig.key);
  if (!state?.lastVideoId) {
    await db.setYoutubeState(channelConfig.key, latest.videoId);
    console.log(`📺 YouTube [${channelConfig.name}] inicializado: ${latest.videoId}`);
    return;
  }

  if (state.lastVideoId === latest.videoId) return;

  await db.setYoutubeState(channelConfig.key, latest.videoId);
  await sendVideoNotification(latest, channelConfig.name);
}

async function pollAllChannels() {
  for (const ch of config.youtube.channels) {
    try {
      await checkChannel(ch);
    } catch (err) {
      console.error(`YouTube poll error [${ch.name}]:`, err.message);
    }
  }
}

function startPolling() {
  if (pollTimer) return;
  const interval = config.youtube.pollIntervalMs || 20000;
  pollAllChannels();
  pollTimer = setInterval(pollAllChannels, interval);
  console.log(`📺 YouTube RSS activo (cada ${interval / 1000}s)`);
}

function init(client) {
  clientRef = client;
  client.once('ready', () => startPolling());
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

module.exports = { init, stopPolling, checkChannel, sendVideoNotification };
