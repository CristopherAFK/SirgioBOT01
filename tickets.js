const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
  PermissionFlagsBits,
  AttachmentBuilder,
} = require('discord.js');
const config = require('./config');
const db = require('./database');
const audit = require('./audit');
const { isStaff } = require('./helpers');

const pendingTickets = new Map();

function getCategoryLabel(value) {
  const cat = config.categories.find((c) => c.value === value);
  return cat ? cat.label : value;
}

function buildPanelEmbed() {
  return new EmbedBuilder()
    .setColor(config.colors.panel)
    .setTitle('🎟️ LagSupport')
    .setDescription(
      '¿Tienes alguna duda respecto al servidor? ¿Alguien te está molestando y deseas reportarlo? ¿Deseas apelar una sanción injusta?\n\n' +
        'En este canal podrás abrir un ticket para hablar directamente con el staff de **Sirgio**, quienes te ayudarán con los problemas o dudas que tengas.',
    )
    .setThumbnail(config.logoUrl);
}

function buildPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_open_menu')
      .setLabel('Abrir un Ticket')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎫'),
  );
}

function buildCategorySelect() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ticket_category_select')
      .setPlaceholder('Selecciona el tipo de ayuda que necesitas')
      .addOptions(config.categories.map((c) => ({ label: c.label, value: c.value, emoji: c.emoji }))),
  );
}

function buildConfirmEmbed(categoryLabel) {
  return new EmbedBuilder()
    .setColor(config.colors.confirm)
    .setTitle('🟢 Confirmar apertura de ticket')
    .setDescription(`Has elegido: **${categoryLabel}**\n\nSi continúas se abrirá un ticket.`)
    .setThumbnail(config.logoUrl);
}

function buildConfirmRow(categoryValue) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ticket_confirm_${categoryValue}`).setLabel('Confirmar').setStyle(ButtonStyle.Success).setEmoji('✅'),
    new ButtonBuilder().setCustomId('ticket_reject').setLabel('Rechazar').setStyle(ButtonStyle.Danger).setEmoji('❌'),
    new ButtonBuilder().setCustomId('ticket_faq').setLabel('Ver preguntas frecuentes').setStyle(ButtonStyle.Secondary).setEmoji('📋'),
  );
}

function buildFaqEmbed() {
  return new EmbedBuilder()
    .setColor(config.colors.faq)
    .setTitle('📋 Preguntas Frecuentes')
    .setDescription(
      '**¿Puedo apelar una sanción?**\nR// Usa el botón "Apelar sanción" en el MD del bot o abre ticket en Apelar sanción.\n\n' +
        '**¿Que Rol necesito para mandar sugerencias?**\nR// Necesitas ser Minimo Nivel 5.\n\n' +
        '**¿Que hago si un usuario me esta molestando?**\nR// Crea un ticket "Reportar usuario".',
    )
    .setThumbnail(config.logoUrl);
}

function buildWelcomeEmbed(user, categoryLabel, ticketNumber, extra = '') {
  const desc = config.categoryDescriptions[categoryLabel] || 'Describe tu consulta con detalle.';
  return new EmbedBuilder()
    .setColor(config.colors.welcome)
    .setTitle('👋 ¡Bienvenido!')
    .setDescription(
      `${user}\n\nBienvenido a tu ticket.\n\n**Categoría:** ${categoryLabel}\n\n${desc}${extra ? `\n\n${extra}` : ''}\n\nEl Staff atenderá tu caso en breve.`,
    )
    .setFooter({ text: `Ticket #${ticketNumber}` })
    .setThumbnail(config.logoUrl);
}

function buildAttendRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_attend').setLabel('Atender ticket').setStyle(ButtonStyle.Primary).setEmoji('🛡️'),
  );
}

function buildRatingEmbed(ticketNumber, categoryLabel) {
  return new EmbedBuilder()
    .setColor(config.colors.rating)
    .setTitle('⭐ Valora tu experiencia')
    .setDescription(
      `Tu ticket **#${ticketNumber}** (${categoryLabel}) ha sido cerrado.\n\nElige una cantidad de estrellas. Después podrás dejar una opinión opcional.`,
    )
    .setThumbnail(config.logoUrl);
}

function buildRatingRow(reviewId) {
  const row = new ActionRowBuilder();
  for (let i = 1; i <= 5; i++) {
    row.addComponents(
      new ButtonBuilder().setCustomId(`ticket_rate#${reviewId}#${i}`).setLabel('⭐'.repeat(i)).setStyle(ButtonStyle.Secondary),
    );
  }
  return row;
}

async function buildTranscript(channel, ticket) {
  const allMessages = [];
  let lastId;
  while (true) {
    const options = { limit: 100 };
    if (lastId) options.before = lastId;
    const batch = await channel.messages.fetch(options);
    if (batch.size === 0) break;
    allMessages.push(...batch.values());
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }
  allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const lines = [
    'TRANSCRIPCIÓN DE TICKET — SIRGIO',
    `Ticket #${ticket.number} · ${ticket.category}`,
    `Usuario: ${ticket.userId}`,
    '',
  ];
  for (const msg of allMessages) {
    const author = msg.author?.bot ? `[BOT] ${msg.author.tag}` : msg.author?.tag || '?';
    lines.push(`[${msg.createdAt.toISOString()}] ${author}: ${msg.content || '[embed/adjunto]'}`);
  }
  return lines.join('\n');
}

async function createTicketChannel(guild, member, categoryValue, meta = {}) {
  const categoryLabel = getCategoryLabel(categoryValue);
  const ticketNumber = await db.getNextTicketNumber();
  const channelName = `ticket-${ticketNumber}-${member.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 100);

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.ticketCategoryId,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: member.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
      },
      {
        id: config.staffRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
      },
    ],
  });

  await db.saveTicket(channel.id, {
    userId: member.id,
    category: categoryLabel,
    categoryValue,
    number: ticketNumber,
    openedAt: Date.now(),
    meta,
  });

  let extra = '';
  if (meta.appealCaseId) extra = `**Apelación del caso #${meta.appealCaseId}**\nMotivo de sanción: ${meta.sanctionReason || 'N/A'}`;

  await channel.send({
    content: `${member}`,
    embeds: [buildWelcomeEmbed(member, categoryLabel, ticketNumber, extra)],
    components: [buildAttendRow()],
  });

  await audit.logStaffEvent('ticket.open', {
    actorId: member.id,
    actorTag: member.user.tag,
    channelId: channel.id,
    source: 'user',
    payload: {
      ticketNumber,
      category: categoryLabel,
      categoryValue,
      meta,
    },
  });

  return { channel, ticketNumber, categoryLabel };
}

async function closeTicket(channel, closedBy, client) {
  const ticket = await db.getTicketByChannel(channel.id);
  if (!ticket) return { ok: false, reason: 'No es un ticket activo.' };

  const user = await channel.guild.members.fetch(ticket.userId).catch(() => null);
  let transcript = '';
  try {
    transcript = await buildTranscript(channel, ticket);
  } catch {
    transcript = 'No se pudo generar la transcripción.';
  }

  const reviewId = `${channel.id}_${Date.now()}`;
  const closedAt = Date.now();
  await db.savePendingReview(reviewId, {
    userId: ticket.userId,
    category: ticket.category,
    ticketNumber: ticket.number,
    channelId: channel.id,
    channelName: channel.name,
    attendedBy: ticket.attendedBy || null,
    attendedByTag: ticket.attendedByTag || null,
    closedBy: closedBy.id,
    closedByTag: closedBy.user.tag,
    closedAt,
    transcript,
    submitted: false,
  });
  await db.deleteTicket(channel.id);

  await audit.logStaffEvent('ticket.close', {
    actorId: closedBy.id,
    actorTag: closedBy.user.tag,
    targetId: ticket.userId,
    channelId: channel.id,
    source: 'staff',
    payload: {
      reviewId,
      ticketNumber: ticket.number,
      category: ticket.category,
      attendedBy: ticket.attendedBy,
      attendedByTag: ticket.attendedByTag,
      closedAt,
    },
  });

  if (user) {
    try {
      await user.send({
        embeds: [buildRatingEmbed(ticket.number, ticket.category)],
        components: [buildRatingRow(reviewId)],
      });
    } catch {
      /* MD cerrados */
    }
  }

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(config.colors.close)
        .setTitle('🔒 Ticket cerrado')
        .setDescription(`Cerrado por **${closedBy.user.tag}**. El canal se eliminará pronto.`),
    ],
  });
  setTimeout(() => channel.delete().catch(() => {}), 5000);
  return { ok: true };
}

async function sendReviewToChannel(client, review, reviewId) {
  const guild = client.guilds.cache.get(config.guildId);
  const reviewsChannel = guild?.channels.cache.get(config.reviewsChannelId);
  if (!reviewsChannel) return;

  const stars = '⭐'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
  const embed = new EmbedBuilder()
    .setColor(config.colors.review)
    .setTitle('📝 Nueva reseña de ticket')
    .addFields(
      { name: '🎫 Ticket', value: `#${review.ticketNumber}`, inline: true },
      { name: '📂 Categoría', value: review.category, inline: true },
      { name: '⭐ Puntuación', value: `${stars} (${review.rating}/5)`, inline: true },
      { name: '👤 Usuario', value: `<@${review.userId}>`, inline: false },
      { name: '💬 Opinión', value: review.opinion || '_Sin comentario_', inline: false },
    )
    .setThumbnail(config.logoUrl);

  const files = review.transcript
    ? [new AttachmentBuilder(Buffer.from(review.transcript, 'utf8'), { name: `transcript-${review.ticketNumber}.txt` })]
    : [];

  await reviewsChannel.send({
    embeds: [embed],
    files,
    content: files.length ? '📄 Transcripción adjunta.' : undefined,
  });
}

async function handleMessage(message) {
  const content = message.content.trim().toLowerCase();
  if (content === '!tpanel') {
    if (!isStaff(message.member)) return message.reply({ content: '❌ Solo el staff puede publicar el panel.' });
    await message.channel.send({ embeds: [buildPanelEmbed()], components: [buildPanelRow()] });
    if (message.deletable) await message.delete().catch(() => {});
    return true;
  }
  if (content === '!cerrar') {
    if (!isStaff(message.member)) return message.reply({ content: '❌ Solo moderadores.' });
    const ticket = await db.getTicketByChannel(message.channel.id);
    if (!ticket) return message.reply({ content: '❌ No es un ticket activo.' });
    await closeTicket(message.channel, message.member, message.client);
    return true;
  }
  return false;
}

async function handleButton(interaction, client) {
  const { customId } = interaction;

  if (customId === 'ticket_open_menu') {
    return interaction.reply({ content: '📂 Elige la categoría:', components: [buildCategorySelect()], ephemeral: true });
  }
  if (customId === 'ticket_reject') {
    return interaction.update({ content: '❌ Cancelado.', embeds: [], components: [] });
  }
  if (customId === 'ticket_faq') {
    return interaction.reply({ embeds: [buildFaqEmbed()], ephemeral: true });
  }
  if (customId.startsWith('ticket_confirm_')) {
    const categoryValue = customId.replace('ticket_confirm_', '');
    if (await db.userHasOpenTicket(interaction.user.id)) {
      return interaction.reply({ content: '⚠️ Ya tienes un ticket abierto.', ephemeral: true });
    }
    await interaction.deferUpdate();
    const { channel, ticketNumber } = await createTicketChannel(interaction.guild, interaction.member, categoryValue);
    return interaction.editReply({ content: `✅ Ticket creado: ${channel} — **#${ticketNumber}**`, embeds: [], components: [] });
  }
  if (customId === 'ticket_attend') {
    if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Solo staff.', ephemeral: true });
    const ticket = await db.getTicketByChannel(interaction.channel.id);
    if (!ticket) return interaction.reply({ content: '❌ Ticket inválido.', ephemeral: true });
    await db.saveTicket(interaction.channel.id, {
      ...ticket,
      attendedBy: interaction.user.id,
      attendedByTag: interaction.user.tag,
      attendedAt: Date.now(),
    });
    await audit.logStaffEvent('ticket.attend', {
      actorId: interaction.user.id,
      actorTag: interaction.user.tag,
      targetId: ticket.userId,
      channelId: interaction.channel.id,
      source: 'staff',
      payload: { ticketNumber: ticket.number, category: ticket.category },
    });
    const user = await interaction.guild.members.fetch(ticket.userId).catch(() => null);
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(config.colors.confirm)
          .setDescription(`🛡️ **${interaction.user.tag}** atenderá este ticket.\n${user || `<@${ticket.userId}>`}`),
      ],
    });
    return true;
  }

  if (customId.startsWith('appeal_sanction#')) {
    const caseId = customId.split('#')[1];
    const modCase = await db.getModCase(caseId);
    if (!modCase || modCase.userId !== interaction.user.id) {
      return interaction.reply({ content: '❌ No puedes apelar esta sanción.', ephemeral: true });
    }
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`appeal_confirm#${caseId}`).setLabel('Confirmar apelación').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('appeal_cancel').setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
    );
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(config.colors.panel)
          .setTitle('⚖️ Apelar sanción')
          .setDescription(
            `¿Deseas abrir un ticket para apelar el caso **#${caseId}**?\n\n` +
              `**Tipo:** ${modCase.type}\n**Motivo:** ${modCase.reasonCategory}\n\nSe abrirá un ticket de **Apelar sanción**.`,
          ),
      ],
      components: [row],
      ephemeral: true,
    });
  }

  if (customId.startsWith('appeal_confirm#')) {
    const caseId = customId.split('#')[1];
    const modCase = await db.getModCase(caseId);
    if (!modCase || modCase.userId !== interaction.user.id) {
      return interaction.reply({ content: '❌ Apelación no válida.', ephemeral: true });
    }
    if (await db.userHasOpenTicket(interaction.user.id)) {
      return interaction.update({ content: '⚠️ Ya tienes un ticket abierto.', embeds: [], components: [] });
    }
    const { channel, ticketNumber } = await createTicketChannel(interaction.guild, interaction.member, 'apelar_sancion', {
      appealCaseId: caseId,
      sanctionReason: `${modCase.reasonCategory}: ${modCase.reasonDetail}`,
    });
    return interaction.update({
      content: `✅ Ticket de apelación creado: ${channel} — **#${ticketNumber}** (Caso #${caseId})`,
      embeds: [],
      components: [],
    });
  }

  if (customId === 'appeal_cancel') {
    return interaction.update({ content: 'Apelación cancelada.', embeds: [], components: [] });
  }

  const rateMatch = customId.match(/^ticket_rate#(.+)#(\d)$/);
  if (rateMatch) {
    const reviewId = rateMatch[1];
    const rating = parseInt(rateMatch[2], 10);
    const review = await db.getPendingReview(reviewId);
    if (!review || review.submitted || review.userId !== interaction.user.id) {
      return interaction.reply({ content: '❌ Valoración no disponible.', ephemeral: true });
    }
    await db.updatePendingReview(reviewId, { rating });
    const modal = new ModalBuilder().setCustomId(`ticket_opinion#${reviewId}`).setTitle('💬 Opinión opcional');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('opinion_text').setLabel('Comentario (opcional)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000),
      ),
    );
    return interaction.showModal(modal);
  }

  return false;
}

async function handleSelect(interaction) {
  if (interaction.customId !== 'ticket_category_select') return false;
  const categoryValue = interaction.values[0];
  await interaction.update({
    embeds: [buildConfirmEmbed(getCategoryLabel(categoryValue))],
    components: [buildConfirmRow(categoryValue)],
  });
  return true;
}

async function handleModal(interaction, client) {
  if (!interaction.customId.startsWith('ticket_opinion#')) return false;
  const reviewId = interaction.customId.replace('ticket_opinion#', '');
  const review = await db.getPendingReview(reviewId);
  if (!review || review.submitted || review.userId !== interaction.user.id || !review.rating) {
    return interaction.reply({ content: '❌ No válido.', ephemeral: true });
  }
  review.opinion = interaction.fields.getTextInputValue('opinion_text')?.trim() || null;
  review.submitted = true;
  const ratedAt = Date.now();
  await db.saveTicketReview({
    reviewId,
    guildId: config.guildId,
    ticketNumber: review.ticketNumber,
    userId: review.userId,
    category: review.category,
    channelId: review.channelId,
    channelName: review.channelName,
    attendedBy: review.attendedBy || null,
    attendedByTag: review.attendedByTag || null,
    closedBy: review.closedBy,
    closedByTag: review.closedByTag,
    closedAt: review.closedAt,
    ratedAt,
    rating: review.rating,
    opinion: review.opinion,
    transcript: review.transcript,
  });
  await audit.logStaffEvent('ticket.review', {
    actorId: review.userId,
    targetId: review.closedBy,
    source: 'user',
    payload: {
      reviewId,
      ticketNumber: review.ticketNumber,
      rating: review.rating,
      opinion: review.opinion,
      closedBy: review.closedBy,
      closedByTag: review.closedByTag,
      attendedBy: review.attendedBy,
      attendedByTag: review.attendedByTag,
      ratedAt,
    },
  });
  await sendReviewToChannel(client, review, reviewId);
  await db.deletePendingReview(reviewId);
  await interaction.reply({ content: '✅ ¡Gracias por tu valoración!', ephemeral: true });
  return true;
}

module.exports = {
  handleMessage,
  handleButton,
  handleSelect,
  handleModal,
  createTicketChannel,
  closeTicket,
  buildPanelEmbed,
  buildPanelRow,
};
