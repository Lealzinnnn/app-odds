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
// 🔥 TESTE API NOVA (DEBUG REAL)
// =======================
app.get('/props', async (req, res) => {
  try {
    const apiKey = process.env.SPORTS_API_KEY

    console.log("API KEY:", apiKey)

    const response = await axios.get(
      'https://api.sportsgameodds.com/v1/sports',
      {
        headers: {
          'x-api-key': apiKey
        }
      }
    )

    res.json(response.data)

  } catch (error) {
    console.log("ERRO COMPLETO:", error.response?.data || error.message)

    res.status(500).json({
      erro: "Erro real da API",
      detalhe: error.response?.data || error.message
    })
  }
})

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`)
})

console.log("🔥 DEBUG TOTAL ATIVO")