const { EmbedBuilder, WebhookClient } = require('discord.js');
const { webhookId, webhookToken } = require('./config.json');

const webhookClient = new WebhookClient({ id: webhookId, token: webhookToken });

const send = (title, message) => {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(0x52c41a);

    webhookClient.send({
        content: message,
        username: 'doge-scan-bot',
        avatarURL: 'https://i.imgur.com/AfFp7pu.png',
        embeds: [embed],
    });
}

module.exports = send;