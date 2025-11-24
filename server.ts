import express from "express";
import { createCanvas, loadImage } from "canvas";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import fetch from "node-fetch";

const app = express();
app.use(express.json({ limit: "5mb" }));

// Results folder
const RESULT_DIR = path.join(process.cwd(), "results");
if (!fs.existsSync(RESULT_DIR)) fs.mkdirSync(RESULT_DIR);

// template
const TEMPLATE_PATH = path.join(process.cwd(), "1000026410.jpeg");

// coords 3x3
const slotCoords: [number, number][] = [
    [35, 35], [90, 35], [145, 35],
    [35, 90], [90, 90], [145, 90],
    [35, 145], [90, 145], [145, 145]
];

const slotSize = 40;

// Fonction : charger une image distante HTTPS
async function loadRemoteImage(url: string) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("Erreur téléchargement : " + url);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return await loadImage(buffer);
}

app.post("/generate", async (req, res) => {
    const items: (string | null)[] = req.body.items;

    if (!items || items.length !== 9) {
        return res.status(400).send('Array "items" de 9 éléments requis.');
    }

    try {
        // Load the template
        const craftImg = await loadImage(TEMPLATE_PATH);

        const canvas = createCanvas(craftImg.width, craftImg.height);
        const ctx = canvas.getContext("2d");

        // Draw the template
        ctx.drawImage(craftImg, 0, 0);

        // Items
        for (let i  0; i < items.length; i++) {
            const item = items[i];

            if (typeof item === "string" && item) {
                try {
                    let itemImg;

                    // HTTPS ?
                    if (item.startsWith("http")) {
                        itemImg = await loadRemoteImage(item);
                    } else {
                        const imgPath = path.isAbsolute(item)
                            ? item
                            : path.join(process.cwd(), item);
                        itemImg = await loadImage(imgPath);
                    }

                    const [x, y] = slotCoords[i];
                    ctx.drawImage(itemImg, x, y, slotSize, slotSize);
                } catch (err) {
                    console.error("Erreur image slot", i, err);
                    continue;
                }
            }
        }

        // Saving
        const id = uuidv4();
        const filePath = path.join(RESULT_DIR, `${id}.png`);

        const out = fs.createWriteStream(filePath);
        const stream = canvas.createPNGStream();
        stream.pipe(out);

        out.on("finish", () => {
            res.json({ url: `/result/${id}.png` });
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Erreur serveur au rendu de l'image.");
    }
});

// Result
app.use("/result", express.static(RESULT_DIR));

// Launching
const PORT = 3001;
app.listen(PORT, () =>
    console.log(`Craft API en ligne sur http://localhost:${PORT}`)
);
