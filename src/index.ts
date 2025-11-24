import { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, AttachmentBuilder } from 'discord.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const TOKEN = process.env.DISCORD_TOKEN!;
const CLIENT_ID = process.env.CLIENT_ID!;
const API_URL = 'http://37.59.126.77:3001';

const activeGames = new Map<string, { answer: string; imageUrl: string }>();

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('daily-item')
      .setDescription('Créer un défi de craft Minecraft')
      .setDMPermission(true)
      .addStringOption(option =>
        option.setName('tofind').setDescription('Item à trouver (ex: Epée en diamant)').setRequired(true)
      )
      .addStringOption(option =>
        option.setName('slot1').setDescription('URL image slot 1 (ou null)').setRequired(false)
      )
      .addStringOption(option =>
        option.setName('slot2').setDescription('URL image slot 2 (ou null)').setRequired(false)
      )
      .addStringOption(option =>
        option.setName('slot3').setDescription('URL image slot 3 (ou null)').setRequired(false)
      )
      .addStringOption(option =>
        option.setName('slot4').setDescription('URL image slot 4 (ou null)').setRequired(false)
      )
      .addStringOption(option =>
        option.setName('slot5').setDescription('URL image slot 5 (ou null)').setRequired(false)
      )
      .addStringOption(option =>
        option.setName('slot6').setDescription('URL image slot 6 (ou null)').setRequired(false)
      )
      .addStringOption(option =>
        option.setName('slot7').setDescription('URL image slot 7 (ou null)').setRequired(false)
      )
      .addStringOption(option =>
        option.setName('slot8').setDescription('URL image slot 8 (ou null)').setRequired(false)
      )
      .addStringOption(option =>
        option.setName('slot9').setDescription('URL image slot 9 (ou null)').setRequired(false)
      )
      .setDefaultMemberPermissions(0)
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    console.log('Registration...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Commands OK !');
  } catch (error) {
    console.error('Commands registration failed : ', error);
  }
}

client.once('ready', () => {
  console.log(`Connected inasmuch as ${client.user?.tag}`);
  registerCommands();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'daily-item') {
    await interaction.deferReply({ ephemeral: true });

    try {
      const slots = [];
      for (let i = 1; i <= 9; i++) {
        const value = interaction.options.getString(`slot${i}`);
        if (value === 'null' || !value) {
          slots.push(null);
        } else {
          slots.push(value);
        }
      }

      const toFind = interaction.options.getString('tofind', true);

      const response = await axios.post(`${API_URL}/generate`, {
        items: slots,
      });

      const imageUrl = `${API_URL}${response.data.url}`;

      await interaction.editReply({
        content: '✅ API OK ! Envoi de l\'image dans le channel...',
      });

      const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const imageBuffer = Buffer.from(imageResponse.data);
      const attachment = new AttachmentBuilder(imageBuffer, { name: 'craft.png' });

      const embed = new EmbedBuilder()
        .setTitle('🎮 Défi Craft Minecraft')
        .setDescription('**Trouvez l\'item crafté !**\n\nSoyez le premier à donner la bonne réponse dans le chat !')
        .setImage('attachment://craft.png')
        .setColor(0x2ecc71)
        .setFooter({ text: 'Bonne chance !' })
        .setTimestamp();

      if (interaction.channel && 'send' in interaction.channel) {
        await interaction.channel.send({
          embeds: [embed],
          files: [attachment],
        });
        activeGames.set(interaction.channelId, {
          answer: normalize(toFind),
          imageUrl: imageUrl,
        });
      } // ← CORRECTION: Cette accolade fermante était manquante

    } catch (error) {
      console.error('Erreur:', error);
      await interaction.editReply({
        content: '❌ Une erreur est survenue lors de la génération de l\'image.',
      });
    }
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const game = activeGames.get(message.channelId);
  if (!game) return;

  const userAnswer = normalize(message.content);

  if (userAnswer === game.answer) {
    const embed = new EmbedBuilder()
      .setTitle('🎉 Félicitations !')
      .setDescription(`**${message.author}** a trouvé la bonne réponse !\n\n✨ **Réponse:** ${message.content}`)
      .setColor(0xf1c40f)
      .setThumbnail(message.author.displayAvatarURL())
      .setFooter({ text: 'Bravo champion !' })
      .setTimestamp();

    await message.reply({ embeds: [embed] });

    activeGames.delete(message.channelId);
  }
});

client.login(TOKEN);
