const path = require('path');
const sharp = require('sharp');

const BANNER_PATH = path.join(__dirname, 'assets', 'welcome-banner.png');
const WIDTH = 832;
const HEIGHT = 465;
const AVATAR_SIZE = 128;
const AVATAR_X = Math.round(WIDTH / 2 - AVATAR_SIZE / 2);
const AVATAR_Y = Math.round(HEIGHT / 2 - AVATAR_SIZE / 2 - 8);

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(text, max = 22) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function buildTextSvg(username, memberCount) {
  const name = escapeXml(truncate(username, 24));
  const footer = escapeXml(`CONTIGO SOMOS ${memberCount} MIEMBRO`);

  return Buffer.from(`
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000000" flood-opacity="0.9"/>
        </filter>
      </defs>
      <style>
        .title { font: bold 36px Arial, Helvetica, sans-serif; fill: #ffffff; }
        .footer { font: bold 26px Arial, Helvetica, sans-serif; fill: #ffffff; }
      </style>
      <text x="50%" y="52" text-anchor="middle" class="title" filter="url(#shadow)">${name}</text>
      <text x="50%" y="438" text-anchor="middle" class="footer" filter="url(#shadow)">${footer}</text>
    </svg>
  `);
}

async function fetchAvatarBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Avatar HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function circleAvatar(avatarBuffer) {
  const mask = Buffer.from(
    `<svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}">
      <circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2}" fill="white"/>
    </svg>`,
  );
  return sharp(avatarBuffer)
    .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function generateWelcomeCard(member) {
  const avatarUrl = member.user.displayAvatarURL({ size: 256, extension: 'png' });
  const memberCount = member.guild.memberCount;

  const avatarBuffer = await fetchAvatarBuffer(avatarUrl);
  const circularAvatar = await circleAvatar(avatarBuffer);
  const textOverlay = buildTextSvg(member.user.username, memberCount);

  return sharp(BANNER_PATH)
    .composite([
      { input: circularAvatar, left: AVATAR_X, top: AVATAR_Y },
      { input: textOverlay, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

module.exports = { generateWelcomeCard };
