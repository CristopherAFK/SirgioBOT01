const { EmbedBuilder } = require('discord.js');
const config = require('./config');
const db = require('./database');
const { discordTs, discordTsRel, truncate } = require('./helpers');

let clientRef = null;

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']);

function formatFileSize(bytes) {
  if (!bytes) return '?';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAttachmentKind(attachment) {
  const ct = (attachment.contentType || '').toLowerCase();
  if (ct.startsWith('image/')) return 'image';
  if (ct.startsWith('video/')) return 'video';
  if (ct.startsWith('audio/')) return 'audio';
  const ext = attachment.name?.split('.').pop()?.toLowerCase();
  if (ext && IMAGE_EXT.has(ext)) return 'image';
  if (ext && VIDEO_EXT.has(ext)) return 'video';
  if (ext && AUDIO_EXT.has(ext)) return 'audio';
  return 'file';
}

const KIND_EMOJI = { image: '🖼️', video: '🎬', audio: '🎵', file: '📄' };

function describeAttachments(attachments) {
  if (!attachments?.size) return null;
  return [...attachments.values()]
    .map((a) => {
      const kind = getAttachmentKind(a);
      const emoji = KIND_EMOJI[kind] || '📄';
      const size = formatFileSize(a.size);
      const type = a.contentType || kind;
      return `${emoji} [${a.name || 'archivo'}](${a.url}) · ${type} · ${size}`;
    })
    .join('\n');
}

function serializeAttachments(attachments) {
  if (!attachments?.size) return [];
  return [...attachments.values()].map((a) => ({
    id: a.id,
    name: a.name,
    url: a.url,
    size: a.size,
    contentType: a.contentType,
    kind: getAttachmentKind(a),
  }));
}

function buildFilesFromAttachments(attachments) {
  if (!attachments?.size) return undefined;
  return [...attachments.values()].slice(0, 10).map((a) => ({
    attachment: a.url,
    name: a.name || 'archivo',
  }));
}

function applyAttachmentPreview(embed, attachments) {
  if (!attachments?.size) return;
  const firstImage = [...attachments.values()].find((a) => getAttachmentKind(a) === 'image');
  if (firstImage) embed.setImage(firstImage.url);
}

async function persistLog(event) {
  try {
    await db.saveAuditLog(event);
  } catch (err) {
    console.error('Error guardando audit log:', err.message);
  }
}

async function sendLog(channelKey, embed, options = {}) {
  const channelId = config.audit[channelKey] || config.staffLogChannelId;
  const channel = clientRef?.channels.cache.get(channelId);
  if (!channel) return;
  const payload = { embeds: [embed] };
  if (options.files?.length) payload.files = options.files;
  if (options.content) payload.content = options.content;
  await channel.send(payload).catch((err) => {
    console.error(`Audit log error [${channelKey}]:`, err.message);
  });
}

function baseEmbed(title, color, fields = []) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setTimestamp()
    .setFooter({ text: 'SirgioBOT · Auditoría' });
  if (fields.length) embed.addFields(fields);
  return embed;
}

async function logModeration(data) {
  const embed = baseEmbed(`🛡️ ${data.title}`, config.colors.auditMod, [
    { name: '📋 Caso', value: `#${data.caseId}`, inline: true },
    { name: '⚙️ Acción', value: data.action, inline: true },
    { name: '👤 Usuario', value: `<@${data.userId}>\n\`${data.userId}\``, inline: false },
    { name: '🛡️ Moderador', value: data.moderatorId ? `<@${data.moderatorId}>\n\`${data.moderatorId}\`` : 'Automod', inline: false },
    { name: '📝 Razón', value: truncate(data.reason), inline: false },
  ]);
  if (data.detail) embed.addFields({ name: '📄 Detalle', value: truncate(data.detail), inline: false });
  if (data.duration) embed.addFields({ name: '⏱️ Duración', value: data.duration, inline: true });
  if (data.proofs) embed.addFields({ name: '📎 Pruebas', value: truncate(data.proofs), inline: false });
  embed.addFields({ name: '🕐 Fecha', value: `${discordTs()} (${discordTsRel()})`, inline: false });

  await persistLog({
    category: 'moderation',
    action: `moderation.${data.action}`,
    actorId: data.moderatorId || null,
    targetId: data.userId,
    caseId: data.caseId,
    source: data.moderatorId ? 'staff' : 'automod',
    payload: {
      title: data.title,
      reason: data.reason,
      detail: data.detail,
      duration: data.duration,
      proofs: data.proofs,
    },
  });
  await sendLog('moderation', embed);
}

async function logMessageEdit(oldMsg, newMsg) {
  if (!oldMsg.guild || oldMsg.author?.bot) return;
  const contentChanged = oldMsg.content !== newMsg.content;
  const attachmentsChanged =
    (oldMsg.attachments?.size || 0) !== (newMsg.attachments?.size || 0) ||
    [...(newMsg.attachments?.values() || [])].some((a) => !oldMsg.attachments?.has(a.id));
  if (!contentChanged && !attachmentsChanged) return;

  const fields = [
    { name: '👤 Autor', value: `<@${oldMsg.author.id}> (\`${oldMsg.author.id}\`)`, inline: true },
    { name: '📍 Canal', value: `<#${oldMsg.channel.id}>`, inline: true },
    { name: '🔗 Enlace', value: `[Ir al mensaje](${newMsg.url})`, inline: true },
  ];
  if (contentChanged) {
    fields.push(
      { name: '📜 Antes', value: truncate(oldMsg.content || '_Vacío_'), inline: false },
      { name: '📝 Después', value: truncate(newMsg.content || '_Vacío_'), inline: false },
    );
  }
  const oldDesc = describeAttachments(oldMsg.attachments);
  const newDesc = describeAttachments(newMsg.attachments);
  if (oldDesc) fields.push({ name: '📎 Adjuntos antes', value: truncate(oldDesc, 900), inline: false });
  if (newDesc) fields.push({ name: '📎 Adjuntos después', value: truncate(newDesc, 900), inline: false });
  fields.push({ name: '🕐 Fecha', value: discordTs(), inline: false });

  const embed = baseEmbed('✏️ Mensaje editado', config.colors.auditMessage, fields);
  applyAttachmentPreview(embed, newMsg.attachments);
  const files = buildFilesFromAttachments(newMsg.attachments);

  await persistLog({
    category: 'message',
    action: 'message.edit',
    guildId: oldMsg.guild.id,
    actorId: oldMsg.author.id,
    actorTag: oldMsg.author.tag,
    channelId: oldMsg.channel.id,
    messageId: newMsg.id,
    payload: {
      url: newMsg.url,
      contentBefore: oldMsg.content,
      contentAfter: newMsg.content,
      attachmentsBefore: serializeAttachments(oldMsg.attachments),
      attachmentsAfter: serializeAttachments(newMsg.attachments),
    },
  });
  await sendLog('messages', embed, { files });
}

async function logMessageDelete(message) {
  if (!message.guild) return;
  const author = message.author;
  if (author?.bot) return;
  const fields = [
    { name: '👤 Autor', value: author ? `<@${author.id}> (\`${author.id}\`)` : 'Desconocido', inline: true },
    { name: '📍 Canal', value: `<#${message.channel.id}>`, inline: true },
    { name: '📝 Contenido', value: truncate(message.content || '_Sin texto_'), inline: false },
    { name: '🕐 Fecha', value: discordTs(), inline: false },
  ];
  const attDesc = describeAttachments(message.attachments);
  if (attDesc) {
    fields.splice(3, 0, { name: '📎 Adjuntos', value: truncate(attDesc, 900), inline: false });
  }
  const embed = baseEmbed('🗑️ Mensaje eliminado', config.colors.auditMessage, fields);
  applyAttachmentPreview(embed, message.attachments);
  const files = buildFilesFromAttachments(message.attachments);

  await persistLog({
    category: 'message',
    action: 'message.delete',
    guildId: message.guild.id,
    actorId: author?.id,
    actorTag: author?.tag,
    channelId: message.channel.id,
    messageId: message.id,
    payload: {
      content: message.content,
      attachments: serializeAttachments(message.attachments),
    },
  });
  await sendLog('messages', embed, { files });
}

async function logMessageAttachments(message) {
  if (!message.guild || message.author?.bot || !message.attachments?.size) return;
  const fields = [
    { name: '👤 Autor', value: `<@${message.author.id}> (\`${message.author.id}\`)`, inline: true },
    { name: '📍 Canal', value: `<#${message.channel.id}>`, inline: true },
    { name: '🔗 Enlace', value: `[Ir al mensaje](${message.url})`, inline: true },
    { name: '📎 Archivos', value: truncate(describeAttachments(message.attachments), 900), inline: false },
  ];
  if (message.content) {
    fields.push({ name: '📝 Texto', value: truncate(message.content), inline: false });
  }
  fields.push({ name: '🕐 Fecha', value: discordTs(), inline: false });

  const embed = baseEmbed('📎 Archivo enviado', config.colors.auditMessage, fields);
  applyAttachmentPreview(embed, message.attachments);
  const files = buildFilesFromAttachments(message.attachments);

  await persistLog({
    category: 'message',
    action: 'message.attachment',
    guildId: message.guild.id,
    actorId: message.author.id,
    actorTag: message.author.tag,
    channelId: message.channel.id,
    messageId: message.id,
    payload: {
      url: message.url,
      content: message.content,
      attachments: serializeAttachments(message.attachments),
    },
  });
  await sendLog('messages', embed, { files });
}

async function logMemberJoin(member) {
  const ageDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);
  await persistLog({
    category: 'member',
    action: 'member.join',
    guildId: member.guild.id,
    targetId: member.id,
    targetTag: member.user.tag,
    payload: { accountAgeDays: ageDays, memberCount: member.guild.memberCount },
  });
  await sendLog(
    'members',
    baseEmbed('📥 Usuario ingresó', config.colors.auditMember, [
      { name: '👤 Usuario', value: `${member} (\`${member.id}\`)`, inline: false },
      { name: '📅 Cuenta creada', value: `${discordTs(member.user.createdAt)} · ${ageDays} días`, inline: true },
      { name: '👥 Miembros', value: `${member.guild.memberCount}`, inline: true },
      { name: '🕐 Fecha', value: discordTs(), inline: false },
    ]),
  );
}

async function logMemberLeave(member) {
  const roles = member.roles.cache.filter((r) => r.id !== member.guild.id).map((r) => r.name).join(', ') || 'Ninguno';
  await persistLog({
    category: 'member',
    action: 'member.leave',
    guildId: member.guild.id,
    targetId: member.id,
    targetTag: member.user.tag,
    payload: { roles },
  });
  await sendLog(
    'members',
    baseEmbed('📤 Usuario salió', config.colors.auditMember, [
      { name: '👤 Usuario', value: `${member.user.tag} (\`${member.id}\`)`, inline: false },
      { name: '🎭 Roles al salir', value: truncate(roles), inline: false },
      { name: '🕐 Fecha', value: discordTs(), inline: false },
    ]),
  );
}

async function logMemberUpdate(oldMember, newMember) {
  const changes = [];
  if (oldMember.nickname !== newMember.nickname) {
    changes.push(`**Apodo:** ${oldMember.nickname || '_ninguno_'} → ${newMember.nickname || '_ninguno_'}`);
  }
  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;
  const added = newRoles.filter((r) => !oldRoles.has(r.id) && r.id !== newMember.guild.id);
  const removed = oldRoles.filter((r) => !newRoles.has(r.id) && r.id !== newMember.guild.id);
  if (added.size) changes.push(`**Roles +:** ${added.map((r) => r.name).join(', ')}`);
  if (removed.size) changes.push(`**Roles -:** ${removed.map((r) => r.name).join(', ')}`);
  if (!changes.length) return;

  await persistLog({
    category: 'member',
    action: 'member.update',
    guildId: newMember.guild.id,
    targetId: newMember.id,
    payload: {
      nicknameBefore: oldMember.nickname,
      nicknameAfter: newMember.nickname,
      rolesAdded: [...added.values()].map((r) => ({ id: r.id, name: r.name })),
      rolesRemoved: [...removed.values()].map((r) => ({ id: r.id, name: r.name })),
      changesText: changes.join('\n'),
    },
  });
  await sendLog(
    'members',
    baseEmbed('👤 Perfil actualizado', config.colors.auditMember, [
      { name: '👤 Usuario', value: `<@${newMember.id}>`, inline: false },
      { name: '📋 Cambios', value: changes.join('\n'), inline: false },
      { name: '🕐 Fecha', value: discordTs(), inline: false },
    ]),
  );
}

async function logGuildChange(title, fields, action, payload = {}) {
  await persistLog({
    category: 'guild',
    action: action || 'guild.change',
    payload: { title, fields, ...payload },
  });
  await sendLog('guild', baseEmbed(title, config.colors.auditGuild, fields));
}

async function logVoice(oldState, newState) {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot) return;

  let title = null;
  let action = null;
  const fields = [
    { name: '👤 Usuario', value: `<@${member.id}>`, inline: true },
    { name: '🕐 Fecha', value: discordTs(), inline: true },
  ];
  const payload = { userId: member.id };

  if (!oldState.channelId && newState.channelId) {
    title = '🔊 Entró a voz';
    action = 'voice.join';
    fields.unshift({ name: '📍 Canal', value: `<#${newState.channelId}>`, inline: true });
    payload.channelId = newState.channelId;
  } else if (oldState.channelId && !newState.channelId) {
    title = '🔇 Salió de voz';
    action = 'voice.leave';
    fields.unshift({ name: '📍 Canal', value: `<#${oldState.channelId}>`, inline: true });
    payload.channelId = oldState.channelId;
  } else if (oldState.channelId !== newState.channelId) {
    title = '↔️ Cambió de canal de voz';
    action = 'voice.move';
    fields.unshift(
      { name: '📍 Desde', value: `<#${oldState.channelId}>`, inline: true },
      { name: '📍 Hacia', value: `<#${newState.channelId}>`, inline: true },
    );
    payload.fromChannelId = oldState.channelId;
    payload.toChannelId = newState.channelId;
  } else if (oldState.serverMute !== newState.serverMute || oldState.serverDeaf !== newState.serverDeaf) {
    title = '🛡️ Moderación de voz';
    action = 'voice.moderation';
    fields.push({
      name: 'Estado',
      value: `Mute: ${newState.serverMute ? 'Sí' : 'No'} · Deaf: ${newState.serverDeaf ? 'Sí' : 'No'}`,
      inline: false,
    });
    payload.serverMute = newState.serverMute;
    payload.serverDeaf = newState.serverDeaf;
  } else return;

  await persistLog({
    category: 'voice',
    action,
    guildId: member.guild.id,
    targetId: member.id,
    channelId: newState.channelId || oldState.channelId,
    payload,
  });
  await sendLog('voice', baseEmbed(title, config.colors.auditVoice, fields));
}

function logCommandUsage(interaction) {
  const options = interaction.options?.data?.map((o) => ({
    name: o.name,
    value: o.value ?? o.user?.id ?? o.channel?.id,
  }));
  console.log(
    `[CMD] /${interaction.commandName} por ${interaction.user.tag} (${interaction.user.id}) en #${interaction.channel?.name}`,
  );
  persistLog({
    category: 'command',
    action: `command.${interaction.commandName}`,
    guildId: interaction.guild?.id,
    actorId: interaction.user.id,
    actorTag: interaction.user.tag,
    channelId: interaction.channel?.id,
    source: 'staff',
    payload: { commandName: interaction.commandName, options },
  });
}

function logBotError(context, error) {
  console.error(`[BOT ERROR] ${context}:`, error?.stack || error);
  persistLog({
    category: 'error',
    action: 'bot.error',
    source: 'system',
    payload: { context, message: error?.message, stack: error?.stack?.slice(0, 2000) },
  });
}

async function logStaffEvent(action, data = {}) {
  await persistLog({
    category: 'staff',
    action,
    guildId: data.guildId || config.guildId,
    actorId: data.actorId,
    actorTag: data.actorTag,
    targetId: data.targetId,
    targetTag: data.targetTag,
    channelId: data.channelId,
    messageId: data.messageId,
    caseId: data.caseId,
    source: data.source || 'staff',
    payload: data.payload || {},
  });
}

function init(client) {
  clientRef = client;

  client.on('messageCreate', (message) => {
    if (message.attachments?.size) logMessageAttachments(message);
  });

  client.on('messageUpdate', (oldMsg, newMsg) => {
    if (oldMsg.partial) oldMsg.fetch().then((m) => logMessageEdit(m, newMsg)).catch(() => {});
    else logMessageEdit(oldMsg, newMsg);
  });

  client.on('messageDelete', (msg) => {
    if (msg.partial) msg.fetch().then(logMessageDelete).catch(() => logMessageDelete(msg));
    else logMessageDelete(msg);
  });

  client.on('guildMemberAdd', logMemberJoin);
  client.on('guildMemberRemove', logMemberLeave);
  client.on('guildMemberUpdate', logMemberUpdate);

  client.on('channelCreate', (ch) => {
    if (!ch.guild) return;
    logGuildChange(
      '📁 Canal creado',
      [
        { name: 'Nombre', value: ch.name, inline: true },
        { name: 'ID', value: ch.id, inline: true },
        { name: 'Tipo', value: String(ch.type), inline: true },
      ],
      'guild.channel.create',
      { channelId: ch.id, channelName: ch.name, channelType: ch.type },
    );
  });

  client.on('channelDelete', (ch) => {
    if (!ch.guild) return;
    logGuildChange(
      '🗑️ Canal eliminado',
      [
        { name: 'Nombre', value: ch.name || 'desconocido', inline: true },
        { name: 'ID', value: ch.id, inline: true },
      ],
      'guild.channel.delete',
      { channelId: ch.id, channelName: ch.name },
    );
  });

  client.on('channelUpdate', (oldCh, newCh) => {
    if (!newCh.guild || oldCh.name === newCh.name) return;
    logGuildChange(
      '✏️ Canal renombrado',
      [
        { name: 'Antes', value: oldCh.name, inline: true },
        { name: 'Después', value: newCh.name, inline: true },
        { name: 'ID', value: newCh.id, inline: true },
      ],
      'guild.channel.rename',
      { channelId: newCh.id, nameBefore: oldCh.name, nameAfter: newCh.name },
    );
  });

  client.on('roleCreate', (role) => {
    logGuildChange(
      '🎭 Rol creado',
      [
        { name: 'Nombre', value: role.name, inline: true },
        { name: 'ID', value: role.id, inline: true },
      ],
      'guild.role.create',
      { roleId: role.id, roleName: role.name },
    );
  });

  client.on('roleDelete', (role) => {
    logGuildChange(
      '🗑️ Rol eliminado',
      [
        { name: 'Nombre', value: role.name, inline: true },
        { name: 'ID', value: role.id, inline: true },
      ],
      'guild.role.delete',
      { roleId: role.id, roleName: role.name },
    );
  });

  client.on('roleUpdate', (oldRole, newRole) => {
    const permsChanged = oldRole.permissions.bitfield !== newRole.permissions.bitfield;
    logGuildChange(
      '✏️ Rol actualizado',
      [
        { name: 'Rol', value: newRole.name, inline: true },
        { name: 'Permisos', value: permsChanged ? 'Modificados ⚠️' : 'Sin cambio', inline: true },
      ],
      'guild.role.update',
      { roleId: newRole.id, roleName: newRole.name, permsChanged },
    );
  });

  client.on('inviteCreate', (invite) => {
    logGuildChange(
      '🔗 Invitación creada',
      [
        { name: 'Código', value: invite.code, inline: true },
        { name: 'Por', value: invite.inviter ? `<@${invite.inviter.id}>` : 'Desconocido', inline: true },
        { name: 'Usos máx.', value: invite.maxUses ? String(invite.maxUses) : '∞', inline: true },
        { name: 'Expira', value: invite.expiresAt ? discordTs(invite.expiresAt) : 'Nunca', inline: false },
      ],
      'guild.invite.create',
      {
        code: invite.code,
        inviterId: invite.inviter?.id,
        maxUses: invite.maxUses,
        expiresAt: invite.expiresAt?.getTime(),
      },
    );
  });

  client.on('voiceStateUpdate', logVoice);
}

module.exports = {
  init,
  logModeration,
  logMessageDelete,
  logCommandUsage,
  logBotError,
  logStaffEvent,
};
