const config = require('./config');

function isStaff(member) {
  if (!member) return false;
  if (member.id === config.ownerId) return true;
  return member.roles.cache.has(config.staffRoleId);
}

function discordTs(date = new Date()) {
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

function discordTsRel(date = new Date()) {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

function parseDuration(input) {
  if (!input) return null;
  const str = String(input).trim().toLowerCase();
  const match = str.match(/^(\d+)\s*(s|sec|seg|m|min|h|hr|hora|horas|d|dia|dias|day|days)$/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  const unit = match[2];
  const multipliers = {
    s: 1000,
    sec: 1000,
    seg: 1000,
    m: 60000,
    min: 60000,
    h: 3600000,
    hr: 3600000,
    hora: 3600000,
    horas: 3600000,
    d: 86400000,
    dia: 86400000,
    dias: 86400000,
    day: 86400000,
    days: 86400000,
  };
  return n * (multipliers[unit] || 0);
}

function formatDuration(ms) {
  if (!ms) return 'Permanente';
  const min = Math.floor(ms / 60000);
  const h = Math.floor(min / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${min % 60}m`;
  return `${min}m`;
}

function truncate(str, max = 1024) {
  if (!str) return '_Vacío_';
  return str.length > max ? `${str.slice(0, max - 3)}...` : str;
}

module.exports = {
  isStaff,
  discordTs,
  discordTsRel,
  parseDuration,
  formatDuration,
  truncate,
};
