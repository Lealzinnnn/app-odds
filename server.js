require('dotenv').config()
const express = require('express')
const axios = require('axios')
const cors = require('cors')

const app = express()
app.use(cors())

const PORT = process.env.PORT || 3000

function formatStat(stat) {
  if (stat === "player_points") return "Pontos"
  if (stat === "player_rebounds") return "Rebotes"
  if (stat === "player_assists") return "Assistências"
  return stat
}

function traduzOU(tipo) {
  return tipo === "Over" ? "Mais de" : "Menos de"
}

function fixOdd(num) {
  return Number(parseFloat(num).toFixed(2))
}

function getBestH2H(bookmakers) {
  let best = []

  (bookmakers || []).forEach(book => {
    const market = (book.markets || []).find(m => m.key === 'h2h')
    if (!market) return

    (market.outcomes || []).forEach(o => {
      best.push({
        name: o.name,
        price: o.price
      })
    })
  })

  return best
}

// TESTE
app.get('/', (req, res) => {
  res.send("API rodando 🚀")
})

app.get('/gerar', async (req, res) => {
  try {
    const apiKey = process.env.ODDS_API_KEY

    // 🔥 DEBUG API KEY
    if (!apiKey) {
      return res.status(500).json({
        erro: "API KEY não configurada no Render"
      })
    }

    const numLinhas = parseInt(req.query.numLinhas) || 3

    const oddsResponse = await axios.get(
      'https://api.the-odds-api.com/v4/sports/basketball_nba/odds/',
      {
        params: {
          apiKey,
          regions: 'us',
          markets: 'h2h',
          oddsFormat: 'decimal'
        }
      }
    )

    const jogos = (oddsResponse.data || []).slice(0, 6)

    let picks = []

    // 🟢 TIMES
    jogos.forEach(jogo => {
      const odds = getBestH2H(jogo.bookmakers)

      odds.forEach(o => {
        picks.push({
          tipo: "time",
          jogo: `${jogo.home_team} vs ${jogo.away_team}`,
          aposta: `${o.name} vence`,
          odd: fixOdd(o.price)
        })
      })
    })

    // 🔵 PLAYER PROPS
    const propsRequests = await Promise.all(
      jogos.map(jogo =>
        axios.get(
          `https://api.the-odds-api.com/v4/sports/basketball_nba/events/${jogo.id}/odds`,
          {
            params: {
              apiKey,
              regions: 'us',
              markets: 'player_points,player_rebounds,player_assists',
              oddsFormat: 'decimal'
            }
          }
        ).catch(err => {
          console.log("Erro props:", err.message)
          return null
        })
      )
    )

    propsRequests.forEach((resp, idx) => {
      if (!resp) return

      const jogo = jogos[idx]

      (resp.data.bookmakers || []).forEach(book => {
        (book.markets || []).forEach(market => {
          (market.outcomes || []).forEach(o => {

            if (!o.description || !o.point || !o.price) return

            const overUnder = o.name.toLowerCase().includes("over") ? "Over" : "Under"

            picks.push({
              tipo: "player",
              jogo: `${jogo.home_team} vs ${jogo.away_team}`,
              aposta: `${o.description} ${traduzOU(overUnder)} ${o.point} ${formatStat(market.key)}`,
              jogador: o.description,
              linha: o.point,
              odd: fixOdd(o.price)
            })

          })
        })
      })
    })

    // 🔥 GARANTE QUE NÃO QUEBRE
    if (!picks.length) {
      return res.json([])
    }

    // mistura
    picks = picks.sort(() => Math.random() - 0.5)

    const resultados = []

    for (let i = 0; i < 5; i++) {
      const combo = picks.slice(i, i + numLinhas)

      const oddTotal = combo.reduce((acc, p) => acc * p.odd, 1)

      resultados.push({
        odd_total: fixOdd(oddTotal),
        picks: combo
      })
    }

    res.json(resultados)

  } catch (error) {
    console.log("🔥 ERRO DETALHADO:", error.response?.data || error.message)

    res.status(500).json({
      erro: error.response?.data || error.message
    })
  }
})

app.listen(PORT, () => {
  console.log("Servidor rodando 🚀")
})