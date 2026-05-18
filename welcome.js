const { EmbedBuilder } = require('discord.js');
const config = require('./config');

function buildWelcomeEmbed(member) {
  const avatar = member.user.displayAvatarURL({ size: 256, extension: 'png' });
  return new EmbedBuilder()
    .setColor(config.colors.welcome)
    .setTitle(`🏴‍☠️ ¡Bienvenido/a, ${member.user.username}!`)
    .setDescription(
      [
        `Hola ${member}, nos alegra tenerte en el servidor de **Sirgio**.`,
        '',
        `📜 Lee las reglas en <#${config.rulesChannelId}>`,
        `🎭 Obtén tus autoroles en <#${config.autorolesChannelId}>`,
        '',
        '¡Disfruta tu estadía y que tengas una buena travesía! ⚓',
      ].join('\n'),
    )
    .setThumbnail(avatar)
    .setImage(config.welcomeImageUrl)
    .setFooter({ text: `Miembro #${member.guild.memberCount}` })
    .setTimestamp();
}

async function sendWelcome(member) {
  if (member.user.bot || member.guild.id !== config.guildId) return;
  const channel = member.guild.channels.cache.get(config.welcomeChannelId);
  if (!channel?.isTextBased()) {
    console.error('Canal de bienvenida no encontrado:', config.welcomeChannelId);
    return;
  }
  await channel.send({ content: `${member}`, embeds: [buildWelcomeEmbed(member)] });
}

function init(client) {
  client.on('guildMemberAdd', (member) => {
    sendWelcome(member).catch((err) => console.error('Welcome error:', err.message));
  });
}

module.exports = { init, sendWelcome, buildWelcomeEmbed };
