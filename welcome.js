const { AttachmentBuilder } = require('discord.js');
const config = require('./config');
const { generateWelcomeCard } = require('./welcomeCard');

function buildWelcomeMessage(member) {
  return [
    `${member} ¡Bienvenid@ ${member.user.username}! ✨`,
    '',
    `Por favor, pasa a leer <#${config.rulesChannelId}> y visita <#${config.autorolesChannelId}> para obtener tus roles.`,
    '',
    '¡Esperamos que disfrutes tu estancia en el servidor!',
  ].join('\n');
}

async function sendWelcome(member) {
  if (member.user.bot || member.guild.id !== config.guildId) return;
  const channel = member.guild.channels.cache.get(config.welcomeChannelId);
  if (!channel?.isTextBased()) {
    console.error('Canal de bienvenida no encontrado:', config.welcomeChannelId);
    return;
  }

  const imageBuffer = await generateWelcomeCard(member);
  const attachment = new AttachmentBuilder(imageBuffer, { name: 'welcome.png' });

  await channel.send({
    content: buildWelcomeMessage(member),
    files: [attachment],
  });
}

function init(client) {
  client.on('guildMemberAdd', (member) => {
    sendWelcome(member).catch((err) => console.error('Welcome error:', err.message));
  });
}

module.exports = { init, sendWelcome, buildWelcomeMessage };
