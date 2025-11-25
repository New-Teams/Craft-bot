import { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, AttachmentBuilder } from 'discord.js';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load env
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

// Load presets
const PRESETS_PATH = path.join(process.cwd(), 'presets.json');
let presets: Record<string, string> = {};

if (fs.existsSync(PRESETS_PATH)) {
  presets = JSON.parse(fs.readFileSync(PRESETS_PATH, 'utf-8'));
  console.log(`${Object.keys(presets).length} presets loaded`);
} else {
  console.warn('File presets.json not found, generating...');
  fs.writeFileSync(PRESETS_PATH, JSON.stringify({
    "diamant": "https://minecraft.wiki/images/Diamond_JE3_BE3.png?99d00",
    "baton": "https://minecraft.wiki/images/Stick_JE1_BE1.png?1fc15"
  }, null, 2));
  presets = JSON.parse(fs.readFileSync(PRESETS_PATH, 'utf-8'));
}

// Resolve value
function resolveValue(value: string | null): string | null {
  if (!value || value === 'null') return null;
  return presets[value.toLowerCase()] || value;
}
const activeGames = new Map<string, { answer: string; imageUrl: string }>();

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Register commands
async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('daily-item')
      .setDescription('Créer un défi de craft Minecraft')
      .addStringOption(option =>
        option.setName('tofind').setDescription('Item à trouver (ex: Epée en diamant)').setRequired(true)
      )
      .addStringOption(option =>
        option.setName('slot1').setDescription('URL/preset slot 1 (ou null)').setRequired(false)
      )
      .addStringOption(option =>
        option.setName('slot2').setDescription('URL/preset slot 2 (ou null)').setRequired(false)
      )
      .addStringOption(option =>
        option.setName('slot3').setDescription('URL/preset slot 3 (ou null)').setRequired(false)
      )
      .addStringOption(option =>
        option.setName('slot4').setDescription('URL/preset slot 4 (ou null)').setRequired(false)
      )
      .addStringOption(option =>
        option.setName('slot5').setDescription('URL/preset slot 5 (ou null)').setRequired(false)
      )
      .addStringOption(option =>
        option.setName('slot6').setDescription('URL/preset slot 6 (ou null)').setRequired(false)
      )
      .addStringOption(option =>
        option.setName('slot7').setDescription('URL/preset slot 7 (ou null)').setRequired(false)
      )
      .addStringOption(option =>
        option.setName('slot8').setDescription('URL/preset slot 8 (ou null)').setRequired(false)
      )
      .addStringOption(option =>
        option.setName('slot9').setDescription('URL/preset slot 9 (ou null)').setRequired(false)
      )
      .setDefaultMemberPermissions(0)
  ].map(command => command.toJSON());

  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    console.log('Registering commands...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('Commands OK !');
  } catch (error) {
    console.error('Failed to load commands', error);
  }
}

client.once('ready', () => {
  console.log(`Connected inasmuch as  ${client.user?.tag}`);
  registerCommands();
});

// Generate challengs
async function generateChallenge(
  interaction: any,
  toFind: string,
  slots: (string | null)[]
) {
  try {
    const resolvedSlots = slots.map(resolveValue);

    // Call api
    const response = await axios.post(`${API_URL}/generate`, {
      items: resolvedSlots,
    });

    const imageUrl = `${API_URL}${response.data.url}`;

    // Confirmation éphémère
    await interaction.editReply({
      content: '✅ API OK ! Envoi de l\'image dans le channel...',
    });

    // Download image
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(imageResponse.data);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'craft.png' });

    // Embeding
    const embed = new EmbedBuilder()
      .setTitle('🎮 Défi Craft Minecraft')
      .setDescription('**Trouvez l\'item crafté !**\n\nSoyez le premier à donner la bonne réponse dans le chat !')
      .setImage('attachment://craft.png')
      .setColor(0x2ecc71)
      .setFooter({ text: 'Bonne chance !' })
      .setTimestamp();

    // Send embed
    if (interaction.channel && 'send' in interaction.channel) {
      await interaction.channel.send({
        embeds: [embed],
        files: [attachment],
      });
    }
    
    // Stock
    activeGames.set(interaction.channelId, {
      answer: normalize(toFind),
      imageUrl: imageUrl,
    });
  } catch (error) {
    console.error('Erreur:', error);
    await interaction.editReply({
      content: '❌ Une erreur est survenue lors de la génération de l\'image.',
    });
  }
}

// Commands manager
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'daily-item') {
    await interaction.deferReply({ ephemeral: true });

    const slots = [];
    for (let i = 1; i <= 9; i++) {
      slots.push(interaction.options.getString(`slot${i}`) || null);
    }
    const toFind = interaction.options.getString('tofind', true);

    await generateChallenge(interaction, toFind, slots);
  }
});

// Messages manager
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

    // Delete the active game
    activeGames.delete(message.channelId);
  }
});

client.login(TOKEN);
