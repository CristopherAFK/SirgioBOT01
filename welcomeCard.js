const path = require('path');
const sharp = require('sharp');

const BANNER_PATH = path.join(__dirname, 'assets', 'welcome-banner.png');

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(text, max = 20) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function buildTextSvg(username, memberCount, width, height) {
  const name = escapeXml(truncate(username, 20).toUpperCase());
  const footer = escapeXml(`CONTIGO SOMOS ${memberCount} MIEMBRO`);
  const titleY = Math.round(height * 0.115);
  const footerY = Math.round(height * 0.93);
  const barW = Math.round(width * 0.88);
  const barX = Math.round((width - barW) / 2);

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#00c8ff" flood-opacity="0.95"/>
          <feDropShadow dx="0" dy="3" stdDeviation="6" flood-color="#000000" flood-opacity="0.85"/>
        </filter>
        <linearGradient id="textGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#b8f4ff"/>
          <stop offset="50%" style="stop-color:#ffffff"/>
          <stop offset="100%" style="stop-color:#7ee8ff"/>
        </linearGradient>
      </defs>
      <rect x="${barX}" y="${titleY - 42}" width="${barW}" height="56" rx="10" fill="rgba(0,18,40,0.45)"/>
      <rect x="${barX}" y="${footerY - 38}" width="${barW}" height="46" rx="10" fill="rgba(0,18,40,0.45)"/>
      <text
        x="50%" y="${titleY}"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Impact, Haettenschweiler, 'Arial Black', sans-serif"
        font-size="${Math.round(width * 0.062)}"
        font-weight="900"
        letter-spacing="4"
        fill="url(#textGrad)"
        stroke="#0088cc"
        stroke-width="1.2"
        paint-order="stroke fill"
        filter="url(#glow)"
      >${name}</text>
      <text
        x="50%"
        y="${footerY}"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Impact, Haettenschweiler, 'Arial Black', sans-serif"
        font-size="${Math.round(width * 0.038)}"
        font-weight="900"
        letter-spacing="3"
        fill="url(#textGrad)"
        stroke="#0088cc"
        stroke-width="1"
        paint-order="stroke fill"
        filter="url(#glow)"
      >${footer}</text>
    </svg>
  `);
}

async function fetchAvatarBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Avatar HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function circleAvatar(avatarBuffer, size) {
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>
    </svg>`,
  );
  return sharp(avatarBuffer)
    .resize(size, size, { fit: 'cover' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function generateWelcomeCard(member) {
  const meta = await sharp(BANNER_PATH).metadata();
  const width = meta.width || 826;
  const height = meta.height || 465;
  const avatarSize = Math.round(width * 0.17);
  const avatarX = Math.round(width / 2 - avatarSize / 2);
  const avatarY = Math.round(height / 2 - avatarSize / 2 - height * 0.04);

  const avatarUrl = member.user.displayAvatarURL({ size: 256, extension: 'png' });
  const avatarBuffer = await fetchAvatarBuffer(avatarUrl);
  const circularAvatar = await circleAvatar(avatarBuffer, avatarSize);
  const textOverlay = buildTextSvg(member.user.username, member.guild.memberCount, width, height);

  return sharp(BANNER_PATH)
    .composite([
      { input: circularAvatar, left: avatarX, top: avatarY },
      { input: textOverlay, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

module.exports = { generateWelcomeCard };
