module.exports = {
  token: process.env.DISCORD_TOKEN,
  guildId: '1212886282645147768',
  ownerId: '1476286247415578758',
  ticketCategoryId: '1228437209628020736',
  staffRoleId: '1229140504310972599',
  reviewsChannelId: '1506013832319860808',
  logoUrl:
    'https://media.discordapp.net/attachments/1420914042251509990/1430698897927307347/79794618.png?ex=6a0c48ee&is=6a0af76e&hm=25c56c52665a6ad5cc0b0ced53d3b636cd2cbb5aefdbe36ad34e386a3e1a89c4&=&format=webp&quality=lossless',
  colors: {
    panel: 0x5865f2,
    confirm: 0x57f287,
    welcome: 0x5865f2,
    faq: 0xfee75c,
    review: 0xeb459e,
    close: 0xed4245,
    rating: 0x5865f2,
  },
  categories: [
    { value: 'comandos_bots', label: 'Comandos y bots', emoji: '🤖' },
    { value: 'reportar_usuario', label: 'Reportar usuario', emoji: '🚨' },
    { value: 'lives_streams', label: 'Lives y Streams', emoji: '📺' },
    { value: 'dudas', label: 'Dudas', emoji: '❓' },
    { value: 'otros', label: 'Otros', emoji: '📁' },
  ],
  categoryDescriptions: {
    'Comandos y bots':
      'Describe tu consulta o problema relacionado con comandos y bots del servidor.',
    'Reportar usuario':
      'Describe el incidente con el mayor detalle posible. Si tienes pruebas, adjúntalas.',
    'Lives y Streams':
      'Describe tu consulta o problema relacionado con los streams de Sirgio.',
    Dudas: 'Describe tu duda con el mayor detalle posible para que el staff pueda ayudarte.',
    Otros: 'Describe tu consulta o problema con el mayor detalle posible.',
  },
};
