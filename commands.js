const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const config = require('./config');

function buildCommands() {
  const reasonChoices = config.sanctionReasons.map((r) => ({ name: r, value: r }));

  return [
    new SlashCommandBuilder().setName('sugerir').setDescription('Envía una sugerencia para el servidor').toJSON(),

    new SlashCommandBuilder()
      .setName('sancion')
      .setDescription('Aplica una sanción a un usuario')
      .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
      .addStringOption((o) =>
        o
          .setName('tipo')
          .setDescription('Tipo de sanción')
          .setRequired(true)
          .addChoices(
            { name: 'Warn', value: 'warn' },
            { name: 'Muteo', value: 'mute' },
            { name: 'Ban', value: 'ban' },
          ),
      )
      .addStringOption((o) =>
        o.setName('razon').setDescription('Categoría').setRequired(true).addChoices(...reasonChoices),
      )
      .addStringOption((o) => o.setName('detalle').setDescription('Razón detallada').setRequired(true))
      .addStringOption((o) => o.setName('tiempo').setDescription('Duración (10m, 1h, 7d) — mute/ban'))
      .addAttachmentOption((o) => o.setName('pruebas').setDescription('Capturas o pruebas'))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('removemute')
      .setDescription('Quita el mute a un usuario')
      .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('unban')
      .setDescription('Desbanea a un usuario')
      .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('warnlist')
      .setDescription('Ver warns de un usuario')
      .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('removewarn')
      .setDescription('Remover warns de un usuario')
      .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
      .addIntegerOption((o) => o.setName('cantidad').setDescription('Cantidad a remover').setMinValue(1))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('historial')
      .setDescription('Historial de sanciones de un usuario')
      .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('case')
      .setDescription('Ver detalles de un caso por ID')
      .addStringOption((o) => o.setName('id').setDescription('ID del caso (ej: 0042)').setRequired(true))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('limpiarwarns')
      .setDescription('Elimina todos los warns de un usuario')
      .addUserOption((o) => o.setName('usuario').setDescription('Usuario').setRequired(true))
      .toJSON(),

    new SlashCommandBuilder().setName('help').setDescription('Lista de comandos del bot').toJSON(),

    new SlashCommandBuilder().setName('guia').setDescription('Guía completa para el staff').toJSON(),

    new SlashCommandBuilder()
      .setName('avatar')
      .setDescription('Ver avatar de un usuario')
      .addUserOption((o) => o.setName('usuario').setDescription('Usuario'))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('banner')
      .setDescription('Ver banner de un usuario')
      .addUserOption((o) => o.setName('usuario').setDescription('Usuario'))
      .toJSON(),

    new SlashCommandBuilder()
      .setName('userinfo')
      .setDescription('Información de un usuario')
      .addUserOption((o) => o.setName('usuario').setDescription('Usuario'))
      .toJSON(),

    new SlashCommandBuilder().setName('serverinfo').setDescription('Información del servidor').toJSON(),
  ];
}

async function registerCommands(client) {
  const rest = new REST({ version: '10' }).setToken(config.token);
  await rest.put(Routes.applicationGuildCommands(client.user.id, config.guildId), {
    body: buildCommands(),
  });
  console.log('✅ Comandos slash registrados');
}

module.exports = { registerCommands };
