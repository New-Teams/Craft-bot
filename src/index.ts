// src/index.ts
import { Client, GatewayIntentBits, EmbedBuilder, SlashCommandBuilder, REST, Routes, AttachmentBuilder, Message } from 'discord.js';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Charger les variables d'environnement
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
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const API_URL = 'http://37.59.126.77:3001';

// Charger les presets
const PRESETS_PATH = path.join(process.cwd(), 'presets.json');
let presets: Record<string, string> = {};

if (fs.existsSync(PRESETS_PATH)) {
  presets = JSON.parse(fs.readFileSync(PRESETS_PATH, 'utf-8'));
  console.log(`📦 ${Object.keys(presets).length} presets chargés`);
} else {
  console.warn('⚠️  Fichier presets.json non trouvé, création...');
  fs.writeFileSync(PRESETS_PATH, JSON.stringify({
    "diamant": "https://minecraft.wiki/images/Diamond_JE3_BE3.png?99d00",
    "baton": "https://minecraft.wiki/images/Stick_JE1_BE1.png?1fc15"
  }, null, 2));
  presets = JSON.parse(fs.readFileSync(PRESETS_PATH, 'utf-8'));
}

// Résoudre une valeur (preset ou URL)
function resolveValue(value: string | null): string | null {
  if (!value || value === 'null') return null;
  return presets[value.toLowerCase()] || value;
}

// Stockage de la réponse en cours par channel/user
const activeGames = new Map<string, { answer: string; imageUrl: string }>();

// Normaliser les chaînes (sans accents, minuscules, espaces trimés)
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// Générer un craft avec Gemini
async function generateCraftWithGemini(): Promise<{ slots: (string | null)[], answer: string } | null> {
  try {
    const availableItems = Object.keys(presets).join(', ');
    
    const prompt = `Tu es un expert Minecraft. Génère UN craft réaliste et jouable de Minecraft.

Items disponibles: ${availableItems}

RÈGLES STRICTES:
- La grille de craft est 3x3 (9 slots numérotés de 1 à 9)
- Slot 1,2,3 = ligne du haut
- Slot 4,5,6 = ligne du milieu  
- Slot 7,8,9 = ligne du bas
- Utilise UNIQUEMENT les items de la liste ci-dessus
- Le craft DOIT être un vrai craft de Minecraft (pas inventé)
- Choisis des crafts variés: outils, armes, blocs, nourriture, redstone, etc.

Réponds UNIQUEMENT avec ce format JSON (sans markdown):
{
  "slot1": "nom_item ou null",
  "slot2": "nom_item ou null",
  "slot3": "nom_item ou null",
  "slot4": "nom_item ou null",
  "slot5": "nom_item ou null",
  "slot6": "nom_item ou null",
  "slot7": "nom_item ou null",
  "slot8": "nom_item ou null",
  "slot9": "nom_item ou null",
  "result": "Nom de l'item crafté en français"
}

Exemple pour une épée en diamant:
{
  "slot1": null,
  "slot2": "diamant",
  "slot3": null,
  "slot4": null,
  "slot5": "diamant",
  "slot6": null,
  "slot7": null,
  "slot8": "baton",
  "slot9": null,
  "result": "Épée en diamant"
}`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{ text: prompt }]
        }]
      }
    );

    const text = response.data.candidates[0].content.parts[0].text;
    
    // Extraire le JSON (enlever les backticks markdown si présents)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('❌ Gemini n\'a pas retourné de JSON valide');
      return null;
    }

    const craftData = JSON.parse(jsonMatch[0]);
    
    const slots = [
      craftData.slot1,
      craftData.slot2,
      craftData.slot3,
      craftData.slot4,
      craftData.slot5,
      craftData.slot6,
      craftData.slot7,
      craftData.slot8,
      craftData.slot9
    ];

    return {
      slots,
      answer: craftData.result
    };

  } catch (error) {
    console.error('❌ Erreur Gemini:', error);
    return null;
  }
}

// Enregistrer les commandes slash
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
    console.log('🔄 Enregistrement des commandes slash...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log('✅ Commandes enregistrées avec succès !');
  } catch (error) {
    console.error('❌ Erreur lors de l\'enregistrement des commandes:', error);
  }
}

client.once('ready', () => {
  console.log(`🤖 Bot connecté en tant que ${client.user?.tag}`);
  registerCommands();
});

// Fonction pour générer et envoyer le défi
async function generateChallenge(
  channel: any,
  toFind: string,
  slots: (string | null)[],
  isAuto: boolean = false
) {
  try {
    // Résoudre les presets/URLs
    const resolvedSlots = slots.map(resolveValue);

    // Appel API pour générer l'image
    const response = await axios.post(`${API_URL}/generate`, {
      items: resolvedSlots,
    });

    const imageUrl = `${API_URL}${response.data.url}`;

    // Télécharger l'image
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(imageResponse.data);
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'craft.png' });

    // Créer l'embed
    const embed = new EmbedBuilder()
      .setTitle(isAuto ? '🎮 Défi Craft Automatique' : '🎮 Défi Craft Minecraft')
      .setDescription('**Trouvez l\'item crafté !**\n\nSoyez le premier à donner la bonne réponse dans le chat !')
      .setImage('attachment://craft.png')
      .setColor(isAuto ? 0xe74c3c : 0x2ecc71)
      .setFooter({ text: isAuto ? 'Généré par Gemini AI' : 'Bonne chance !' })
      .setTimestamp();

    // Envoyer publiquement
    if ('send' in channel) {
      await channel.send({
        embeds: [embed],
        files: [attachment],
      });
    }
    
    // Stocker par channel
    activeGames.set(channel.id, {
      answer: normalize(toFind),
      imageUrl: imageUrl,
    });

    return true;
  } catch (error) {
    console.error('❌ Erreur génération:', error);
    return false;
  }
}

// Gestion des commandes
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'daily-item') {
    await interaction.deferReply({ ephemeral: true });

    const slots = [];
    for (let i = 1; i <= 9; i++) {
      slots.push(interaction.options.getString(`slot${i}`) || null);
    }
    const toFind = interaction.options.getString('tofind', true);

    await interaction.editReply({
      content: '✅ API OK ! Envoi de l\'image dans le channel...',
    });

    await generateChallenge(interaction.channel, toFind, slots, false);
  }
});

// Gestion des mentions du bot (craft automatique)
client.on('messageCreate', async (message: Message) => {
  if (message.author.bot) return;

  // Détecter si le bot est mentionné
  if (message.mentions.has(client.user!.id)) {
    // Vérifier s'il n'y a pas déjà un jeu actif
    if (activeGames.has(message.channelId)) {
      await message.reply('⚠️ Un défi est déjà en cours dans ce salon !');
      return;
    }

    await message.reply('🤖 Génération d\'un craft automatique avec Gemini...');

    // Générer un craft avec Gemini
    const craftData = await generateCraftWithGemini();
    
    if (!craftData) {
      await message.reply('❌ Impossible de générer un craft. Réessayez !');
      return;
    }

    // Lancer le défi
    const success = await generateChallenge(
      message.channel,
      craftData.answer,
      craftData.slots,
      true
    );

    if (!success) {
      await message.reply('❌ Erreur lors de la génération de l\'image.');
    }

    return;
  }

  // Vérifier les réponses aux défis en cours
  const game = activeGames.get(message.channelId);
  if (!game) return;

  const userAnswer = normalize(message.content);

  if (userAnswer === game.answer) {
    // Bonne réponse !
    const embed = new EmbedBuilder()
      .setTitle('🎉 Félicitations !')
      .setDescription(`**${message.author}** a trouvé la bonne réponse !\n\n✨ **Réponse:** ${message.content}`)
      .setColor(0xf1c40f)
      .setThumbnail(message.author.displayAvatarURL())
      .setFooter({ text: 'Bravo champion !' })
      .setTimestamp();

    await message.reply({ embeds: [embed] });

    // Supprimer le jeu actif
    activeGames.delete(message.channelId);
  }
});

client.login(TOKEN);
