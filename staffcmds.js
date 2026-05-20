const {
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require('discord.js');
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
        '`/say` — Envía texto a un canal (abre modal).',
        '`/saydm` — Envía texto por DM a un usuario (abre modal).',
        '',
        '**Embeds (slash)**',
        '`/embed` — Embed personalizado en un canal (abre modal).',
        '`/embeddm` — Embed personalizado por DM (abre modal).',
        '',
        '**Tickets (prefijo)**',
        '`!Tpanel` · `!cerrar`',
        '',
        '_Color en hex (#FF5500). Imagen: URL opcional._',
      ].join('\n'),
    );
  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function cmdSay(interaction) {
  const channel = interaction.options.getChannel('canal');
  if (!channel?.isTextBased()) {
    return interaction.reply({ content: '❌ El canal debe ser de texto.', ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId(`say_modal:${channel.id}`)
    .setTitle('Enviar mensaje');

  const msgInput = new TextInputBuilder()
    .setCustomId('mensaje')
    .setLabel('Mensaje')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Escribe el mensaje aquí...')
    .setRequired(true)
    .setMaxLength(2000);

  modal.addComponents(new ActionRowBuilder().addComponents(msgInput));
  await interaction.showModal(modal);
}

async function cmdSayDm(interaction) {
  const user = interaction.options.getUser('usuario');

  const modal = new ModalBuilder()
    .setCustomId(`saydm_modal:${user.id}`)
    .setTitle(`DM a ${user.username}`);

  const msgInput = new TextInputBuilder()
    .setCustomId('mensaje')
    .setLabel('Mensaje')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Escribe el mensaje aquí...')
    .setRequired(true)
    .setMaxLength(2000);

  modal.addComponents(new ActionRowBuilder().addComponents(msgInput));
  await interaction.showModal(modal);
}

async function cmdEmbed(interaction, dm = false) {
  const target = dm
    ? interaction.options.getUser('usuario')
    : interaction.options.getChannel('canal');

  if (!dm && !target?.isTextBased()) {
    return interaction.reply({ content: '❌ El canal debe ser de texto.', ephemeral: true });
  }

  const prefix = dm ? 'embeddm' : 'embed';
  const label = dm ? `DM embed a ${target.username}` : 'Enviar embed';

  const modal = new ModalBuilder()
    .setCustomId(`${prefix}_modal:${target.id}`)
    .setTitle(label);

  const titleInput = new TextInputBuilder()
    .setCustomId('titulo')
    .setLabel('Título')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('Título del embed')
    .setRequired(true)
    .setMaxLength(256);

  const descInput = new TextInputBuilder()
    .setCustomId('descripcion')
    .setLabel('Descripción')
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder('Contenido del embed...')
    .setRequired(true)
    .setMaxLength(4000);

  const colorInput = new TextInputBuilder()
    .setCustomId('color')
    .setLabel('Color (hex, ej: #FF5500)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('#5865F2')
    .setRequired(false)
    .setMaxLength(7);

  const imageInput = new TextInputBuilder()
    .setCustomId('imagen')
    .setLabel('URL de imagen (opcional)')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('https://...')
    .setRequired(false)
    .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder().addComponents(titleInput),
    new ActionRowBuilder().addComponents(descInput),
    new ActionRowBuilder().addComponents(colorInput),
    new ActionRowBuilder().addComponents(imageInput),
  );

  await interaction.showModal(modal);
}

async function handleModal(interaction) {
  if (!interaction.isModalSubmit()) return false;
  const id = interaction.customId;

  if (id.startsWith('say_modal:')) {
    const channelId = id.split(':')[1];
    const channel = interaction.guild?.channels.cache.get(channelId);
    if (!channel?.isTextBased()) {
      return interaction.reply({ content: '❌ Canal no encontrado.', ephemeral: true });
    }
    const text = interaction.fields.getTextInputValue('mensaje');
    await channel.send({ content: text });
    await interaction.reply({ content: `✅ Mensaje enviado en ${channel}.`, ephemeral: true });
    return true;
  }

  if (id.startsWith('saydm_modal:')) {
    const userId = id.split(':')[1];
    const user = await interaction.client.users.fetch(userId).catch(() => null);
    if (!user) {
      return interaction.reply({ content: '❌ Usuario no encontrado.', ephemeral: true });
    }
    const text = interaction.fields.getTextInputValue('mensaje');
    await user.send({ content: text });
    await interaction.reply({ content: `✅ Mensaje enviado por DM a **${user.tag}**.`, ephemeral: true });
    return true;
  }

  if (id.startsWith('embed_modal:')) {
    const channelId = id.split(':')[1];
    const channel = interaction.guild?.channels.cache.get(channelId);
    if (!channel?.isTextBased()) {
      return interaction.reply({ content: '❌ Canal no encontrado.', ephemeral: true });
    }
    const title = interaction.fields.getTextInputValue('titulo');
    const description = interaction.fields.getTextInputValue('descripcion');
    const color = parseColor(interaction.fields.getTextInputValue('color'));
    const image = interaction.fields.getTextInputValue('imagen') || null;
    const embed = buildCustomEmbed({ title, description, color, image });
    await channel.send({ embeds: [embed] });
    await interaction.reply({ content: `✅ Embed enviado en ${channel}.`, ephemeral: true });
    return true;
  }

  if (id.startsWith('embeddm_modal:')) {
    const userId = id.split(':')[1];
    const user = await interaction.client.users.fetch(userId).catch(() => null);
    if (!user) {
      return interaction.reply({ content: '❌ Usuario no encontrado.', ephemeral: true });
    }
    const title = interaction.fields.getTextInputValue('titulo');
    const description = interaction.fields.getTextInputValue('descripcion');
    const color = parseColor(interaction.fields.getTextInputValue('color'));
    const image = interaction.fields.getTextInputValue('imagen') || null;
    const embed = buildCustomEmbed({ title, description, color, image });
    await user.send({ embeds: [embed] });
    await interaction.reply({ content: `✅ Embed enviado por DM a **${user.tag}**.`, ephemeral: true });
    return true;
  }

  return false;
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

module.exports = { handleSlash, handleModal, STAFF_SLASH };
