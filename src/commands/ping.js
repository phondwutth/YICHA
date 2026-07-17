// คำสั่งเทสต์ตัวแรก — ยืนยันว่าบอทออนไลน์และรับคำสั่งได้
const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('เช็คว่าบอทออนไลน์อยู่ไหม'),
  async execute(interaction) {
    const sent = await interaction.reply({ content: '🏓 กำลังเช็ค...', fetchReply: true });
    const latency = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`🏓 พร้อม! ตอบสนอง ${latency}ms`);
  },
};
