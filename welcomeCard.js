const path = require('path');
const sharp = require('sharp');

const BANNER_PATH = path.join(__dirname, 'assets', 'welcome-banner.png');

// Centro del círculo vacío en welcome-banner.png (826×465)
const AVATAR_CENTER_X = 0.502;
const AVATAR_CENTER_Y = 0.48;
const AVATAR_SIZE_RATIO = 0.158;

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(text, max = 18) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function buildTextSvg(username, memberCount, width, height, avatarSize, avatarY) {
  const name = escapeXml(truncate(username, 18).toUpperCase());
  const footer = escapeXml(`CONTIGO SOMOS ${memberCount} MIEMBROS`);
  const nameY = avatarY + avatarSize + Math.round(height * 0.06);
  const footerY = Math.round(height * 0.91);
  const barW = Math.round(width * 0.9);
  const barX = Math.round((width - barW) / 2);

  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#00c8ff" flood-opacity="0.9"/>
          <feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#000000" flood-opacity="0.85"/>
        </filter>
        <linearGradient id="textGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style="stop-color:#d4f7ff"/>
          <stop offset="50%" style="stop-color:#ffffff"/>
          <stop offset="100%" style="stop-color:#8ee9ff"/>
        </linearGradient>
      </defs>
      <rect x="${barX}" y="${footerY - 34}" width="${barW}" height="42" rx="8" fill="rgba(0,18,40,0.5)"/>
      <text
        x="50%"
        y="${nameY}"
        text-anchor="middle"
        dominant-baseline="middle"
        font-family="Impact, Haettenschweiler, 'Arial Black', sans-serif"
        font-size="${Math.round(width * 0.055)}"
        font-weight="900"
        letter-spacing="3"
        fill="url(#textGrad)"
        stroke="#0077aa"
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
        font-size="${Math.round(width * 0.034)}"
        font-weight="900"
        letter-spacing="2"
        fill="url(#textGrad)"
        stroke="#0077aa"
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

async function circleAvatarWithBorder(avatarBuffer, size, border = 5) {
  const inner = await sharp(avatarBuffer)
    .resize(size, size, { fit: 'cover' })
    .png()
    .toBuffer();

  const mask = Buffer.from(
    `<svg width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/>
    </svg>`,
  );

  const circular = await sharp(inner)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();

  const total = size + border * 2;
  const ring = Buffer.from(
    `<svg width="${total}" height="${total}">
      <circle cx="${total / 2}" cy="${total / 2}" r="${total / 2}" fill="white"/>
    </svg>`,
  );

  return sharp(ring)
    .composite([{ input: circular, left: border, top: border }])
    .png()
    .toBuffer();
}

async function generateWelcomeCard(member) {
  const meta = await sharp(BANNER_PATH).metadata();
  const width = meta.width || 826;
  const height = meta.height || 465;
  const avatarSize = Math.round(width * AVATAR_SIZE_RATIO);
  const borderedSize = avatarSize + 10;
  const avatarX = Math.round(width * AVATAR_CENTER_X - borderedSize / 2);
  const avatarY = Math.round(height * AVATAR_CENTER_Y - borderedSize / 2);

  const avatarUrl = member.user.displayAvatarURL({ size: 256, extension: 'png' });
  const avatarBuffer = await fetchAvatarBuffer(avatarUrl);
  const circularAvatar = await circleAvatarWithBorder(avatarBuffer, avatarSize);
  const textOverlay = buildTextSvg(
    member.user.username,
    member.guild.memberCount,
    width,
    height,
    avatarSize,
    avatarY,
  );

  return sharp(BANNER_PATH)
    .composite([
      { input: circularAvatar, left: avatarX, top: avatarY },
      { input: textOverlay, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
}

module.exports = { generateWelcomeCard };
