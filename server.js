require('dotenv').config()
const express = require('express')
const axios = require('axios')
const cors = require('cors')

const app = express()

app.use(cors())

app.get('/', (req, res) => {
  res.send('API de Basquete rodando 🏀')
})

// =======================
// 🔥 BUSCAR NBA COM ODDS + PROPS
// =======================
app.get('/props', async (req, res) => {
  try {
    const apiKey = process.env.SPORTS_API_KEY

    const response = await axios.get(
      'https://api.sportsgameodds.com/v2/events',
      {
        params: {
          apiKey: apiKey, // 🔥 IMPORTANTE: aqui vai como query
          leagueID: 'NBA',
          oddsAvailable: true,
          limit: 5
        }
      }
    )

    const eventos = response.data.data || []

    res.json({
      total: eventos.length,
      eventos: eventos
    })

  } catch (error) {
    console.log("ERRO REAL:", error.response?.data || error.message)

    res.status(500).json({
      erro: "Erro ao buscar eventos",
      detalhe: error.response?.data || error.message
    })
  }
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`)
})

console.log("🔥 AGORA COM ODDS + PROPS REAL")