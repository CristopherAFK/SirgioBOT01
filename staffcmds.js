const { EmbedBuilder } = require('discord.js');
const { isStaff } = require('./helpers');

const STAFF_SLASH = ['say', 'saydm', 'embed', 'embeddm', 'staffcmds'];

function parseColor(input) {
  if (!input) return 0x5865f2;
  const hex = String(input).replace(/^#/, '').trim();
  if (/^[0-9a-f]{6}$/i.test(hex)) return parseInt(hex, 16);
  return 0x5865f2;
}

function buildCustomEmbed({ title, description, color, image }) {
  const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(description);
  if (image) embed.setImage(image);
  return embed;
}

function resolveImageUrl(interaction) {
  const urlOpt = interaction.options.getString('imagen');
  const attachment = interaction.options.getAttachment('archivo_imagen');
  return attachment?.url || urlOpt || null;
}

async function cmdStaffHelp(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle('🛠️ Comandos de staff')
    .setDescription(
      [
        '**Autoroles (prefijo)**',
        '`!autoroles` — Publica los 4 paneles de reacciones en el canal actual.',
        '',
        '**Mensajes (slash)**',
        '`/say` — Envía texto a un canal.',
        '`/saydm` — Envía texto por DM a un usuario.',
        '',
        '**Embeds (slash)**',
        '`/embed` — Embed personalizado en un canal.',
        '`/embeddm` — Embed personalizado por DM.',
        '',
        '**Tickets (prefijo)**',
        '`!Tpanel` · `!cerrar`',
        '',
        '_Color en hex (#FF5500). Imagen: URL o adjunto opcional._',
      ].join('\n'),
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function cmdSay(interaction) {
  const channel = interaction.options.getChannel('canal');
  const text = interaction.options.getString('mensaje');

  if (!channel?.isTextBased()) {
    return interaction.reply({ content: '❌ El canal debe ser de texto.', ephemeral: true });
  }

  await channel.send({ content: text });
  await interaction.reply({ content: `✅ Mensaje enviado en ${channel}.`, ephemeral: true });
}

async function cmdSayDm(interaction) {
  const user = interaction.options.getUser('usuario');
  const text = interaction.options.getString('mensaje');

  await user.send({ content: text });
  await interaction.reply({ content: `✅ Mensaje enviado por DM a **${user.tag}**.`, ephemeral: true });
}

async function cmdEmbed(interaction, dm = false) {
  const title = interaction.options.getString('titulo');
  const description = interaction.options.getString('descripcion');
  const color = parseColor(interaction.options.getString('color'));
  const image = resolveImageUrl(interaction);
  const embed = buildCustomEmbed({ title, description, color, image });

  if (dm) {
    const user = interaction.options.getUser('usuario');
    await user.send({ embeds: [embed] });
    return interaction.reply({ content: `✅ Embed enviado por DM a **${user.tag}**.`, ephemeral: true });
  }

  const channel = interaction.options.getChannel('canal');
  if (!channel?.isTextBased()) {
    return interaction.reply({ content: '❌ El canal debe ser de texto.', ephemeral: true });
  }
  await channel.send({ embeds: [embed] });
  await interaction.reply({ content: `✅ Embed enviado en ${channel}.`, ephemeral: true });
}

async function handleSlash(interaction) {
  if (!interaction.isChatInputCommand()) return false;
  if (!STAFF_SLASH.includes(interaction.commandName)) return false;

  if (!interaction.guild) {
    await interaction.reply({ content: '❌ Este comando solo funciona en el servidor.', ephemeral: true });
    return true;
  }

  if (!isStaff(interaction.member)) {
    await interaction.reply({ content: '❌ Solo el staff puede usar este comando.', ephemeral: true });
    return true;
  }

  switch (interaction.commandName) {
    case 'staffcmds':
      await cmdStaffHelp(interaction);
      break;
    case 'say':
      await cmdSay(interaction);
      break;
    case 'saydm':
      await cmdSayDm(interaction);
      break;
    case 'embed':
      await cmdEmbed(interaction, false);
      break;
    case 'embeddm':
      await cmdEmbed(interaction, true);
      break;
    default:
      return false;
  }
  return true;
}

module.exports = { handleSlash, STAFF_SLASH };
