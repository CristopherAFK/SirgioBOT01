const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
} = require('discord.js');
const config = require('./config');
const db = require('./database');
const audit = require('./audit');
const { isStaff } = require('./helpers');

function statusMeta(status) {
  switch (status) {
    case 'approved':
      return { color: config.colors.suggestionApproved, label: '✅ Aprobada', emoji: '✅' };
    case 'rejected':
      return { color: config.colors.suggestionRejected, label: '❌ Rechazada', emoji: '❌' };
    case 'pending':
      return { color: config.colors.suggestionPending, label: '🟠 Pendiente', emoji: '🟠' };
    default:
      return { color: config.colors.suggestion, label: '💡 Nueva sugerencia', emoji: '💡' };
  }
}

function buildPublicEmbed(suggestion) {
  const meta = statusMeta(suggestion.status);
  const embed = new EmbedBuilder()
    .setColor(meta.color)
    .setTitle(`${meta.emoji} ${suggestion.title}`)
    .setDescription(suggestion.content)
    .addFields(
      { name: '👤 Autor', value: `<@${suggestion.authorId}>`, inline: true },
      {
        name: '📊 Votos',
        value: `👍 ${suggestion.upvotes.length} · 👎 ${suggestion.downvotes.length}`,
        inline: true,
      },
      { name: '📌 Estado', value: meta.label, inline: true },
    )
    .setThumbnail(config.logoUrl)
    .setTimestamp(new Date(suggestion.createdAt));

  if (suggestion.modResponse) {
    embed.addFields({
      name: '🛡️ Respuesta del staff',
      value: suggestion.modResponse,
      inline: false,
    });
  }

  if (suggestion.modTag) {
    embed.setFooter({ text: `Revisado por ${suggestion.modTag}` });
  }

  return embed;
}

function buildPublicRow(messageId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`sug_up#${messageId}`)
        .setLabel('A favor')
        .setStyle(ButtonStyle.Success)
        .setEmoji('👍'),
      new ButtonBuilder()
        .setCustomId(`sug_down#${messageId}`)
        .setLabel('En contra')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('👎'),
      new ButtonBuilder()
        .setCustomId(`sug_votes#${messageId}`)
        .setLabel('Ver votos')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📊'),
      new ButtonBuilder()
        .setCustomId('sug_new')
        .setLabel('Nueva sugerencia')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('💡'),
    ),
  ];
}

function buildStaffEmbed(suggestion, publicMessageId) {
  return new EmbedBuilder()
    .setColor(config.colors.suggestion)
    .setTitle('📥 Sugerencia para revisar')
    .setDescription(
      `**${suggestion.title}**\n\n${suggestion.content}\n\n` +
        `🔗 [Ir a la sugerencia](https://discord.com/channels/${config.guildId}/${config.suggestionsChannelId}/${publicMessageId})`,
    )
    .addFields(
      { name: '👤 Autor', value: `<@${suggestion.authorId}>`, inline: true },
      {
        name: '📊 Votos actuales',
        value: `👍 ${suggestion.upvotes.length} · 👎 ${suggestion.downvotes.length}`,
        inline: true,
      },
    )
    .setThumbnail(config.logoUrl)
    .setTimestamp();
}

function buildStaffRow(publicMessageId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sug_staff_approve#${publicMessageId}`)
      .setLabel('Aprobar')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`sug_staff_reject#${publicMessageId}`)
      .setLabel('Rechazar')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌'),
    new ButtonBuilder()
      .setCustomId(`sug_staff_pending#${publicMessageId}`)
      .setLabel('Pendiente')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('🟠'),
  );
}

function buildSuggestModal(customId = 'sug_modal_create') {
  const modal = new ModalBuilder().setCustomId(customId).setTitle('💡 Nueva sugerencia');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('sug_title')
        .setLabel('Título de la sugerencia')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
        .setPlaceholder('Ej: Más eventos en el servidor'),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('sug_content')
        .setLabel('Describe tu sugerencia')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(2000)
        .setPlaceholder('Explica tu idea con detalle...'),
    ),
  );
  return modal;
}

async function createSuggestion(interaction) {
  if (interaction.channelId !== config.suggestionsChannelId) {
    return interaction.editReply({
      content: `❌ Solo puedes usar sugerencias en <#${config.suggestionsChannelId}>.`,
    });
  }

  const title = interaction.fields.getTextInputValue('sug_title').trim();
  const content = interaction.fields.getTextInputValue('sug_content').trim();

  const guild = interaction.guild;
  const suggestionsChannel = guild.channels.cache.get(config.suggestionsChannelId);
  const reviewsChannel = guild.channels.cache.get(config.reviewsChannelId);

  if (!suggestionsChannel || !reviewsChannel) {
    return interaction.editReply({
      content: '❌ No se encontraron los canales configurados. Avisa al staff.',
    });
  }

  const placeholder = await suggestionsChannel.send({ content: '⏳ Publicando sugerencia...' });

  const suggestion = {
    authorId: interaction.user.id,
    title,
    content,
    upvotes: [],
    downvotes: [],
    status: 'open',
    modResponse: null,
    modTag: null,
    modId: null,
    createdAt: Date.now(),
    threadId: null,
    staffMessageId: null,
  };

  const msg = await placeholder.edit({
    content: null,
    embeds: [buildPublicEmbed(suggestion)],
    components: buildPublicRow(placeholder.id),
  });

  const thread = await msg.startThread({
    name: `💬 ${title}`.slice(0, 100),
    autoArchiveDuration: 1440,
    reason: 'Hilo de discusión de sugerencia',
  });

  suggestion.threadId = thread.id;

  const staffMsg = await reviewsChannel.send({
    embeds: [buildStaffEmbed(suggestion, msg.id)],
    components: [buildStaffRow(msg.id)],
  });

  suggestion.staffMessageId = staffMsg.id;
  await db.saveSuggestion(msg.id, suggestion);

  await audit.logStaffEvent('suggestion.create', {
    actorId: interaction.user.id,
    actorTag: interaction.user.tag,
    messageId: msg.id,
    source: 'user',
    payload: { title, content, messageId: msg.id, threadId: thread.id },
  });

  await interaction.editReply({
    content: `✅ Tu sugerencia fue publicada: ${msg}`,
  });
}

async function updatePublicMessage(client, messageId) {
  const suggestion = await db.getSuggestion(messageId);
  if (!suggestion) return;

  const channel = await client.channels.fetch(config.suggestionsChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) return;

  await message.edit({
    embeds: [buildPublicEmbed(suggestion)],
    components: buildPublicRow(messageId),
  });
}

async function updateStaffMessage(client, messageId) {
  const suggestion = await db.getSuggestion(messageId);
  if (!suggestion?.staffMessageId) return;

  const channel = await client.channels.fetch(config.reviewsChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const message = await channel.messages.fetch(suggestion.staffMessageId).catch(() => null);
  if (!message) return;

  const meta = statusMeta(suggestion.status);
  const staffEmbed = buildStaffEmbed(suggestion, messageId)
    .setColor(meta.color)
    .setTitle(`${meta.emoji} Sugerencia revisada`)
    .addFields({
      name: '📌 Estado final',
      value: meta.label,
      inline: false,
    });

  if (suggestion.modResponse) {
    staffEmbed.addFields({
      name: '🛡️ Respuesta del moderador',
      value: suggestion.modResponse,
      inline: false,
    });
  }

  await message.edit({
    embeds: [staffEmbed],
    components: suggestion.status === 'open' ? [buildStaffRow(messageId)] : [],
  });
}

async function handleSlash(interaction) {
  if (interaction.commandName !== 'sugerir') return false;

  if (interaction.channelId !== config.suggestionsChannelId) {
    await interaction.reply({
      content: `❌ Este comando solo funciona en <#${config.suggestionsChannelId}>.`,
      ephemeral: true,
    });
    return true;
  }

  await interaction.showModal(buildSuggestModal('sug_modal_create'));
  return true;
}

function buildStaffResponseModal(publicMessageId, action) {
  const titles = {
    approve: '✅ Aprobar sugerencia',
    reject: '❌ Rechazar sugerencia',
    pending: '🟠 Marcar como pendiente',
  };
  const modal = new ModalBuilder()
    .setCustomId(`sug_modal_review#${action}#${publicMessageId}`)
    .setTitle(titles[action]);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('mod_response')
        .setLabel('Respuesta para el usuario')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
        .setPlaceholder('Escribe la respuesta que verá el usuario en la sugerencia...'),
    ),
  );
  return modal;
}

async function applyStaffReview(interaction, publicMessageId, action, modResponse) {
  const suggestion = await db.getSuggestion(publicMessageId);
  if (!suggestion) {
    return interaction.reply({ content: '❌ Sugerencia no encontrada.', ephemeral: true });
  }

  suggestion.status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'pending';
  suggestion.modResponse = modResponse;
  suggestion.modTag = interaction.user.tag;
  suggestion.modId = interaction.user.id;
  await db.saveSuggestion(publicMessageId, suggestion);

  await audit.logStaffEvent('suggestion.review', {
    actorId: interaction.user.id,
    actorTag: interaction.user.tag,
    messageId: publicMessageId,
    source: 'staff',
    payload: {
      action,
      status: suggestion.status,
      title: suggestion.title,
      modResponse,
      upvotes: suggestion.upvotes.length,
      downvotes: suggestion.downvotes.length,
    },
  });

  await updatePublicMessage(interaction.client, publicMessageId);
  await updateStaffMessage(interaction.client, publicMessageId);

  const msgs = {
    approve: '✅ Sugerencia aprobada con tu respuesta.',
    reject: '❌ Sugerencia rechazada con tu respuesta.',
    pending: '🟠 Sugerencia marcada como pendiente.',
  };
  await interaction.reply({ content: msgs[action], ephemeral: true });
}

async function handleModal(interaction) {
  const reviewMatch = interaction.customId.match(/^sug_modal_review#(approve|reject|pending)#(.+)$/);
  if (reviewMatch) {
    if (!isStaff(interaction.member)) {
      await interaction.reply({ content: '❌ Solo el staff.', ephemeral: true });
      return true;
    }
    const action = reviewMatch[1];
    const publicMessageId = reviewMatch[2];
    const modResponse = interaction.fields.getTextInputValue('mod_response').trim();
    await applyStaffReview(interaction, publicMessageId, action, modResponse);
    return true;
  }

  if (interaction.customId === 'sug_modal_create' || interaction.customId === 'sug_modal_button') {
    await interaction.deferReply({ ephemeral: true });
    await createSuggestion(interaction);
    return true;
  }

  return false;
}

async function handleButton(interaction) {
  const { customId } = interaction;

  if (customId === 'sug_new') {
    if (interaction.channelId !== config.suggestionsChannelId) {
      return interaction.reply({
        content: `❌ Las sugerencias solo se crean en <#${config.suggestionsChannelId}>.`,
        ephemeral: true,
      });
    }
    return interaction.showModal(buildSuggestModal('sug_modal_button'));
  }

  if (customId.startsWith('sug_up#') || customId.startsWith('sug_down#')) {
    const messageId = customId.split('#')[1];
    const isUp = customId.startsWith('sug_up#');
    const suggestion = await db.getSuggestion(messageId);

    if (!suggestion) {
      return interaction.reply({ content: '❌ Sugerencia no encontrada.', ephemeral: true });
    }

    const userId = interaction.user.id;
    suggestion.upvotes = suggestion.upvotes.filter((id) => id !== userId);
    suggestion.downvotes = suggestion.downvotes.filter((id) => id !== userId);

    if (isUp) {
      if (!suggestion.upvotes.includes(userId)) suggestion.upvotes.push(userId);
    } else if (!suggestion.downvotes.includes(userId)) {
      suggestion.downvotes.push(userId);
    }

    await db.saveSuggestion(messageId, suggestion);
    await updatePublicMessage(interaction.client, messageId);

    return interaction.reply({
      content: isUp ? '👍 Voto a favor registrado.' : '👎 Voto en contra registrado.',
      ephemeral: true,
    });
  }

  if (customId.startsWith('sug_votes#')) {
    const messageId = customId.split('#')[1];
    const suggestion = await db.getSuggestion(messageId);

    if (!suggestion) {
      return interaction.reply({ content: '❌ Sugerencia no encontrada.', ephemeral: true });
    }

    const formatList = (ids) =>
      ids.length
        ? ids
            .map((id) => `• <@${id}>`)
            .join('\n')
            .slice(0, 1000)
        : '_Nadie aún_';

    const embed = new EmbedBuilder()
      .setColor(config.colors.suggestion)
      .setTitle(`📊 Votos — ${suggestion.title}`)
      .addFields(
        {
          name: `👍 A favor (${suggestion.upvotes.length})`,
          value: formatList(suggestion.upvotes),
          inline: false,
        },
        {
          name: `👎 En contra (${suggestion.downvotes.length})`,
          value: formatList(suggestion.downvotes),
          inline: false,
        },
      );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  if (
    customId.startsWith('sug_staff_approve#') ||
    customId.startsWith('sug_staff_reject#') ||
    customId.startsWith('sug_staff_pending#')
  ) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({
        content: '❌ Solo el staff puede revisar sugerencias.',
        ephemeral: true,
      });
    }

    const publicMessageId = customId.split('#')[1];
    const suggestion = await db.getSuggestion(publicMessageId);

    if (!suggestion) {
      return interaction.reply({ content: '❌ Sugerencia no encontrada.', ephemeral: true });
    }

    let action = 'pending';
    if (customId.startsWith('sug_staff_approve#')) action = 'approve';
    if (customId.startsWith('sug_staff_reject#')) action = 'reject';

    return interaction.showModal(buildStaffResponseModal(publicMessageId, action));
  }

  return false;
}

module.exports = {
  buildSuggestModal,
  handleSlash,
  handleModal,
  handleButton,
};
